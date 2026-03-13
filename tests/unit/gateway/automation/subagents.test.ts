import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getHaloDir: vi.fn(() => ''),
  getGatewayProcessStatus: vi.fn(() => ({
    configuredMode: 'external',
    state: 'external-observed',
    managedByCurrentProcess: false,
    owner: 'external-gateway',
    filePath: '/tmp/gateway/process.json',
    pid: 5151,
    startedAt: '2026-03-12T08:00:00.000Z',
    lastHeartbeatAt: '2026-03-12T08:00:05.000Z',
    heartbeatAgeMs: 10,
    lastError: null
  })),
  getLegacySubagentRun: vi.fn(() => null),
  listLegacySubagentRunsForConversation: vi.fn(() => []),
  listLegacySubagentRunsBySessionKey: vi.fn(() => []),
  waitForLegacyConversationSubagents: vi.fn(async () => []),
  waitForLegacySubagentRun: vi.fn(async () => null),
  killLegacySubagentRun: vi.fn((runId: string) => ({
    runId,
    parentConversationId: 'conv-legacy',
    parentSpaceId: 'space-1',
    childConversationId: 'subagent-legacy',
    status: 'killed',
    task: 'Legacy kill',
    spawnedAt: '2026-03-12T08:00:00.000Z'
  })),
  acknowledgeLegacySubagentRuns: vi.fn(() => {}),
  initializeLegacySubagentRuntime: vi.fn(() => {}),
  getLegacySubagentRuntimeStatus: vi.fn(() => ({
    registryLoaded: true,
    totalRuns: 0,
    activeRuns: 0,
    waitingAnnouncementRuns: 0
  })),
  shutdownLegacySubagentRuntime: vi.fn(() => {}),
  canDelegateGatewayCommands: vi.fn(() => true),
  executeGatewayCommand: vi.fn(async () => ({
    runId: 'external-kill',
    parentConversationId: 'conv-external',
    parentSpaceId: 'space-1',
    childConversationId: 'subagent-external',
    status: 'killed',
    task: 'External kill',
    spawnedAt: '2026-03-12T08:00:00.000Z'
  })),
  findPreferredGatewaySessionByConversationId: vi.fn(() => null),
  resolveSubagentGatewayRoute: vi.fn((run) => ({
    sessionKey: `subagent:${run.runId}`,
    mainSessionKey: 'main:conv-1'
  }))
}))

vi.mock('../../../../src/main/services/config.service', () => ({
  getHaloDir: mocks.getHaloDir
}))

vi.mock('../../../../src/gateway/process', () => ({
  getGatewayProcessStatus: mocks.getGatewayProcessStatus
}))

vi.mock('../../../../src/main/services/agent', () => ({
  acknowledgeSubagentRuns: mocks.acknowledgeLegacySubagentRuns,
  getSubagentRun: mocks.getLegacySubagentRun,
  getSubagentRuntimeStatus: mocks.getLegacySubagentRuntimeStatus,
  initializeSubagentRuntime: mocks.initializeLegacySubagentRuntime,
  killSubagentRun: mocks.killLegacySubagentRun,
  listSubagentRunsBySessionKey: mocks.listLegacySubagentRunsBySessionKey,
  listSubagentRunsForConversation: mocks.listLegacySubagentRunsForConversation,
  waitForConversationSubagents: mocks.waitForLegacyConversationSubagents,
  waitForSubagentRun: mocks.waitForLegacySubagentRun,
  shutdownSubagentRuntime: mocks.shutdownLegacySubagentRuntime
}))

vi.mock('../../../../src/gateway/commands', () => ({
  canDelegateGatewayCommands: mocks.canDelegateGatewayCommands,
  executeGatewayCommand: mocks.executeGatewayCommand
}))

vi.mock('../../../../src/gateway/sessions/store', () => ({
  findPreferredGatewaySessionByConversationId: mocks.findPreferredGatewaySessionByConversationId
}))

vi.mock('../../../../src/gateway/sessions/automation', () => ({
  resolveSubagentGatewayRoute: mocks.resolveSubagentGatewayRoute
}))

