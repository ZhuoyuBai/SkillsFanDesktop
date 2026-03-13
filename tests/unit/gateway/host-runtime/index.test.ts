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
  activateMacOSApplication: vi.fn(async () => ({
    runner: 'osascript',
    cwd: '/tmp',
    returnCode: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    timeoutMs: 1000
  })),
  pressMacOSKey: vi.fn(async () => ({
    runner: 'osascript',
    cwd: '/tmp',
    returnCode: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    timeoutMs: 1000
  })),
  typeMacOSText: vi.fn(async () => ({
    runner: 'osascript',
    cwd: '/tmp',
    returnCode: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    timeoutMs: 1000
  })),
  clickMacOSAtCoordinate: vi.fn(async () => ({
    runner: 'osascript',
    cwd: '/tmp',
    returnCode: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    timeoutMs: 1000
  })),
  moveMacOSMouse: vi.fn(async () => ({
    runner: 'osascript',
    cwd: '/tmp',
    returnCode: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    timeoutMs: 1000
  })),
  scrollMacOS: vi.fn(async () => ({
    runner: 'osascript',
    cwd: '/tmp',
    returnCode: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    timeoutMs: 1000
  })),
  listMacOSWindows: vi.fn(async () => ({
    windows: [
      { application: 'Safari', name: 'Example', index: 1, position: { x: 0, y: 0 }, size: { width: 800, height: 600 }, minimized: false }
    ]
  })),
  focusMacOSWindow: vi.fn(async () => ({
    runner: 'osascript',
    cwd: '/tmp',
    returnCode: 0,
    stdout: '',
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
  })),
  getDesktopSmokeFlowRunSnapshot: vi.fn((flowId: string) => (
    flowId === 'chrome.tab-roundtrip'
      ? {
        id: flowId,
        adapterId: 'chrome',
        displayName: 'Tab Roundtrip',
        state: 'passed',
        startedAt: '2026-03-13T03:00:00.000Z',
        finishedAt: '2026-03-13T03:00:02.000Z',
        durationMs: 2000,
        summary: 'Chrome tab roundtrip passed.',
        error: null,
        steps: []
      }
      : null
  ))
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
  activateMacOSApplication: mocks.activateMacOSApplication,
  pressMacOSKey: mocks.pressMacOSKey,
  typeMacOSText: mocks.typeMacOSText,
  clickMacOSAtCoordinate: mocks.clickMacOSAtCoordinate,
  moveMacOSMouse: mocks.moveMacOSMouse,
  scrollMacOS: mocks.scrollMacOS,
  listMacOSWindows: mocks.listMacOSWindows,
  focusMacOSWindow: mocks.focusMacOSWindow,
  captureMacOSDesktopScreenshot: mocks.captureMacOSDesktopScreenshot,
  readMacOSDesktopUiTree: mocks.readMacOSDesktopUiTree,
  getMacOSAccessibilityPermissionStatus: mocks.getMacOSAccessibilityPermissionStatus,
  getMacOSScreenRecordingPermissionStatus: mocks.getMacOSScreenRecordingPermissionStatus
}))

vi.mock('../../../../src/gateway/host-runtime/desktop/smoke-flows', () => ({
  getDesktopSmokeFlowRunSnapshot: mocks.getDesktopSmokeFlowRunSnapshot
}))

