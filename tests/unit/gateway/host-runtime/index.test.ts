import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  initializeAIBrowser: vi.fn(),
  cleanupAIBrowser: vi.fn(),
  createAIBrowserMcpServer: vi.fn(() => ({ server: 'connected-browser' })),
  getAIBrowserSdkToolNames: vi.fn(() => [
    'browser_list_pages',
    'browser_snapshot',
    'browser_screenshot'
  ]),
  browserContext: {
    getActiveViewId: vi.fn(() => 'tab-1'),
    createSnapshot: vi.fn(async () => ({
      title: 'Connected Page',
      url: 'https://example.com',
      idToNode: new Map([['uid-1', {}], ['uid-2', {}]]),
      format: vi.fn(() => 'connected snapshot text')
    })),
    captureScreenshot: vi.fn(async () => ({
      data: 'connected-image-data',
      mimeType: 'image/png'
    }))
  },
  createAutomatedBrowserMcpServer: vi.fn(() => ({ server: 'automated-browser' })),
  getAutomatedBrowserToolNames: vi.fn(() => [
    'browser_list_pages',
    'browser_snapshot',
    'browser_screenshot'
  ]),
  captureAutomatedBrowserSnapshot: vi.fn(async () => ({
    backend: 'automated',
    title: 'Automated Page',
    url: 'https://automated.example.com',
    text: 'automated snapshot text',
    elementCount: 3
  })),
  captureAutomatedBrowserScreenshot: vi.fn(async () => ({
    backend: 'automated',
    mimeType: 'image/png',
    data: 'automated-image-data'
  })),
  openMacOSApplication: vi.fn(async () => ({
    runner: 'open -a Safari',
    cwd: '/tmp',
    returnCode: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    timeoutMs: 1000
  })),
  executeAppleScript: vi.fn(async () => ({
    runner: 'osascript',
    cwd: '/tmp',
    returnCode: 0,
    stdout: 'ok',
    stderr: '',
    timedOut: false,
    timeoutMs: 1000
  })),
  captureMacOSDesktopScreenshot: vi.fn(async () => ({
    filePath: '/tmp/desktop.png',
    mimeType: 'image/png',
    data: 'desktop-image-data'
  })),
  readMacOSDesktopUiTree: vi.fn(async () => ({
    text: 'Application: Safari\nWindow: Example'
  })),
  getMacOSAccessibilityPermissionStatus: vi.fn(async () => ({
    state: 'needs_permission'
  })),
  getMacOSScreenRecordingPermissionStatus: vi.fn(async () => ({
    state: 'granted'
  }))
}))

vi.mock('../../../../src/main/services/ai-browser', () => ({
  initializeAIBrowser: mocks.initializeAIBrowser,
  cleanupAIBrowser: mocks.cleanupAIBrowser,
  createAIBrowserMcpServer: mocks.createAIBrowserMcpServer,
  getAIBrowserSdkToolNames: mocks.getAIBrowserSdkToolNames
}))

vi.mock('../../../../src/main/services/ai-browser/context', () => ({
  browserContext: mocks.browserContext
}))

vi.mock('../../../../src/main/services/automated-browser/sdk-mcp-server', () => ({
  createAutomatedBrowserMcpServer: mocks.createAutomatedBrowserMcpServer,
  getAutomatedBrowserToolNames: mocks.getAutomatedBrowserToolNames,
  captureAutomatedBrowserSnapshot: mocks.captureAutomatedBrowserSnapshot,
  captureAutomatedBrowserScreenshot: mocks.captureAutomatedBrowserScreenshot
}))

vi.mock('../../../../src/main/services/local-tools/macos-ui', () => ({
  openMacOSApplication: mocks.openMacOSApplication,
  executeAppleScript: mocks.executeAppleScript,
  captureMacOSDesktopScreenshot: mocks.captureMacOSDesktopScreenshot,
  readMacOSDesktopUiTree: mocks.readMacOSDesktopUiTree,
  getMacOSAccessibilityPermissionStatus: mocks.getMacOSAccessibilityPermissionStatus,
  getMacOSScreenRecordingPermissionStatus: mocks.getMacOSScreenRecordingPermissionStatus
}))

import {
  browserHostRuntime,
  desktopHostRuntime,
  hostRuntime,
  perceptionHostRuntime,
  stepReporterRuntime
} from '../../../../src/gateway/host-runtime'

