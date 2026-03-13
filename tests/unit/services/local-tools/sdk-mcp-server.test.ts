import { beforeEach, describe, expect, it, vi } from 'vitest'

const successResult = {
  runner: 'osascript',
  cwd: '/tmp',
  returnCode: 0,
  stdout: '',
  stderr: '',
  timedOut: false,
  timeoutMs: 1000,
  ok: true
}

const mocks = vi.hoisted(() => ({
  openApplication: vi.fn(async () => ({
    runner: 'open -a Safari',
    cwd: '/tmp',
    returnCode: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    timeoutMs: 1000,
    ok: true
  })),
  runAppleScript: vi.fn(async () => ({
    runner: 'osascript',
    cwd: '/tmp',
    returnCode: 0,
    stdout: 'ok',
    stderr: '',
    timedOut: false,
    timeoutMs: 1000,
    ok: true
  })),
  activateApplication: vi.fn(async () => ({ ...successResult })),
  pressKey: vi.fn(async () => ({ ...successResult })),
  typeText: vi.fn(async () => ({ ...successResult })),
  clickAtCoordinate: vi.fn(async () => ({ ...successResult })),
  moveMouse: vi.fn(async () => ({ ...successResult })),
  scroll: vi.fn(async () => ({ ...successResult })),
  getDesktopCapabilities: vi.fn(() => ({
    platform: 'darwin',
    backend: 'generic-macos',
    supportsOpenApplication: true,
    supportsAppleScript: true,
    supportsActivateApplication: true,
    supportsPressKey: true,
    supportsTypeText: true,
    supportsClick: true,
    supportsScroll: true,
    supportsWindowManagement: true,
    actions: [
      { id: 'open_application', supported: true, notes: 'Launches a real macOS application or target URL/file.' },
      { id: 'run_applescript', supported: true, notes: 'Advanced escape hatch for actions not yet covered by structured desktop tools.' },
      { id: 'activate_application', supported: true, notes: 'Brings an existing application to the foreground.' },
      { id: 'press_key', supported: true, requiresAccessibilityPermission: true, notes: 'Requires macOS Accessibility permission.' },
      { id: 'type_text', supported: true, requiresAccessibilityPermission: true, notes: 'Requires macOS Accessibility permission.' },
      { id: 'click', supported: true, requiresAccessibilityPermission: true, notes: 'Requires macOS Accessibility permission.' },
      { id: 'move_mouse', supported: true, requiresAccessibilityPermission: true, notes: 'Requires macOS Accessibility permission.' },
      { id: 'scroll', supported: true, requiresAccessibilityPermission: true, notes: 'Requires macOS Accessibility permission.' },
      { id: 'list_windows', supported: true, requiresAccessibilityPermission: true, notes: 'Requires macOS Accessibility permission.' },
      { id: 'focus_window', supported: true, requiresAccessibilityPermission: true, notes: 'Requires macOS Accessibility permission.' }
    ],
    adapters: [],
    errorCodes: [
      'unsupported_platform',
      'invalid_input',
      'timeout',
      'permission_denied',
      'app_not_found',
      'window_not_found',
      'execution_failed'
    ]
  })),
  listWindows: vi.fn(async () => ({
    windows: [
      { application: 'Finder', name: 'Documents', index: 1, position: { x: 0, y: 0 }, size: { width: 800, height: 600 }, minimized: false }
    ]
  })),
  focusWindow: vi.fn(async () => ({ ...successResult })),
  getEnvironmentStatus: vi.fn(async () => ({
    platform: 'darwin',
    browser: { state: 'ready', backend: 'automated', toolCount: 0 },
    desktop: { state: 'ready' },
    permissions: {
      accessibility: { state: 'granted' },
      screenRecording: { state: 'granted' }
    }
  }))
}))

