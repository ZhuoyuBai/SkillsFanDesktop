import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  openApplication: vi.fn(async ({ application }: { application: string }) => ({
    runner: `open -a ${application}`,
    cwd: '/tmp',
    returnCode: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    timeoutMs: 4000,
    ok: true
  })),
  executeDesktopAdapterMethod: vi.fn()
}))

vi.mock('../../../../src/gateway/host-runtime/desktop/runtime', () => ({
  desktopHostRuntime: {
    openApplication: mocks.openApplication
  }
}))

vi.mock('../../../../src/gateway/host-runtime/desktop/adapters/executor', () => ({
  executeDesktopAdapterMethod: mocks.executeDesktopAdapterMethod
}))

import {
  clearDesktopSmokeFlowRuns,
  getDesktopSmokeFlowRunSnapshot,
  runDesktopSmokeFlow
} from '../../../../src/gateway/host-runtime/desktop/smoke-flows'

function okResult(stdout = '') {
  return {
    runner: 'osascript',
    cwd: '/tmp',
    returnCode: 0,
    stdout,
    stderr: '',
    timedOut: false,
    timeoutMs: 4000,
    ok: true
  }
}

describe('desktop smoke flow runner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearDesktopSmokeFlowRuns()
  })

  it('runs a chrome discovery smoke flow and stores the latest passed result', async () => {
    let targetUrl = ''

    mocks.executeDesktopAdapterMethod.mockImplementation(async ({ input }: { input: { methodId: string; target?: string; query?: string } }) => {
      switch (input.methodId) {
        case 'chrome.open_url_in_new_tab':
          targetUrl = input.target || 'https://example.com/?skillsfan_smoke=test'
          return {
            adapterId: 'chrome',
            methodId: input.methodId,
            stage: 'active',
            result: okResult(),
            successText: 'Opened smoke tab.'
          }
        case 'chrome.list_tabs':
          return {
            adapterId: 'chrome',
            methodId: input.methodId,
            stage: 'active',
            result: okResult(),
            successText: 'Listed tabs.',
            data: {
              application: 'Google Chrome',
              tabs: [
                { windowIndex: 1, tabIndex: 1, active: true, title: 'Example', url: targetUrl }
              ],
              totalTabs: 1,
              returnedTabs: 1,
              truncated: false
            }
          }
        case 'chrome.find_tabs':
          return {
            adapterId: 'chrome',
            methodId: input.methodId,
            stage: 'active',
            result: okResult(),
            successText: 'Found matching tabs.',
            data: {
              application: 'Google Chrome',
              query: targetUrl,
              field: 'url',
              tabs: [
                { windowIndex: 1, tabIndex: 1, active: true, title: 'Example', url: targetUrl }
              ],
              totalMatches: 1,
              returnedMatches: 1,
              truncated: false
            }
          }
        case 'chrome.focus_tab_by_url':
          return {
            adapterId: 'chrome',
            methodId: input.methodId,
            stage: 'active',
            result: okResult(),
            successText: 'Focused smoke tab.'
          }
        case 'chrome.get_active_tab':
          return {
            adapterId: 'chrome',
            methodId: input.methodId,
            stage: 'active',
            result: okResult(),
            successText: 'Read active tab.',
            data: {
              application: 'Google Chrome',
              windowIndex: 1,
              tabIndex: 1,
              title: 'Example',
              url: targetUrl
            }
          }
        case 'chrome.close_tabs':
          return {
            adapterId: 'chrome',
            methodId: input.methodId,
            stage: 'active',
            result: okResult(),
            successText: 'Closed smoke tab.',
            data: {
              application: 'Google Chrome',
              query: targetUrl,
              field: 'url',
              closedTabs: [
                { windowIndex: 1, tabIndex: 1, active: true, title: 'Example', url: targetUrl }
              ],
              requestedMatches: 1,
              closedCount: 1,
              remainingMatches: 0
            }
          }
        default:
          throw new Error(`Unexpected method: ${input.methodId}`)
      }
    })

    const result = await runDesktopSmokeFlow({
      flowId: 'chrome.discovery-roundtrip',
      workDir: '/tmp'
    })

    expect(result.state).toBe('passed')
    expect(result.steps.map((step) => step.methodId)).toEqual([
      'chrome.open_url_in_new_tab',
      'chrome.list_tabs',
      'chrome.find_tabs',
      'chrome.focus_tab_by_url',
      'chrome.get_active_tab',
      'chrome.close_tabs'
    ])
    expect(getDesktopSmokeFlowRunSnapshot('chrome.discovery-roundtrip')).toMatchObject({
      state: 'passed',
      summary: expect.stringContaining('discovery roundtrip passed')
    })
  })

  it('marks terminal command roundtrip as failed when the output marker is missing', async () => {
    mocks.executeDesktopAdapterMethod.mockImplementation(async ({ input }: { input: { methodId: string } }) => {
      switch (input.methodId) {
        case 'terminal.run_command_and_wait':
          return {
            adapterId: 'terminal',
            methodId: input.methodId,
            stage: 'active',
            result: okResult(),
            successText: 'Command finished.',
            data: {
              commandId: 'cmd_123',
              completed: true,
              exitStatus: 0,
              completionState: 'succeeded'
            }
          }
        case 'terminal.get_last_command_result':
          return {
            adapterId: 'terminal',
            methodId: input.methodId,
            stage: 'active',
            result: okResult(),
            successText: 'Last result read.',
            data: {
              commandId: 'cmd_123',
              completed: true,
              exitStatus: 0,
              completionState: 'succeeded'
            }
          }
        case 'terminal.read_output':
          return {
            adapterId: 'terminal',
            methodId: input.methodId,
            stage: 'active',
            result: okResult(),
            successText: 'Output read.',
            data: {
              output: 'plain output without the expected marker',
              completed: true,
              exitStatus: 0,
              completionState: 'succeeded'
            }
          }
        default:
          throw new Error(`Unexpected method: ${input.methodId}`)
      }
    })

    const result = await runDesktopSmokeFlow({
      flowId: 'terminal.command-roundtrip',
      workDir: '/tmp'
    })

    expect(result.state).toBe('failed')
    expect(result.error).toContain('smoke marker')
    expect(getDesktopSmokeFlowRunSnapshot('terminal.command-roundtrip')).toMatchObject({
      state: 'failed'
    })
  })
})