describe('host runtime adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stepReporterRuntime.clearAll()
  })

  it('exposes connected browser capabilities and mcp server creation', () => {
    const capabilities = browserHostRuntime.getCapabilities('connected')
    const server = browserHostRuntime.createMcpServer('connected', {
      spaceId: 'space-1',
      conversationId: 'conv-1'
    })

    expect(capabilities).toEqual({
      backend: 'connected',
      toolNames: ['browser_list_pages', 'browser_snapshot', 'browser_screenshot'],
      supportsStructuredSnapshot: true,
      supportsScreenshots: true,
      supportsMultiPage: true
    })
    expect(server).toEqual({ server: 'connected-browser' })
    expect(mocks.createAIBrowserMcpServer).toHaveBeenCalledTimes(1)
    expect(mocks.createAIBrowserMcpServer).toHaveBeenCalledWith({
      spaceId: 'space-1',
      conversationId: 'conv-1'
    })
  })

  it('routes automated browser mcp creation through the embedded browser adapter', () => {
    const server = browserHostRuntime.createMcpServer('automated', {
      spaceId: 'space-2',
      conversationId: 'conv-2'
    })

    expect(server).toEqual({ server: 'automated-browser' })
    expect(mocks.createAutomatedBrowserMcpServer).toHaveBeenCalledTimes(1)
    expect(mocks.createAutomatedBrowserMcpServer).toHaveBeenCalledWith({
      spaceId: 'space-2',
      conversationId: 'conv-2'
    })
  })

  it('describes current perception sources including desktop perception support', () => {
    const isMacOS = process.platform === 'darwin'

    expect(perceptionHostRuntime.getCapabilities()).toEqual({
      browserSnapshot: true,
      browserScreenshot: true,
      desktopScreenshot: isMacOS,
      desktopUiTree: isMacOS
    })

    expect(perceptionHostRuntime.listSources()).toEqual([
      {
        kind: 'browser_snapshot',
        available: true,
        backend: 'connected',
        toolName: 'browser_snapshot'
      },
      {
        kind: 'browser_snapshot',
        available: true,
        backend: 'automated',
        toolName: 'browser_snapshot'
      },
      {
        kind: 'browser_screenshot',
        available: true,
        backend: 'connected',
        toolName: 'browser_screenshot'
      },
      {
        kind: 'browser_screenshot',
        available: true,
        backend: 'automated',
        toolName: 'browser_screenshot'
      },
      {
        kind: 'desktop_screenshot',
        available: isMacOS,
        backend: 'desktop',
        notes: isMacOS
          ? 'Requires macOS Screen Recording permission.'
          : 'Desktop screenshot capture is only available on macOS.'
      },
      {
        kind: 'desktop_ui_tree',
        available: isMacOS,
        backend: 'desktop',
        notes: isMacOS
          ? 'Requires macOS Accessibility permission.'
          : 'Desktop UI tree reading is only available on macOS.'
      }
    ])
  })

  it('delegates desktop operations to the existing macOS helpers', async () => {
    const openResult = await desktopHostRuntime.openApplication({
      workDir: '/tmp',
      application: 'Safari'
    })
    const scriptResult = await desktopHostRuntime.runAppleScript({
      workDir: '/tmp',
      script: 'return "ok"'
    })

    expect(mocks.openMacOSApplication).toHaveBeenCalledWith({
      workDir: '/tmp',
      application: 'Safari'
    })
    expect(mocks.executeAppleScript).toHaveBeenCalledWith({
      workDir: '/tmp',
      script: 'return "ok"'
    })
    expect(openResult.returnCode).toBe(0)
    expect(scriptResult.stdout).toBe('ok')
  })

  it('reports host environment status for the current platform', async () => {
    const status = await hostRuntime.status.getEnvironmentStatus()

    expect(status).toEqual({
      platform: process.platform,
      browser: {
        state: 'ready',
        backend: 'automated',
        toolCount: 3
      },
      desktop: {
        state: process.platform === 'darwin' ? 'ready' : 'unsupported'
      },
      permissions: {
        accessibility: { state: 'needs_permission' },
        screenRecording: { state: 'granted' }
      }
    })
    expect(mocks.getMacOSAccessibilityPermissionStatus).toHaveBeenCalledTimes(1)
    expect(mocks.getMacOSScreenRecordingPermissionStatus).toHaveBeenCalledTimes(1)
  })

  it('captures connected browser perception and records a step', async () => {
    const result = await perceptionHostRuntime.captureBrowserSnapshot({
      backend: 'connected',
      taskId: 'task-browser'
    })

    expect(mocks.browserContext.createSnapshot).toHaveBeenCalledWith(false)
    expect(result).toEqual({
      backend: 'connected',
      title: 'Connected Page',
      url: 'https://example.com',
      text: 'connected snapshot text',
      elementCount: 2,
      filePath: undefined
    })
    expect(stepReporterRuntime.listSteps('task-browser')).toHaveLength(1)
  })

  it('captures automated browser and desktop perception through host runtime adapters', async () => {
    const browserShot = await perceptionHostRuntime.captureBrowserScreenshot({
      backend: 'automated'
    })
    const desktopShot = await perceptionHostRuntime.captureDesktopScreenshot({
      workDir: '/tmp'
    })
    const uiTree = await perceptionHostRuntime.readDesktopUiTree({
      workDir: '/tmp'
    })

    expect(mocks.captureAutomatedBrowserScreenshot).toHaveBeenCalledTimes(1)
    expect(mocks.captureMacOSDesktopScreenshot).toHaveBeenCalledWith({
      workDir: '/tmp'
    })
    expect(mocks.readMacOSDesktopUiTree).toHaveBeenCalledWith({
      workDir: '/tmp'
    })
    expect(browserShot.mimeType).toBe('image/png')
    expect(desktopShot.filePath).toBe('/tmp/desktop.png')
    expect(uiTree.text).toContain('Application: Safari')
  })

  it('records and clears step reports in memory', () => {
    const first = stepReporterRuntime.recordStep({
      taskId: 'task-1',
      category: 'browser',
      action: 'browser_snapshot',
      summary: 'Captured the current page'
    })

    expect(first.stepId).toBeTruthy()
    expect(hostRuntime.stepReporter.listSteps('task-1')).toHaveLength(1)

    stepReporterRuntime.clearTask('task-1')
    expect(stepReporterRuntime.listSteps('task-1')).toEqual([])
  })
})