vi.mock('../../../../src/gateway/host-runtime', () => ({
  hostRuntime: {
    desktop: {
      getCapabilities: mocks.getDesktopCapabilities,
      openApplication: mocks.openApplication,
      runAppleScript: mocks.runAppleScript,
      activateApplication: mocks.activateApplication,
      pressKey: mocks.pressKey,
      typeText: mocks.typeText,
      clickAtCoordinate: mocks.clickAtCoordinate,
      moveMouse: mocks.moveMouse,
      scroll: mocks.scroll,
      listWindows: mocks.listWindows,
      focusWindow: mocks.focusWindow
    },
    status: {
      getEnvironmentStatus: mocks.getEnvironmentStatus
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
    mocks.openApplication.mockReset().mockImplementation(async () => ({
      runner: 'open -a Safari',
      cwd: '/tmp',
      returnCode: 0,
      stdout: '',
      stderr: '',
      timedOut: false,
      timeoutMs: 1000,
      ok: true
    }))
    mocks.runAppleScript.mockReset().mockImplementation(async () => ({
      runner: 'osascript',
      cwd: '/tmp',
      returnCode: 0,
      stdout: 'ok',
      stderr: '',
      timedOut: false,
      timeoutMs: 1000,
      ok: true
    }))
    mocks.activateApplication.mockReset().mockImplementation(async () => ({ ...successResult }))
    mocks.pressKey.mockReset().mockImplementation(async () => ({ ...successResult }))
    mocks.typeText.mockReset().mockImplementation(async () => ({ ...successResult }))
    mocks.clickAtCoordinate.mockReset().mockImplementation(async () => ({ ...successResult }))
    mocks.moveMouse.mockReset().mockImplementation(async () => ({ ...successResult }))
    mocks.scroll.mockReset().mockImplementation(async () => ({ ...successResult }))
    mocks.listWindows.mockReset().mockImplementation(async () => ({
      windows: [
        { application: 'Finder', name: 'Documents', index: 1, position: { x: 0, y: 0 }, size: { width: 800, height: 600 }, minimized: false }
      ]
    }))
    mocks.focusWindow.mockReset().mockImplementation(async () => ({ ...successResult }))
    mocks.getDesktopCapabilities.mockReturnValue({
      platform: 'darwin',
      backend: 'generic-macos',
      supportsOpenApplication: true,
      supportsAppleScript: true,
      supportsActivateApplication: true,
      supportsPressKey: true,
      supportsTypeText: true,
      supportsClick: true,
      supportsScroll: true,
      supportsWindowManagement: true,
      actions: [
        { id: 'open_application', supported: true, notes: 'Launches a real macOS application or target URL/file.' },
        { id: 'run_applescript', supported: true, notes: 'Advanced escape hatch for actions not yet covered by structured desktop tools.' },
        { id: 'activate_application', supported: true, notes: 'Brings an existing application to the foreground.' },
        { id: 'press_key', supported: true, requiresAccessibilityPermission: true, notes: 'Requires macOS Accessibility permission.' },
        { id: 'type_text', supported: true, requiresAccessibilityPermission: true, notes: 'Requires macOS Accessibility permission.' },
        { id: 'click', supported: true, requiresAccessibilityPermission: true, notes: 'Requires macOS Accessibility permission.' },
        { id: 'move_mouse', supported: true, requiresAccessibilityPermission: true, notes: 'Requires macOS Accessibility permission.' },
        { id: 'scroll', supported: true, requiresAccessibilityPermission: true, notes: 'Requires macOS Accessibility permission.' },
        { id: 'list_windows', supported: true, requiresAccessibilityPermission: true, notes: 'Requires macOS Accessibility permission.' },
        { id: 'focus_window', supported: true, requiresAccessibilityPermission: true, notes: 'Requires macOS Accessibility permission.' }
      ],
      adapters: [],
      errorCodes: [
        'unsupported_platform',
        'invalid_input',
        'timeout',
        'permission_denied',
        'app_not_found',
        'window_not_found',
        'execution_failed'
      ]
    })
    mocks.getEnvironmentStatus.mockResolvedValue({
      platform: 'darwin',
      browser: { state: 'ready', backend: 'automated', toolCount: 0 },
      desktop: { state: 'ready' },
      permissions: {
        accessibility: { state: 'granted' },
        screenRecording: { state: 'granted' }
      }
    })
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

  it('uses the finder adapter method when revealing a non-folder path in Finder', async () => {
    const openApplication = getToolHandler('open_application')
    const result = await openApplication({
      application: 'Finder',
      target: '/Users/demo/Documents.txt'
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('reveal POSIX file "/Users/demo/Documents.txt"'),
      timeoutMs: undefined
    })
    expect(mocks.openApplication).not.toHaveBeenCalled()
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toBe('Revealed /Users/demo/Documents.txt in Finder.')
  })

  it('routes finder_open_folder through the finder adapter', async () => {
    const handler = getToolHandler('finder_open_folder')
    const result = await handler({
      target: '/tmp',
      activate: true,
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.openApplication).toHaveBeenCalledWith({
      workDir: '/workspace',
      application: 'Finder',
      target: '/tmp',
      activate: true,
      timeoutMs: 5000
    })
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toBe('Opened folder /tmp in Finder.')
  })

  it('routes finder_open_home_folder through the finder adapter', async () => {
    const handler = getToolHandler('finder_open_home_folder')
    const result = await handler({
      activate: true,
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.openApplication).toHaveBeenCalledWith({
      workDir: '/workspace',
      application: 'Finder',
      target: expect.any(String),
      activate: true,
      timeoutMs: 5000
    })
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toBe('Opened the home folder in Finder.')
  })

  it('routes finder_new_window through the finder adapter', async () => {
    const handler = getToolHandler('finder_new_window')
    const result = await handler({
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.activateApplication).toHaveBeenCalledWith({
      workDir: '/workspace',
      application: 'Finder',
      timeoutMs: 5000
    })
    expect(mocks.pressKey).toHaveBeenCalledWith({
      workDir: '/workspace',
      key: 'n',
      modifiers: ['command'],
      timeoutMs: 5000
    })
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toBe('Opened a new Finder window.')
  })

  it('routes finder_search through the finder adapter', async () => {
    mocks.runAppleScript.mockResolvedValueOnce({
      runner: 'osascript',
      cwd: '/tmp',
      returnCode: 0,
      stdout: '__COUNT__:2\n/Users/demo/Documents/Invoice.pdf\n',
      stderr: '',
      timedOut: false,
      timeoutMs: 5000,
      ok: true
    })

    const handler = getToolHandler('finder_search')
    const result = await handler({
      query: 'invoice',
      directory: '/Users/demo/Documents',
      limit: 5,
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('/usr/bin/mdfind -count -onlyin'),
      timeoutMs: 5000
    })
    expect(result.isError).toBeUndefined()
    expect(JSON.parse(result.content[0]?.text || '{}')).toEqual({
      query: 'invoice',
      directory: '/Users/demo/Documents',
      results: ['/Users/demo/Documents/Invoice.pdf'],
      totalResults: 2,
      returnedResults: 1,
      truncated: true
    })
  })

  it('routes finder_reveal_path through the finder adapter', async () => {
    const handler = getToolHandler('finder_reveal_path')
    const result = await handler({
      target: '/Users/demo/Documents.txt',
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('reveal POSIX file "/Users/demo/Documents.txt"'),
      timeoutMs: 5000
    })
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toBe('Revealed /Users/demo/Documents.txt in Finder.')
  })

  it('uses the finder open_folder adapter method when opening a directory in Finder', async () => {
    const openApplication = getToolHandler('open_application')
    const result = await openApplication({
      application: 'Finder',
      target: '/tmp',
      activate: true
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.openApplication).toHaveBeenCalledWith({
      workDir: '/workspace',
      application: 'Finder',
      target: '/tmp',
      activate: true,
      timeoutMs: undefined
    })
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toBe('Opened folder /tmp in Finder.')
  })

  it('uses the chrome adapter method when opening a URL in Chrome', async () => {
    const openApplication = getToolHandler('open_application')
    const result = await openApplication({
      application: 'Google Chrome',
      target: 'https://example.com/docs'
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.openApplication).toHaveBeenCalledWith({
      workDir: '/workspace',
      application: 'Google Chrome',
      target: 'https://example.com/docs',
      activate: undefined,
      timeoutMs: undefined
    })
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toBe('Opened https://example.com/docs in Google Chrome.')
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

  it('routes terminal_run_command through the terminal adapter', async () => {
    const handler = getToolHandler('terminal_run_command')
    const result = await handler({
      command: 'pnpm test',
      application: 'iTerm2',
      windowIndex: 2,
      tabIndex: 3,
      sessionIndex: 1,
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('set targetSession to session 1 of targetTab'),
      timeoutMs: 5000
    })
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toBe('Ran command in iTerm2.')
  })

  it('routes terminal_list_sessions through the terminal adapter', async () => {
    mocks.runAppleScript.mockResolvedValueOnce({
      runner: 'osascript',
      cwd: '/tmp',
      returnCode: 0,
      stdout: [
        '1\t1\t1\ttrue\tfalse\tserver\t/dev/ttys001',
        '1\t2\t1\tfalse\ttrue\tworker\t/dev/ttys002'
      ].join('\n'),
      stderr: '',
      timedOut: false,
      timeoutMs: 5000,
      ok: true
    })

    const handler = getToolHandler('terminal_list_sessions')
    const result = await handler({
      application: 'iTerm2',
      limit: 1,
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('repeat with s in sessions of t'),
      timeoutMs: 5000
    })
    expect(result.isError).toBeUndefined()
    expect(JSON.parse(result.content[0]?.text || '{}')).toEqual({
      application: 'iTerm2',
      sessions: [{
        application: 'iTerm2',
        windowIndex: 1,
        tabIndex: 1,
        sessionIndex: 1,
        paneIndex: 1,
        active: true,
        busy: false,
        title: 'server',
        tty: '/dev/ttys001'
      }],
      totalSessions: 2,
      returnedSessions: 1,
      truncated: true
    })
  })

  it('routes terminal_list_panes through the terminal adapter', async () => {
    mocks.runAppleScript.mockResolvedValueOnce({
      runner: 'osascript',
      cwd: '/tmp',
      returnCode: 0,
      stdout: '2\t3\t1\ttrue\tfalse\tserver\t/dev/ttys001\n2\t3\t2\tfalse\ttrue\tworker\t/dev/ttys002',
      stderr: '',
      timedOut: false,
      timeoutMs: 5000,
      ok: true
    })

    const handler = getToolHandler('terminal_list_panes')
    const result = await handler({
      application: 'iTerm2',
      windowIndex: 2,
      tabIndex: 3,
      limit: 1,
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('repeat with s in sessions of targetTab'),
      timeoutMs: 5000
    })
    expect(result.isError).toBeUndefined()
    expect(JSON.parse(result.content[0]?.text || '{}')).toEqual({
      application: 'iTerm2',
      panes: [{
        application: 'iTerm2',
        windowIndex: 2,
        tabIndex: 3,
        sessionIndex: 1,
        paneIndex: 1,
        active: true,
        busy: false,
        title: 'server',
        tty: '/dev/ttys001'
      }],
      totalPanes: 2,
      returnedPanes: 1,
      truncated: true,
      windowIndex: 2,
      tabIndex: 3
    })
  })

  it('routes terminal_get_pane_layout through the terminal adapter', async () => {
    mocks.runAppleScript.mockResolvedValueOnce({
      runner: 'osascript',
      cwd: '/tmp',
      returnCode: 0,
      stdout: [
        '__PANE__\t2\t3\t1\ttrue\tfalse\tserver\t/dev/ttys001\t120\t32',
        '__PANE__\t2\t3\t2\tfalse\ttrue\tworker\t/dev/ttys002\t120\t16'
      ].join('\n'),
      stderr: '',
      timedOut: false,
      timeoutMs: 5000,
      ok: true
    })

    const handler = getToolHandler('terminal_get_pane_layout')
    const result = await handler({
      application: 'iTerm2',
      windowIndex: 2,
      tabIndex: 3,
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('__PANE__'),
      timeoutMs: 5000
    })
    expect(result.isError).toBeUndefined()
    expect(JSON.parse(result.content[0]?.text || '{}')).toEqual({
      application: 'iTerm2',
      panes: [
        {
          application: 'iTerm2',
          windowIndex: 2,
          tabIndex: 3,
          sessionIndex: 1,
          paneIndex: 1,
          active: true,
          busy: false,
          title: 'server',
          tty: '/dev/ttys001',
          columns: 120,
          rows: 32
        },
        {
          application: 'iTerm2',
          windowIndex: 2,
          tabIndex: 3,
          sessionIndex: 2,
          paneIndex: 2,
          active: false,
          busy: true,
          title: 'worker',
          tty: '/dev/ttys002',
          columns: 120,
          rows: 16
        }
      ],
      totalPanes: 2,
      activePaneIndex: 1,
      supportedSplitDirections: ['horizontal', 'vertical'],
      hierarchySource: 'synthetic_flat',
      splitHierarchy: {
        type: 'group',
        splitDirection: 'unknown',
        children: [
          {
            type: 'pane',
            paneIndex: 1,
            sessionIndex: 1,
            active: true,
            busy: false,
            title: 'server',
            tty: '/dev/ttys001',
            columns: 120,
            rows: 32
          },
          {
            type: 'pane',
            paneIndex: 2,
            sessionIndex: 2,
            active: false,
            busy: true,
            title: 'worker',
            tty: '/dev/ttys002',
            columns: 120,
            rows: 16
          }
        ]
      },
      windowIndex: 2,
      tabIndex: 3
    })
  })

  it('routes terminal_focus_session through the terminal adapter', async () => {
    const handler = getToolHandler('terminal_focus_session')
    const result = await handler({
      application: 'iTerm2',
      windowIndex: 2,
      tabIndex: 3,
      paneIndex: 2,
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('set targetSession to session 2 of targetTab'),
      timeoutMs: 5000
    })
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toBe('Focused iTerm2 session.')
  })

  it('routes terminal_new_tab_run_command through the terminal adapter', async () => {
    const handler = getToolHandler('terminal_new_tab_run_command')
    const result = await handler({
      command: 'pnpm lint',
      application: 'Terminal',
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('keystroke "t" using command down'),
      timeoutMs: 5000
    })
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toBe('Opened a new tab and ran command in Terminal.')
  })

  it('routes terminal_new_window_run_command through the terminal adapter', async () => {
    const handler = getToolHandler('terminal_new_window_run_command')
    const result = await handler({
      command: 'pnpm typecheck',
      application: 'iTerm2',
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('create window with default profile'),
      timeoutMs: 5000
    })
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toBe('Opened a new window and ran command in iTerm2.')
  })

  it('routes terminal_split_pane_run_command through the terminal adapter', async () => {
    mocks.runAppleScript.mockResolvedValueOnce({
      runner: 'osascript',
      cwd: '/tmp',
      returnCode: 0,
      stdout: '2\t3\t4\ttrue\ttrue\tworker\t/dev/ttys004',
      stderr: '',
      timedOut: false,
      timeoutMs: 5000,
      ok: true
    })

    const handler = getToolHandler('terminal_split_pane_run_command')
    const result = await handler({
      application: 'iTerm2',
      command: 'pnpm dev',
      direction: 'horizontal',
      windowIndex: 2,
      tabIndex: 3,
      paneIndex: 2,
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('split horizontally with default profile'),
      timeoutMs: 5000
    })
    expect(result.isError).toBeUndefined()
    expect(JSON.parse(result.content[0]?.text || '{}')).toEqual({
      commandId: expect.any(String),
      application: 'iTerm2',
      windowIndex: 2,
      tabIndex: 3,
      sessionIndex: 4,
      paneIndex: 4,
      active: true,
      busy: true,
      title: 'worker',
      tty: '/dev/ttys004',
      completed: false,
      exitStatus: null,
      exitMarkerCount: 0,
      completionState: 'running',
      recoveryHint: 'iTerm2 is still busy.',
      recoverySuggestions: [
        'Use `terminal_read_output` to inspect current progress.',
        'Use `terminal_wait_until_not_busy` to keep waiting for completion.',
        'If the process appears stuck, use `terminal_interrupt_process` before retrying.'
      ],
      direction: 'horizontal',
      created: true
    })
  })

  it('routes terminal_run_command_in_directory through the terminal adapter', async () => {
    const handler = getToolHandler('terminal_run_command_in_directory')
    const result = await handler({
      command: 'pnpm test',
      directory: '/Users/demo/project',
      application: 'Terminal',
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining(`cd '/Users/demo/project' && pnpm test`),
      timeoutMs: 5000
    })
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toBe('Ran command in Terminal at /Users/demo/project.')
  })

  it('routes terminal_interrupt_process through the terminal adapter', async () => {
    const handler = getToolHandler('terminal_interrupt_process')
    const result = await handler({
      application: 'iTerm2',
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.activateApplication).toHaveBeenCalledWith({
      workDir: '/workspace',
      application: 'iTerm2',
      timeoutMs: 5000
    })
    expect(mocks.pressKey).toHaveBeenCalledWith({
      workDir: '/workspace',
      key: 'c',
      modifiers: ['control'],
      timeoutMs: 5000
    })
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toBe('Sent interrupt to iTerm2.')
  })

  it('routes terminal_get_session_state through the terminal adapter', async () => {
    mocks.runAppleScript.mockResolvedValueOnce({
      runner: 'osascript',
      cwd: '/tmp',
      returnCode: 0,
      stdout: '2\t3\t2\ttrue\tfalse\tServer\t/dev/ttys001',
      stderr: '',
      timedOut: false,
      timeoutMs: 5000,
      ok: true
    })

    const handler = getToolHandler('terminal_get_session_state')
    const result = await handler({
      application: 'iTerm2',
      windowIndex: 2,
      tabIndex: 3,
      paneIndex: 2,
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('set busyValue to is processing of targetSession'),
      timeoutMs: 5000
    })
    expect(result.isError).toBeUndefined()
    expect(JSON.parse(result.content[0]?.text || '{}')).toEqual({
      application: 'iTerm2',
      windowIndex: 2,
      tabIndex: 3,
      sessionIndex: 2,
      paneIndex: 2,
      active: true,
      busy: false,
      title: 'Server',
      tty: '/dev/ttys001',
      completed: false,
      exitStatus: null,
      exitMarkerCount: 0,
      completionState: 'idle_without_exit_status',
      recoveryHint: 'iTerm2 is idle, but no structured exit status was observed yet.',
      recoverySuggestions: [
        'Use `terminal_run_command_and_wait` if you need a reliable exit status.',
        'Use `terminal_read_output` to inspect the final lines before continuing.'
      ]
    })
  })

  it('routes terminal_get_last_command_result through the terminal adapter', async () => {
    mocks.runAppleScript.mockResolvedValueOnce({
      runner: 'osascript',
      cwd: '/tmp',
      returnCode: 0,
      stdout: [
        'build...',
        '__SKILLSFAN_COMMAND_START__=cmd_abc123',
        'done',
        '__SKILLSFAN_COMMAND_RESULT__=cmd_abc123\t0',
        '__SKILLSFAN_EXIT_STATUS__=0'
      ].join('\n'),
      stderr: '',
      timedOut: false,
      timeoutMs: 5000,
      ok: true
    })

    const handler = getToolHandler('terminal_get_last_command_result')
    const result = await handler({
      application: 'iTerm2',
      windowIndex: 2,
      tabIndex: 3,
      paneIndex: 2,
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('return contents of targetSession'),
      timeoutMs: 5000
    })
    expect(result.isError).toBeUndefined()
    expect(JSON.parse(result.content[0]?.text || '{}')).toEqual({
      application: 'iTerm2',
      commandId: 'cmd_abc123',
      completed: true,
      exitStatus: 0,
      exitMarkerCount: 1,
      windowIndex: 2,
      tabIndex: 3,
      sessionIndex: 2,
      paneIndex: 2,
      completionState: 'succeeded',
      recoveryHint: 'iTerm2 command finished successfully.',
      recoverySuggestions: []
    })
  })

  it('routes terminal_read_output through the terminal adapter', async () => {
    mocks.runAppleScript.mockResolvedValueOnce({
      runner: 'osascript',
      cwd: '/tmp',
      returnCode: 0,
      stdout: 'alpha\nbeta\ngamma\n__SKILLSFAN_EXIT_STATUS__=0\n',
      stderr: '',
      timedOut: false,
      timeoutMs: 5000,
      ok: true
    })

    const handler = getToolHandler('terminal_read_output')
    const result = await handler({
      application: 'iTerm2',
      windowIndex: 2,
      tabIndex: 3,
      paneIndex: 2,
      maxChars: 10,
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('return contents of targetSession'),
      timeoutMs: 5000
    })
    expect(result.isError).toBeUndefined()
    expect(JSON.parse(result.content[0]?.text || '{}')).toEqual({
      application: 'iTerm2',
      output: 'beta\ngamma',
      totalChars: 16,
      returnedChars: 10,
      truncated: true,
      completed: true,
      exitStatus: 0,
      exitMarkerCount: 1,
      windowIndex: 2,
      tabIndex: 3,
      sessionIndex: 2,
      paneIndex: 2,
      completionState: 'succeeded',
      recoveryHint: 'iTerm2 command finished successfully.',
      recoverySuggestions: []
    })
  })

  it('routes terminal_wait_for_output through the terminal adapter', async () => {
    mocks.runAppleScript
      .mockResolvedValueOnce({
        runner: 'osascript',
        cwd: '/tmp',
        returnCode: 0,
        stdout: 'booting\n',
        stderr: '',
        timedOut: false,
        timeoutMs: 5000,
        ok: true
      })
      .mockResolvedValueOnce({
        runner: 'osascript',
        cwd: '/tmp',
        returnCode: 0,
        stdout: 'booting\nready\n',
        stderr: '',
        timedOut: false,
        timeoutMs: 5000,
        ok: true
      })

    const handler = getToolHandler('terminal_wait_for_output')
    const result = await handler({
      application: 'Terminal',
      expectedText: 'ready',
      pollIntervalMs: 100,
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.runAppleScript).toHaveBeenCalledTimes(2)
    expect(result.isError).toBeUndefined()
    expect(JSON.parse(result.content[0]?.text || '{}')).toEqual(expect.objectContaining({
      application: 'Terminal',
      expectedText: 'ready',
      matched: true,
      attempts: 2,
      completionState: 'idle_without_exit_status',
      recoveryHint: 'Terminal is idle, but no structured exit status was observed yet.',
      recoverySuggestions: [
        'Use `terminal_run_command_and_wait` if you need a reliable exit status.',
        'Use `terminal_read_output` to inspect the final lines before continuing.'
      ]
    }))
  })

  it('routes terminal_wait_until_not_busy through the terminal adapter', async () => {
    mocks.runAppleScript
      .mockResolvedValueOnce({
        runner: 'osascript',
        cwd: '/tmp',
        returnCode: 0,
        stdout: '2\t3\t2\ttrue\ttrue\tBuild\t/dev/ttys001',
        stderr: '',
        timedOut: false,
        timeoutMs: 1000,
        ok: true
      })
      .mockResolvedValueOnce({
        runner: 'osascript',
        cwd: '/tmp',
        returnCode: 0,
        stdout: '2\t3\t2\ttrue\tfalse\tBuild\t/dev/ttys001',
        stderr: '',
        timedOut: false,
        timeoutMs: 1000,
        ok: true
      })
      .mockResolvedValueOnce({
        runner: 'osascript',
        cwd: '/tmp',
        returnCode: 0,
        stdout: 'done\n__SKILLSFAN_EXIT_STATUS__=0\n',
        stderr: '',
        timedOut: false,
        timeoutMs: 1000,
        ok: true
      })

    const handler = getToolHandler('terminal_wait_until_not_busy')
    const result = await handler({
      application: 'iTerm2',
      windowIndex: 2,
      tabIndex: 3,
      paneIndex: 2,
      pollIntervalMs: 100,
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.runAppleScript).toHaveBeenCalledTimes(3)
    expect(result.isError).toBeUndefined()
    expect(JSON.parse(result.content[0]?.text || '{}')).toEqual(expect.objectContaining({
      application: 'iTerm2',
      windowIndex: 2,
      tabIndex: 3,
      sessionIndex: 2,
      paneIndex: 2,
      busy: false,
      completed: true,
      exitStatus: 0,
      exitMarkerCount: 1,
      attempts: 2,
      completionState: 'succeeded',
      recoveryHint: 'iTerm2 command finished successfully.',
      recoverySuggestions: []
    }))
  })

  it('routes terminal_wait_until_idle through the terminal adapter', async () => {
    mocks.runAppleScript
      .mockResolvedValueOnce({
        runner: 'osascript',
        cwd: '/tmp',
        returnCode: 0,
        stdout: 'booting\n',
        stderr: '',
        timedOut: false,
        timeoutMs: 5000,
        ok: true
      })
      .mockResolvedValueOnce({
        runner: 'osascript',
        cwd: '/tmp',
        returnCode: 0,
        stdout: 'ready\n',
        stderr: '',
        timedOut: false,
        timeoutMs: 5000,
        ok: true
      })
      .mockResolvedValueOnce({
        runner: 'osascript',
        cwd: '/tmp',
        returnCode: 0,
        stdout: 'ready\n',
        stderr: '',
        timedOut: false,
        timeoutMs: 5000,
        ok: true
      })
      .mockResolvedValueOnce({
        runner: 'osascript',
        cwd: '/tmp',
        returnCode: 0,
        stdout: 'ready\n',
        stderr: '',
        timedOut: false,
        timeoutMs: 5000,
        ok: true
      })

    const handler = getToolHandler('terminal_wait_until_idle')
    const result = await handler({
      application: 'Terminal',
      idleMs: 100,
      pollIntervalMs: 100,
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.runAppleScript).toHaveBeenCalledTimes(3)
    expect(result.isError).toBeUndefined()
    expect(JSON.parse(result.content[0]?.text || '{}')).toEqual(expect.objectContaining({
      application: 'Terminal',
      idleMs: 100,
      stable: true,
      checks: 3,
      completionState: 'idle_without_exit_status',
      recoveryHint: 'Terminal is idle, but no structured exit status was observed yet.',
      recoverySuggestions: [
        'Use `terminal_run_command_and_wait` if you need a reliable exit status.',
        'Use `terminal_read_output` to inspect the final lines before continuing.'
      ]
    }))
  })

  it('routes terminal_run_command_and_wait through the terminal adapter', async () => {
    mocks.runAppleScript
      .mockResolvedValueOnce({
        runner: 'osascript',
        cwd: '/tmp',
        returnCode: 1,
        stdout: '',
        stderr: 'Terminal has no open windows.',
        timedOut: false,
        timeoutMs: 5000,
        ok: false
      })
      .mockResolvedValueOnce({
        runner: 'osascript',
        cwd: '/tmp',
        returnCode: 0,
        stdout: '',
        stderr: '',
        timedOut: false,
        timeoutMs: 5000,
        ok: true
      })
      .mockResolvedValueOnce({
        runner: 'osascript',
        cwd: '/tmp',
        returnCode: 0,
        stdout: 'running\n',
        stderr: '',
        timedOut: false,
        timeoutMs: 5000,
        ok: true
      })
      .mockResolvedValueOnce({
        runner: 'osascript',
        cwd: '/tmp',
        returnCode: 0,
        stdout: 'running\ndone\n__SKILLSFAN_EXIT_STATUS__=0\n',
        stderr: '',
        timedOut: false,
        timeoutMs: 5000,
        ok: true
      })

    const handler = getToolHandler('terminal_run_command_and_wait')
    const result = await handler({
      application: 'Terminal',
      command: 'pnpm test',
      pollIntervalMs: 100,
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.runAppleScript).toHaveBeenNthCalledWith(2, {
      workDir: '/workspace',
      script: expect.stringContaining('__SKILLSFAN_EXIT_STATUS__='),
      timeoutMs: 5000
    })
    expect(result.isError).toBeUndefined()
    expect(JSON.parse(result.content[0]?.text || '{}')).toEqual(expect.objectContaining({
      commandId: expect.any(String),
      application: 'Terminal',
      completed: true,
      exitStatus: 0,
      exitMarkerCount: 1,
      attempts: 2,
      completionState: 'succeeded',
      recoveryHint: 'Terminal command finished successfully.',
      recoverySuggestions: []
    }))
  })

  it('routes terminal_run_command_in_directory_and_wait through the terminal adapter', async () => {
    mocks.runAppleScript
      .mockResolvedValueOnce({
        runner: 'osascript',
        cwd: '/tmp',
        returnCode: 0,
        stdout: 'old output\n__SKILLSFAN_EXIT_STATUS__=0\n',
        stderr: '',
        timedOut: false,
        timeoutMs: 5000,
        ok: true
      })
      .mockResolvedValueOnce({
        runner: 'osascript',
        cwd: '/tmp',
        returnCode: 0,
        stdout: '',
        stderr: '',
        timedOut: false,
        timeoutMs: 5000,
        ok: true
      })
      .mockResolvedValueOnce({
        runner: 'osascript',
        cwd: '/tmp',
        returnCode: 0,
        stdout: 'old output\n__SKILLSFAN_EXIT_STATUS__=0\nrunning\n',
        stderr: '',
        timedOut: false,
        timeoutMs: 5000,
        ok: true
      })
      .mockResolvedValueOnce({
        runner: 'osascript',
        cwd: '/tmp',
        returnCode: 0,
        stdout: 'old output\n__SKILLSFAN_EXIT_STATUS__=0\nrunning\ndone\n__SKILLSFAN_EXIT_STATUS__=2\n',
        stderr: '',
        timedOut: false,
        timeoutMs: 5000,
        ok: true
      })

    const handler = getToolHandler('terminal_run_command_in_directory_and_wait')
    const result = await handler({
      application: 'iTerm2',
      command: 'pnpm lint',
      directory: '/Users/demo/project',
      pollIntervalMs: 100,
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.runAppleScript).toHaveBeenNthCalledWith(2, {
      workDir: '/workspace',
      script: expect.stringContaining(`cd '/Users/demo/project' && pnpm lint`),
      timeoutMs: 5000
    })
    expect(result.isError).toBeUndefined()
    expect(JSON.parse(result.content[0]?.text || '{}')).toEqual(expect.objectContaining({
      commandId: expect.any(String),
      application: 'iTerm2',
      completed: true,
      exitStatus: 2,
      exitMarkerCount: 2,
      attempts: 2,
      completionState: 'failed',
      recoveryHint: 'iTerm2 command exited with status 2.',
      recoverySuggestions: [
        'Use `terminal_read_output` to inspect the latest output tail.',
        'Fix the command or environment, then retry with `terminal_run_command_and_wait`.'
      ]
    }))
  })

  it('routes chrome_open_url through the chrome adapter', async () => {
    const handler = getToolHandler('chrome_open_url')
    const result = await handler({
      url: 'https://example.com/docs',
      application: 'Google Chrome',
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.openApplication).toHaveBeenCalledWith({
      workDir: '/workspace',
      application: 'Google Chrome',
      target: 'https://example.com/docs',
      activate: undefined,
      timeoutMs: 5000
    })
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toBe('Opened https://example.com/docs in Google Chrome.')
  })

  it('routes chrome_open_url_in_new_tab through the chrome adapter', async () => {
    const handler = getToolHandler('chrome_open_url_in_new_tab')
    const result = await handler({
      url: 'https://example.com/docs',
      application: 'Google Chrome',
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('make new tab at end of tabs'),
      timeoutMs: 5000
    })
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toBe('Opened https://example.com/docs in a new tab in Google Chrome.')
  })

  it('routes chrome_focus_tab through the chrome adapter', async () => {
    const handler = getToolHandler('chrome_focus_tab')
    const result = await handler({
      title: 'Dashboard',
      application: 'Google Chrome',
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('if title of t contains "Dashboard" then'),
      timeoutMs: 5000
    })
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toBe('Focused a tab matching "Dashboard" in Google Chrome.')
  })

  it('routes chrome_new_tab through the chrome adapter', async () => {
    const handler = getToolHandler('chrome_new_tab')
    const result = await handler({
      application: 'Google Chrome',
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.activateApplication).toHaveBeenCalledWith({
      workDir: '/workspace',
      application: 'Google Chrome',
      timeoutMs: 5000
    })
    expect(mocks.pressKey).toHaveBeenCalledWith({
      workDir: '/workspace',
      key: 't',
      modifiers: ['command'],
      timeoutMs: 5000
    })
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toBe('Opened a new tab in Google Chrome.')
  })

  it('routes chrome_reload_active_tab through the chrome adapter', async () => {
    const handler = getToolHandler('chrome_reload_active_tab')
    const result = await handler({
      application: 'Chromium',
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.activateApplication).toHaveBeenCalledWith({
      workDir: '/workspace',
      application: 'Chromium',
      timeoutMs: 5000
    })
    expect(mocks.pressKey).toHaveBeenCalledWith({
      workDir: '/workspace',
      key: 'r',
      modifiers: ['command'],
      timeoutMs: 5000
    })
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toBe('Reloaded the active tab in Chromium.')
  })

  it('routes chrome_focus_tab_by_url through the chrome adapter', async () => {
    const handler = getToolHandler('chrome_focus_tab_by_url')
    const result = await handler({
      url: 'example.com/dashboard',
      application: 'Google Chrome',
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('if URL of t contains "example.com/dashboard" then'),
      timeoutMs: 5000
    })
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toBe('Focused a tab matching URL "example.com/dashboard" in Google Chrome.')
  })

  it('routes chrome_list_tabs through the chrome adapter', async () => {
    mocks.runAppleScript.mockResolvedValueOnce({
      runner: 'osascript',
      cwd: '/tmp',
      returnCode: 0,
      stdout: [
        '1\t1\ttrue\tInbox\thttps://mail.example.com',
        '1\t2\tfalse\tDocs\thttps://docs.example.com'
      ].join('\n'),
      stderr: '',
      timedOut: false,
      timeoutMs: 5000,
      ok: true
    })

    const handler = getToolHandler('chrome_list_tabs')
    const result = await handler({
      application: 'Google Chrome',
      limit: 1,
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('repeat with t in tabs of w'),
      timeoutMs: 5000
    })
    expect(result.isError).toBeUndefined()
    expect(JSON.parse(result.content[0]?.text || '{}')).toEqual({
      application: 'Google Chrome',
      tabs: [
        {
          windowIndex: 1,
          tabIndex: 1,
          active: true,
          title: 'Inbox',
          url: 'https://mail.example.com'
        }
      ],
      totalTabs: 2,
      returnedTabs: 1,
      truncated: true
    })
  })

  it('routes chrome_find_tabs through the chrome adapter', async () => {
    mocks.runAppleScript.mockResolvedValueOnce({
      runner: 'osascript',
      cwd: '/tmp',
      returnCode: 0,
      stdout: [
        '1\t1\ttrue\tInbox\thttps://mail.example.com',
        '1\t2\tfalse\tDocs\thttps://docs.example.com',
        '2\t1\tfalse\tPricing\thttps://openai.com/pricing'
      ].join('\n'),
      stderr: '',
      timedOut: false,
      timeoutMs: 5000,
      ok: true
    })

    const handler = getToolHandler('chrome_find_tabs')
    const result = await handler({
      application: 'Google Chrome',
      query: 'openai.com',
      field: 'domain',
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('repeat with t in tabs of w'),
      timeoutMs: 5000
    })
    expect(result.isError).toBeUndefined()
    expect(JSON.parse(result.content[0]?.text || '{}')).toEqual({
      application: 'Google Chrome',
      query: 'openai.com',
      field: 'domain',
      tabs: [
        {
          windowIndex: 2,
          tabIndex: 1,
          active: false,
          title: 'Pricing',
          url: 'https://openai.com/pricing'
        }
      ],
      totalMatches: 1,
      returnedMatches: 1,
      truncated: false
    })
  })

  it('routes chrome_close_tabs through the chrome adapter', async () => {
    mocks.runAppleScript
      .mockResolvedValueOnce({
        runner: 'osascript',
        cwd: '/tmp',
        returnCode: 0,
        stdout: [
          '1\t1\ttrue\tDocs\thttps://docs.example.com',
          '1\t2\tfalse\tPricing\thttps://openai.com/pricing'
        ].join('\n'),
        stderr: '',
        timedOut: false,
        timeoutMs: 5000,
        ok: true
      })
      .mockResolvedValueOnce({
        runner: 'osascript',
        cwd: '/tmp',
        returnCode: 0,
        stdout: '',
        stderr: '',
        timedOut: false,
        timeoutMs: 5000,
        ok: true
      })
      .mockResolvedValueOnce({
        runner: 'osascript',
        cwd: '/tmp',
        returnCode: 0,
        stdout: '1\t1\ttrue\tPricing\thttps://openai.com/pricing',
        stderr: '',
        timedOut: false,
        timeoutMs: 5000,
        ok: true
      })

    const handler = getToolHandler('chrome_close_tabs')
    const result = await handler({
      application: 'Google Chrome',
      query: 'docs',
      field: 'either',
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.pressKey).toHaveBeenCalledWith({
      workDir: '/workspace',
      key: 'w',
      modifiers: ['command'],
      timeoutMs: 5000
    })
    expect(result.isError).toBeUndefined()
    expect(JSON.parse(result.content[0]?.text || '{}')).toEqual({
      application: 'Google Chrome',
      query: 'docs',
      field: 'either',
      closedTabs: [
        {
          windowIndex: 1,
          tabIndex: 1,
          active: true,
          title: 'Docs',
          url: 'https://docs.example.com'
        }
      ],
      requestedMatches: 1,
      closedCount: 1,
      remainingMatches: 0
    })
  })

  it('routes chrome_get_active_tab through the chrome adapter', async () => {
    mocks.runAppleScript.mockResolvedValueOnce({
      runner: 'osascript',
      cwd: '/tmp',
      returnCode: 0,
      stdout: '1\t3\tDocs\thttps://docs.example.com',
      stderr: '',
      timedOut: false,
      timeoutMs: 5000,
      ok: true
    })

    const handler = getToolHandler('chrome_get_active_tab')
    const result = await handler({
      application: 'Chromium',
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('set activeTabRef to active tab of frontWindow'),
      timeoutMs: 5000
    })
    expect(result.isError).toBeUndefined()
    expect(JSON.parse(result.content[0]?.text || '{}')).toEqual({
      application: 'Chromium',
      windowIndex: 1,
      tabIndex: 3,
      title: 'Docs',
      url: 'https://docs.example.com'
    })
  })

  it('routes chrome_wait_for_tab through the chrome adapter', async () => {
    mocks.runAppleScript
      .mockResolvedValueOnce({
        runner: 'osascript',
        cwd: '/tmp',
        returnCode: 0,
        stdout: [
          '1\t1\ttrue\tInbox\thttps://mail.example.com',
          '1\t2\tfalse\tDocs\thttps://docs.example.com'
        ].join('\n'),
        stderr: '',
        timedOut: false,
        timeoutMs: 1000,
        ok: true
      })
      .mockResolvedValueOnce({
        runner: 'osascript',
        cwd: '/tmp',
        returnCode: 0,
        stdout: [
          '1\t1\ttrue\tInbox\thttps://mail.example.com',
          '2\t1\tfalse\tPricing\thttps://openai.com/pricing'
        ].join('\n'),
        stderr: '',
        timedOut: false,
        timeoutMs: 1000,
        ok: true
      })

    const handler = getToolHandler('chrome_wait_for_tab')
    const result = await handler({
      application: 'Google Chrome',
      query: 'openai.com',
      field: 'domain',
      pollIntervalMs: 100,
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.runAppleScript).toHaveBeenCalledTimes(2)
    expect(result.isError).toBeUndefined()
    expect(JSON.parse(result.content[0]?.text || '{}')).toEqual(expect.objectContaining({
      application: 'Google Chrome',
      query: 'openai.com',
      field: 'domain',
      matched: true,
      totalMatches: 1,
      returnedMatches: 1,
      attempts: 2,
      tabs: [
        {
          windowIndex: 2,
          tabIndex: 1,
          active: false,
          title: 'Pricing',
          url: 'https://openai.com/pricing'
        }
      ]
    }))
  })

  it('routes chrome_wait_for_active_tab through the chrome adapter', async () => {
    mocks.runAppleScript
      .mockResolvedValueOnce({
        runner: 'osascript',
        cwd: '/tmp',
        returnCode: 0,
        stdout: '1\t1\tInbox\thttps://mail.example.com',
        stderr: '',
        timedOut: false,
        timeoutMs: 1000,
        ok: true
      })
      .mockResolvedValueOnce({
        runner: 'osascript',
        cwd: '/tmp',
        returnCode: 0,
        stdout: '2\t4\tDashboard\thttps://app.example.com/dashboard',
        stderr: '',
        timedOut: false,
        timeoutMs: 1000,
        ok: true
      })

    const handler = getToolHandler('chrome_wait_for_active_tab')
    const result = await handler({
      application: 'Chromium',
      query: 'dashboard',
      field: 'title',
      pollIntervalMs: 100,
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.runAppleScript).toHaveBeenCalledTimes(2)
    expect(result.isError).toBeUndefined()
    expect(JSON.parse(result.content[0]?.text || '{}')).toEqual(expect.objectContaining({
      application: 'Chromium',
      query: 'dashboard',
      field: 'title',
      matched: true,
      attempts: 2,
      windowIndex: 2,
      tabIndex: 4,
      title: 'Dashboard',
      url: 'https://app.example.com/dashboard'
    }))
  })

  it('routes chrome_close_active_tab through the chrome adapter', async () => {
    const handler = getToolHandler('chrome_close_active_tab')
    const result = await handler({
      application: 'Google Chrome',
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.activateApplication).toHaveBeenCalledWith({
      workDir: '/workspace',
      application: 'Google Chrome',
      timeoutMs: 5000
    })
    expect(mocks.pressKey).toHaveBeenCalledWith({
      workDir: '/workspace',
      key: 'w',
      modifiers: ['command'],
      timeoutMs: 5000
    })
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toBe('Closed the active tab in Google Chrome.')
  })

  it('routes skillsfan_open_settings through the skillsfan adapter', async () => {
    const handler = getToolHandler('skillsfan_open_settings')
    const result = await handler({
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.activateApplication).toHaveBeenCalledWith({
      workDir: '/workspace',
      application: 'SkillsFan',
      timeoutMs: 5000
    })
    expect(mocks.pressKey).toHaveBeenCalledWith({
      workDir: '/workspace',
      key: ',',
      modifiers: ['command'],
      timeoutMs: 5000
    })
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toBe('Opened settings in SkillsFan.')
  })

  it('routes skillsfan_focus_main_window through the skillsfan adapter', async () => {
    const handler = getToolHandler('skillsfan_focus_main_window')
    const result = await handler({
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.focusWindow).toHaveBeenCalledWith({
      workDir: '/workspace',
      application: 'SkillsFan',
      timeoutMs: 5000
    })
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toBe('Focused SkillsFan.')
  })

  it('preserves structured window_not_found errors for chrome_focus_tab misses', async () => {
    mocks.runAppleScript.mockResolvedValueOnce({
      runner: 'osascript',
      cwd: '/tmp',
      returnCode: 1,
      stdout: '',
      stderr: 'Tab not found: Dashboard',
      timedOut: false,
      timeoutMs: 5000,
      ok: false,
      errorCode: 'window_not_found',
      errorMessage: 'Tab not found: Dashboard'
    })

    const handler = getToolHandler('chrome_focus_tab')
    const result = await handler({
      title: 'Dashboard',
      application: 'Google Chrome',
      timeoutMs: 5000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toBe('Chrome tab focus failed (window_not_found): Tab not found: Dashboard')
  })

  it('routes activate_application through host runtime desktop', async () => {
    const handler = getToolHandler('activate_application')
    const result = await handler({
      application: 'Terminal',
      timeoutMs: 4000
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.activateApplication).toHaveBeenCalledWith({
      workDir: '/workspace',
      application: 'Terminal',
      timeoutMs: 4000
    })
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toBe('Activated Terminal.')
  })

  it('routes desktop_press_key through host runtime', async () => {
    const handler = getToolHandler('desktop_press_key')
    const result = await handler({
      key: 'l',
      modifiers: ['command']
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.pressKey).toHaveBeenCalledWith({
      workDir: '/workspace',
      key: 'l',
      modifiers: ['command']
    })
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toBe('Pressed command+l.')
  })

  it('routes desktop_type_text through host runtime without echoing full text', async () => {
    const handler = getToolHandler('desktop_type_text')
    const result = await handler({
      text: 'hello world'
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.typeText).toHaveBeenCalledWith({
      workDir: '/workspace',
      text: 'hello world'
    })
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toBe('Typed 11 characters.')
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

  it('includes structured desktop error codes for returned automation failures', async () => {
    mocks.pressKey.mockResolvedValueOnce({
      runner: 'osascript',
      cwd: '/tmp',
      returnCode: 1,
      stdout: '',
      stderr: 'System Events got an error: osascript is not allowed assistive access.',
      timedOut: false,
      timeoutMs: 1000,
      ok: false,
      errorCode: 'permission_denied',
      errorMessage: 'System Events got an error: osascript is not allowed assistive access.'
    })

    const handler = getToolHandler('desktop_press_key')
    const result = await handler({
      key: 'Enter'
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toBe(
      'Press key failed (permission_denied): System Events got an error: osascript is not allowed assistive access.'
    )
  })

  it('includes structured desktop error codes for thrown automation failures', async () => {
    const error = new Error('Text cannot be empty.') as Error & { code?: string }
    error.code = 'invalid_input'
    mocks.typeText.mockRejectedValueOnce(error)

    const handler = getToolHandler('desktop_type_text')
    const result = await handler({
      text: '   '
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toBe('Type text failed (invalid_input): Text cannot be empty.')
  })

  it('fails desktop actions early when accessibility permission is missing', async () => {
    mocks.getEnvironmentStatus.mockResolvedValueOnce({
      platform: 'darwin',
      browser: { state: 'ready', backend: 'automated', toolCount: 0 },
      desktop: { state: 'ready' },
      permissions: {
        accessibility: { state: 'needs_permission' },
        screenRecording: { state: 'granted' }
      }
    })

    const handler = getToolHandler('desktop_press_key')
    const result = await handler({
      key: 'Enter'
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.pressKey).not.toHaveBeenCalled()
    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toBe(
      'Press key failed (permission_denied): macOS Accessibility permission is required for press_key. Open System Settings > Privacy & Security > Accessibility and allow SkillsFan.'
    )
  })

  it('routes desktop_click through host runtime', async () => {
    const handler = getToolHandler('desktop_click')
    const result = await handler({ x: 100, y: 200, button: 'right', clickCount: 2 }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.clickAtCoordinate).toHaveBeenCalledWith({
      workDir: '/workspace',
      x: 100,
      y: 200,
      button: 'right',
      clickCount: 2
    })
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toContain('Clicked at (100, 200)')
    expect(result.content[0]?.text).toContain('right-click')
    expect(result.content[0]?.text).toContain('double-click')
  })

  it('routes desktop_move_mouse through host runtime', async () => {
    const handler = getToolHandler('desktop_move_mouse')
    const result = await handler({ x: 300, y: 400 }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.moveMouse).toHaveBeenCalledWith({ workDir: '/workspace', x: 300, y: 400 })
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toBe('Moved mouse to (300, 400).')
  })

  it('routes desktop_scroll through host runtime', async () => {
    const handler = getToolHandler('desktop_scroll')
    const result = await handler({ x: 500, y: 600, deltaY: -3 }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.scroll).toHaveBeenCalledWith({
      workDir: '/workspace',
      x: 500,
      y: 600,
      deltaY: -3
    })
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toContain('Scrolled at (500, 600)')
  })

  it('routes desktop_list_windows through host runtime', async () => {
    const handler = getToolHandler('desktop_list_windows')
    const result = await handler({ application: 'Finder' }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.listWindows).toHaveBeenCalledWith({
      workDir: '/workspace',
      application: 'Finder'
    })
    expect(result.isError).toBeUndefined()
    const parsed = JSON.parse(result.content[0]?.text)
    expect(parsed.windows).toHaveLength(1)
    expect(parsed.windows[0].application).toBe('Finder')
  })

  it('routes desktop_focus_window through host runtime', async () => {
    const handler = getToolHandler('desktop_focus_window')
    const result = await handler({
      application: 'Finder',
      windowName: 'Documents'
    }) as {
      content: Array<{ text: string }>
      isError?: boolean
    }

    expect(mocks.focusWindow).toHaveBeenCalledWith({
      workDir: '/workspace',
      application: 'Finder',
      windowName: 'Documents'
    })
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toContain('Focused Finder "Documents"')
  })
})