import {
  browserHostRuntime,
  desktopHostRuntime,
  hostRuntime,
  perceptionHostRuntime,
  stepReporterRuntime
} from '../../../../src/gateway/host-runtime'
import { listDesktopAppAdapters } from '../../../../src/gateway/host-runtime/desktop/adapters/registry'

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
    const isMacOS = process.platform === 'darwin'
    const capabilities = desktopHostRuntime.getCapabilities()

    expect(capabilities).toMatchObject({
      platform: process.platform,
      backend: isMacOS ? 'generic-macos' : 'unsupported',
      supportsOpenApplication: isMacOS,
      supportsAppleScript: isMacOS,
      supportsActivateApplication: isMacOS,
      supportsPressKey: isMacOS,
      supportsTypeText: isMacOS,
      supportsClick: isMacOS,
      supportsScroll: isMacOS,
      supportsWindowManagement: isMacOS
    })
    expect(capabilities.actions).toEqual([
      {
        id: 'open_application',
        supported: isMacOS,
        notes: isMacOS
          ? 'Launches a real macOS application or target URL/file.'
          : 'Desktop automation is only available on macOS.'
      },
      {
        id: 'run_applescript',
        supported: isMacOS,
        notes: isMacOS
          ? 'Advanced escape hatch for actions not yet covered by structured desktop tools.'
          : 'Desktop automation is only available on macOS.'
      },
      {
        id: 'activate_application',
        supported: isMacOS,
        notes: isMacOS
          ? 'Brings an existing application to the foreground.'
          : 'Desktop automation is only available on macOS.'
      },
      {
        id: 'press_key',
        supported: isMacOS,
        requiresAccessibilityPermission: isMacOS,
        notes: isMacOS
          ? 'Requires macOS Accessibility permission.'
          : 'Desktop automation is only available on macOS.'
      },
      {
        id: 'type_text',
        supported: isMacOS,
        requiresAccessibilityPermission: isMacOS,
        notes: isMacOS
          ? 'Requires macOS Accessibility permission.'
          : 'Desktop automation is only available on macOS.'
      },
      {
        id: 'click',
        supported: isMacOS,
        requiresAccessibilityPermission: isMacOS,
        notes: isMacOS
          ? 'Requires macOS Accessibility permission.'
          : 'Desktop automation is only available on macOS.'
      },
      {
        id: 'move_mouse',
        supported: isMacOS,
        requiresAccessibilityPermission: isMacOS,
        notes: isMacOS
          ? 'Requires macOS Accessibility permission.'
          : 'Desktop automation is only available on macOS.'
      },
      {
        id: 'scroll',
        supported: isMacOS,
        requiresAccessibilityPermission: isMacOS,
        notes: isMacOS
          ? 'Requires macOS Accessibility permission.'
          : 'Desktop automation is only available on macOS.'
      },
      {
        id: 'list_windows',
        supported: isMacOS,
        requiresAccessibilityPermission: isMacOS,
        notes: isMacOS
          ? 'Requires macOS Accessibility permission.'
          : 'Desktop automation is only available on macOS.'
      },
      {
        id: 'focus_window',
        supported: isMacOS,
        requiresAccessibilityPermission: isMacOS,
        notes: isMacOS
          ? 'Requires macOS Accessibility permission.'
          : 'Desktop automation is only available on macOS.'
      }
    ])
    expect(capabilities.adapters).toEqual(listDesktopAppAdapters(process.platform))
    expect(capabilities.errorCodes).toEqual([
      'unsupported_platform',
      'invalid_input',
      'timeout',
      'permission_denied',
      'app_not_found',
      'window_not_found',
      'execution_failed'
    ])

    const openResult = await desktopHostRuntime.openApplication({
      workDir: '/tmp',
      application: 'Safari'
    })
    const scriptResult = await desktopHostRuntime.runAppleScript({
      workDir: '/tmp',
      script: 'return "ok"'
    })
    const activateResult = await desktopHostRuntime.activateApplication({
      workDir: '/tmp',
      application: 'Safari'
    })
    const keyResult = await desktopHostRuntime.pressKey({
      workDir: '/tmp',
      key: 'Enter',
      modifiers: ['command']
    })
    const typeResult = await desktopHostRuntime.typeText({
      workDir: '/tmp',
      text: 'hello'
    })

    expect(mocks.openMacOSApplication).toHaveBeenCalledWith({
      workDir: '/tmp',
      application: 'Safari'
    })
    expect(mocks.executeAppleScript).toHaveBeenCalledWith({
      workDir: '/tmp',
      script: 'return "ok"'
    })
    expect(mocks.activateMacOSApplication).toHaveBeenCalledWith({
      workDir: '/tmp',
      application: 'Safari'
    })
    expect(mocks.pressMacOSKey).toHaveBeenCalledWith({
      workDir: '/tmp',
      key: 'Enter',
      modifiers: ['command']
    })
    expect(mocks.typeMacOSText).toHaveBeenCalledWith({
      workDir: '/tmp',
      text: 'hello'
    })
    expect(openResult.returnCode).toBe(0)
    expect(scriptResult.stdout).toBe('ok')
    expect(activateResult.returnCode).toBe(0)
    expect(keyResult.returnCode).toBe(0)
    expect(typeResult.returnCode).toBe(0)
  })

  it('delegates click, move, scroll, and window operations to macOS helpers', async () => {
    const clickResult = await desktopHostRuntime.clickAtCoordinate({
      workDir: '/tmp',
      x: 100,
      y: 200,
      button: 'left',
      clickCount: 2
    })
    expect(mocks.clickMacOSAtCoordinate).toHaveBeenCalledWith({
      workDir: '/tmp',
      x: 100,
      y: 200,
      button: 'left',
      clickCount: 2
    })
    expect(clickResult.returnCode).toBe(0)

    const moveResult = await desktopHostRuntime.moveMouse({
      workDir: '/tmp',
      x: 300,
      y: 400
    })
    expect(mocks.moveMacOSMouse).toHaveBeenCalledWith({
      workDir: '/tmp',
      x: 300,
      y: 400
    })
    expect(moveResult.returnCode).toBe(0)

    const scrollResult = await desktopHostRuntime.scroll({
      workDir: '/tmp',
      x: 500,
      y: 600,
      deltaY: -3
    })
    expect(mocks.scrollMacOS).toHaveBeenCalledWith({
      workDir: '/tmp',
      x: 500,
      y: 600,
      deltaY: -3
    })
    expect(scrollResult.returnCode).toBe(0)

    const windowsResult = await desktopHostRuntime.listWindows({
      workDir: '/tmp',
      application: 'Safari'
    })
    expect(mocks.listMacOSWindows).toHaveBeenCalledWith({
      workDir: '/tmp',
      application: 'Safari'
    })
    expect(windowsResult.windows).toHaveLength(1)
    expect(windowsResult.windows[0].application).toBe('Safari')

    const focusResult = await desktopHostRuntime.focusWindow({
      workDir: '/tmp',
      application: 'Safari',
      windowName: 'Example'
    })
    expect(mocks.focusMacOSWindow).toHaveBeenCalledWith({
      workDir: '/tmp',
      application: 'Safari',
      windowName: 'Example'
    })
    expect(focusResult.returnCode).toBe(0)
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
        state: process.platform === 'darwin' ? 'ready' : 'unsupported',
        backend: process.platform === 'darwin' ? 'generic-macos' : 'unsupported',
        actions: expect.any(Array),
        adapters: expect.any(Array),
        errorCodes: [
          'unsupported_platform',
          'invalid_input',
          'timeout',
          'permission_denied',
          'app_not_found',
          'window_not_found',
          'execution_failed'
        ]
      },
      permissions: {
        accessibility: { state: 'needs_permission' },
        screenRecording: { state: 'granted' }
      }
    })
    expect(status.desktop.actions.some((action) => action.id === 'press_key' && action.blockedByPermission)).toBe(
      process.platform === 'darwin'
    )
    expect(status.desktop.adapters[0]?.id).toBe('generic-macos')
    expect(status.desktop.adapters.find((adapter) => adapter.id === 'finder')?.methods).toEqual([
      expect.objectContaining({
        id: 'finder.reveal_path',
        action: 'run_applescript',
        stage: 'active',
        supported: true
      }),
      expect.objectContaining({
        id: 'finder.open_folder',
        action: 'open_application',
        stage: 'active',
        supported: true
      }),
      expect.objectContaining({
        id: 'finder.open_home_folder',
        action: 'open_application',
        stage: 'active',
        supported: true
      }),
      expect.objectContaining({
        id: 'finder.new_window',
        action: 'press_key',
        stage: 'active',
        supported: true
      }),
      expect.objectContaining({
        id: 'finder.search',
        action: 'run_applescript',
        stage: 'active',
        supported: true
      })
    ])
    expect(status.desktop.adapters.find((adapter) => adapter.id === 'terminal')).toEqual(expect.objectContaining({
      stage: 'active',
      supported: process.platform === 'darwin',
      workflows: expect.arrayContaining([
        expect.objectContaining({
          id: 'terminal.session-control',
          blockedByPermission: false
        }),
        expect.objectContaining({
          id: 'terminal.run-and-verify',
          blockedByPermission: process.platform === 'darwin',
          recoveryHint: process.platform === 'darwin'
            ? 'Grant macOS Accessibility permission to unlock shortcut, keyboard, mouse, and window-control steps in this workflow.'
            : undefined
        }),
        expect.objectContaining({
          id: 'iterm.pane-ops',
          blockedByPermission: false
        })
      ])
    }))
    expect(status.desktop.adapters.find((adapter) => adapter.id === 'chrome')).toEqual(expect.objectContaining({
      stage: 'active',
      supported: process.platform === 'darwin',
      workflows: expect.arrayContaining([
        expect.objectContaining({
          id: 'chrome.tab-navigation',
          blockedByPermission: process.platform === 'darwin'
        }),
        expect.objectContaining({
          id: 'chrome.tab-observe',
          blockedByPermission: false
        }),
        expect.objectContaining({
          id: 'chrome.tab-cleanup',
          blockedByPermission: process.platform === 'darwin'
        })
      ]),
      smokeFlows: expect.arrayContaining([
        expect.objectContaining({
          id: 'chrome.tab-roundtrip',
          blockedByPermission: process.platform === 'darwin',
          lastRun: {
            state: 'passed',
            startedAt: '2026-03-13T03:00:00.000Z',
            finishedAt: '2026-03-13T03:00:02.000Z',
            durationMs: 2000,
            summary: 'Chrome tab roundtrip passed.',
            error: undefined
          }
        }),
        expect.objectContaining({
          id: 'chrome.discovery-roundtrip',
          blockedByPermission: process.platform === 'darwin'
        })
      ])
    }))
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