import {
  acknowledgeGatewaySubagentRuns,
  getGatewaySubagentRun,
  killGatewaySubagentRun,
  listGatewaySubagentRunsBySessionKey,
  listGatewaySubagentRunsForConversation,
  waitForGatewayConversationSubagents,
  waitForGatewaySubagentRun
} from '../../../../src/gateway/automation/subagents'

describe('gateway automation subagent observer reads', () => {
  const haloDir = join(tmpdir(), `skillsfan-subagents-observer-${process.pid}`)

  beforeEach(() => {
    vi.clearAllMocks()
    rmSync(haloDir, { recursive: true, force: true })
    mkdirSync(join(haloDir, 'subagents', 'space-1'), { recursive: true })
    mocks.getHaloDir.mockReturnValue(haloDir)
    mocks.getLegacySubagentRun.mockReturnValue(null)
    mocks.canDelegateGatewayCommands.mockReturnValue(true)
    mocks.getGatewayProcessStatus.mockReturnValue({
      configuredMode: 'external',
      state: 'external-observed',
      managedByCurrentProcess: false,
      owner: 'external-gateway',
      filePath: '/tmp/gateway/process.json',
      pid: 5151,
      startedAt: '2026-03-12T08:00:00.000Z',
      lastHeartbeatAt: '2026-03-12T08:00:05.000Z',
      heartbeatAgeMs: 10,
      lastError: null
    })
    mocks.findPreferredGatewaySessionByConversationId.mockReturnValue({
      sessionKey: 'parent:conv-1',
      mainSessionKey: 'main:conv-1'
    })

    writeFileSync(join(haloDir, 'subagents', 'space-1', 'runs.json'), JSON.stringify({
      version: 1,
      savedAt: '2026-03-12T08:10:00.000Z',
      runs: [
        {
          runId: 'run-1',
          parentConversationId: 'conv-1',
          parentSpaceId: 'space-1',
          childConversationId: 'subagent-1',
          status: 'running',
          task: 'Inspect logs',
          spawnedAt: '2026-03-12T08:00:00.000Z',
          latestSummary: 'Looking at logs'
        },
        {
          runId: 'run-2',
          parentConversationId: 'conv-2',
          parentSpaceId: 'space-1',
          childConversationId: 'subagent-2',
          status: 'completed',
          task: 'Write summary',
          spawnedAt: '2026-03-12T07:55:00.000Z',
          resultSummary: 'Done'
        }
      ]
    }))
  })

  afterEach(() => {
    rmSync(haloDir, { recursive: true, force: true })
  })

  it('reads subagent run detail from persisted registries when observing an external gateway process', () => {
    expect(getGatewaySubagentRun('run-1')).toMatchObject({
      runId: 'run-1',
      parentConversationId: 'conv-1',
      latestSummary: 'Looking at logs'
    })
  })

  it('lists conversation and session scoped runs from persisted registries', () => {
    expect(listGatewaySubagentRunsForConversation('conv-1', { includeCompleted: false })).toEqual([
      expect.objectContaining({ runId: 'run-1' })
    ])

    expect(listGatewaySubagentRunsBySessionKey('main:conv-1')).toEqual([
      expect.objectContaining({ runId: 'run-1' }),
      expect.objectContaining({ runId: 'run-2' })
    ])
  })

  it('falls back to legacy runtime reads when the current process owns the gateway', () => {
    mocks.getGatewayProcessStatus.mockReturnValue({
      configuredMode: 'external',
      state: 'external-observed',
      managedByCurrentProcess: true,
      owner: 'external-gateway',
      filePath: '/tmp/gateway/process.json',
      pid: process.pid,
      startedAt: '2026-03-12T08:00:00.000Z',
      lastHeartbeatAt: '2026-03-12T08:00:05.000Z',
      heartbeatAgeMs: 10,
      lastError: null
    })
    mocks.getLegacySubagentRun.mockReturnValue({
      runId: 'legacy-run',
      parentConversationId: 'conv-legacy',
      parentSpaceId: 'space-1',
      childConversationId: 'subagent-legacy',
      status: 'running',
      task: 'Legacy',
      spawnedAt: '2026-03-12T08:00:00.000Z'
    })

    expect(getGatewaySubagentRun('legacy-run')).toEqual(expect.objectContaining({
      runId: 'legacy-run'
    }))
    expect(mocks.getLegacySubagentRun).toHaveBeenCalledWith('legacy-run')
  })

  it('acknowledges runs through the legacy runtime helper', () => {
    acknowledgeGatewaySubagentRuns(['run-1', 'run-2'])

    expect(mocks.acknowledgeLegacySubagentRuns).toHaveBeenCalledWith(['run-1', 'run-2'])
  })

  it('waits for terminal runs from persisted registries in observer mode', async () => {
    const run = await waitForGatewaySubagentRun('run-2', 1000)

    expect(run).toEqual(expect.objectContaining({
      runId: 'run-2',
      status: 'completed'
    }))
  })

  it('falls back to legacy wait helpers when the current process owns the gateway', async () => {
    mocks.getGatewayProcessStatus.mockReturnValue({
      configuredMode: 'external',
      state: 'external-observed',
      managedByCurrentProcess: true,
      owner: 'external-gateway',
      filePath: '/tmp/gateway/process.json',
      pid: process.pid,
      startedAt: '2026-03-12T08:00:00.000Z',
      lastHeartbeatAt: '2026-03-12T08:00:05.000Z',
      heartbeatAgeMs: 10,
      lastError: null
    })
    mocks.waitForLegacySubagentRun.mockResolvedValue({
      runId: 'legacy-wait',
      parentConversationId: 'conv-legacy',
      parentSpaceId: 'space-1',
      childConversationId: 'subagent-legacy',
      status: 'completed',
      task: 'Legacy wait',
      spawnedAt: '2026-03-12T08:00:00.000Z'
    })
    mocks.waitForLegacyConversationSubagents.mockResolvedValue([{
      runId: 'legacy-conv',
      parentConversationId: 'conv-legacy',
      parentSpaceId: 'space-1',
      childConversationId: 'subagent-legacy',
      status: 'completed',
      task: 'Legacy conversation wait',
      spawnedAt: '2026-03-12T08:00:00.000Z'
    }])

    await expect(waitForGatewaySubagentRun('legacy-wait')).resolves.toEqual(
      expect.objectContaining({ runId: 'legacy-wait' })
    )
    await expect(waitForGatewayConversationSubagents('conv-legacy')).resolves.toEqual([
      expect.objectContaining({ runId: 'legacy-conv' })
    ])
  })

  it('delegates kill through the external gateway command path when the run is not local', async () => {
    const run = await killGatewaySubagentRun('run-external')

    expect(mocks.executeGatewayCommand).toHaveBeenCalledWith('subagent.kill', {
      runId: 'run-external'
    })
    expect(run).toEqual(expect.objectContaining({
      runId: 'external-kill'
    }))
  })

  it('keeps kill on the legacy runtime path when the run is local', async () => {
    mocks.getGatewayProcessStatus.mockReturnValue({
      configuredMode: 'external',
      state: 'external-observed',
      managedByCurrentProcess: true,
      owner: 'external-gateway',
      filePath: '/tmp/gateway/process.json',
      pid: process.pid,
      startedAt: '2026-03-12T08:00:00.000Z',
      lastHeartbeatAt: '2026-03-12T08:00:05.000Z',
      heartbeatAgeMs: 10,
      lastError: null
    })
    mocks.getLegacySubagentRun.mockReturnValue({
      runId: 'run-local',
      parentConversationId: 'conv-local',
      parentSpaceId: 'space-1',
      childConversationId: 'subagent-local',
      status: 'running',
      task: 'Local kill',
      spawnedAt: '2026-03-12T08:00:00.000Z'
    })

    const run = await killGatewaySubagentRun('run-local')

    expect(mocks.killLegacySubagentRun).toHaveBeenCalledWith('run-local')
    expect(mocks.executeGatewayCommand).not.toHaveBeenCalled()
    expect(run).toEqual(expect.objectContaining({
      runId: 'run-local'
    }))
  })
})
