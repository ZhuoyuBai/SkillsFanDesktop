import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  openApplication: vi.fn(async () => ({
    runner: 'open -a Safari',
    cwd: '/tmp',
    returnCode: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    timeoutMs: 1000
  })),
  runAppleScript: vi.fn(async () => ({
    runner: 'osascript',
    cwd: '/tmp',
    returnCode: 0,
    stdout: 'ok',
    stderr: '',
    timedOut: false,
    timeoutMs: 1000
  }))
}))

vi.mock('../../../../src/gateway/host-runtime', () => ({
  hostRuntime: {
    desktop: {
      openApplication: mocks.openApplication,
      runAppleScript: mocks.runAppleScript
    }
  }
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

describe('createLocalToolsMcpServer desktop tools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('routes open_application through host runtime desktop', async () => {
    const openApplication = getToolHandler('open_application')
    const result = await openApplication({
      application: 'Safari',
      target: 'https://example.com',
      activate: false,
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.openApplication).toHaveBeenCalledWith({
      workDir: '/workspace',
      application: 'Safari',
      target: 'https://example.com',
      activate: false,
      timeoutMs: 5000
    })
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toBe('Opened Safari with https://example.com.')
  })

  it('routes run_applescript through host runtime desktop', async () => {
    const runAppleScript = getToolHandler('run_applescript')
    const result = await runAppleScript({
      script: 'return "ok"',
      timeoutMs: 4000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: 'return "ok"',
      timeoutMs: 4000
    })
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toBe('AppleScript completed:\nok')
  })

  it('preserves failure formatting for desktop application launch errors', async () => {
    mocks.openApplication.mockResolvedValueOnce({
      runner: 'open -a Safari',
      cwd: '/tmp',
      returnCode: 1,
      stdout: '',
      stderr: 'Application not found',
      timedOut: false,
      timeoutMs: 1000
    })

    const openApplication = getToolHandler('open_application')
    const result = await openApplication({
      application: 'Missing App'
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toBe('Failed to open Missing App: Application not found')
  })
})
