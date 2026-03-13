import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  acknowledgeGatewaySubagentRuns: vi.fn(() => {}),
  killGatewaySubagentRun: vi.fn(async () => ({
    runId: 'kill-run',
    status: 'killed',
    parentConversationId: 'conversation-1',
    parentSpaceId: 'space-1',
    childConversationId: 'subagent-kill',
    task: 'Kill me',
    spawnedAt: '2026-03-12T08:00:00.000Z'
  })),
  getGatewaySubagentRun: vi.fn(() => ({
    runId: 'info-run',
    status: 'completed',
    parentConversationId: 'conversation-1',
    parentSpaceId: 'space-1',
    childConversationId: 'subagent-info',
    task: 'Info me',
    spawnedAt: '2026-03-12T08:00:00.000Z'
  })),
  listGatewaySubagentRunsForConversation: vi.fn(() => ([
    {
      runId: 'list-run',
      status: 'completed',
      parentConversationId: 'conversation-1',
      parentSpaceId: 'space-1',
      childConversationId: 'subagent-list',
      task: 'List me',
      spawnedAt: '2026-03-12T08:00:00.000Z'
    }
  ])),
  waitForGatewaySubagentRun: vi.fn(async () => ({
    runId: 'wait-run',
    status: 'completed',
    parentConversationId: 'conversation-1',
    parentSpaceId: 'space-1',
    childConversationId: 'subagent-wait',
    task: 'Wait me',
    spawnedAt: '2026-03-12T08:00:00.000Z'
  })),
  waitForGatewayConversationSubagents: vi.fn(async () => ([
    {
      runId: 'wait-conversation-run',
      status: 'completed',
      parentConversationId: 'conversation-1',
      parentSpaceId: 'space-1',
      childConversationId: 'subagent-wait-conversation',
      task: 'Wait conversation',
      spawnedAt: '2026-03-12T08:00:00.000Z'
    }
  ]))
}))

vi.mock('../../../../src/main/services/agent/subagent/runtime', () => ({
  acknowledgeSubagentRuns: vi.fn(),
  killSubagentRun: vi.fn()
}))

vi.mock('../../../../src/gateway/automation/subagents', () => ({
  acknowledgeGatewaySubagentRuns: mocks.acknowledgeGatewaySubagentRuns,
  getGatewaySubagentRun: mocks.getGatewaySubagentRun,
  killGatewaySubagentRun: mocks.killGatewaySubagentRun,
  listGatewaySubagentRunsForConversation: mocks.listGatewaySubagentRunsForConversation,
  waitForGatewayConversationSubagents: mocks.waitForGatewayConversationSubagents,
  waitForGatewaySubagentRun: mocks.waitForGatewaySubagentRun
}))

import { createLocalToolsMcpServer } from '../../../../src/main/services/local-tools/sdk-mcp-server'

function getToolHandler(name: string) {
  const server = createLocalToolsMcpServer({
    workDir: '/workspace',
    spaceId: 'space-1',
    conversationId: 'conversation-1'
  }) as any

  return server.instance._registeredTools[name].handler as (args: Record<string, unknown>) => Promise<unknown>
}

describe('createLocalToolsMcpServer subagents tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses gateway subagent facade for list/info/wait actions', async () => {
    const handler = getToolHandler('subagents')

    const listResult = await handler({ action: 'list', includeCompleted: true, limit: 5 }) as {
      content: Array<{ text: string }>
    }
    const infoResult = await handler({ action: 'info', runId: 'info-run' }) as {
      content: Array<{ text: string }>
    }
    const waitResult = await handler({ action: 'wait', runId: 'wait-run', timeoutMs: 5000 }) as {
      content: Array<{ text: string }>
    }

    expect(mocks.listGatewaySubagentRunsForConversation).toHaveBeenCalledWith('conversation-1', {
      includeCompleted: true,
      limit: 5
    })
    expect(mocks.getGatewaySubagentRun).toHaveBeenCalledWith('info-run')
    expect(mocks.waitForGatewaySubagentRun).toHaveBeenCalledWith('wait-run', 5000)

    expect(JSON.parse(listResult.content[0].text).runs[0].runId).toBe('list-run')
    expect(JSON.parse(infoResult.content[0].text).run.runId).toBe('info-run')
    expect(JSON.parse(waitResult.content[0].text).run.runId).toBe('wait-run')
    expect(mocks.acknowledgeGatewaySubagentRuns).toHaveBeenCalled()
  })

  it('routes kill through the gateway subagent facade', async () => {
    const handler = getToolHandler('subagents')
    const result = await handler({ action: 'kill', runId: 'kill-run' }) as {
      content: Array<{ text: string }>
    }

    expect(mocks.killGatewaySubagentRun).toHaveBeenCalledWith('kill-run')
    expect(JSON.parse(result.content[0].text).run.runId).toBe('kill-run')
  })

  it('waits on all conversation runs through the gateway facade when no runId is provided', async () => {
    const handler = getToolHandler('subagents')
    const result = await handler({ action: 'wait', timeoutMs: 6000 }) as {
      content: Array<{ text: string }>
    }

    expect(mocks.waitForGatewayConversationSubagents).toHaveBeenCalledWith('conversation-1', 6000)
    expect(JSON.parse(result.content[0].text).runs[0].runId).toBe('wait-conversation-run')
  })
})
