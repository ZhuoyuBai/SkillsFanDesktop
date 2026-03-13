import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  executeDesktopAdapterMethod,
  maybeExecuteOpenApplicationAdapterMethod
} from '../../../../src/gateway/host-runtime/desktop/adapters/executor'

const successResult = {
  runner: 'osascript',
  cwd: '/workspace',
  returnCode: 0,
  stdout: '',
  stderr: '',
  timedOut: false,
  timeoutMs: 2000,
  ok: true
}

describe('desktop adapter executor', () => {
  const runtime = {
    getCapabilities: vi.fn(),
    openApplication: vi.fn(async (args) => ({
      ...successResult,
      runner: `open -a ${args.application}`
    })),
    runAppleScript: vi.fn(async () => ({ ...successResult })),
    activateApplication: vi.fn(async () => ({ ...successResult })),
    pressKey: vi.fn(async () => ({ ...successResult })),
    typeText: vi.fn(async () => ({ ...successResult })),
    clickAtCoordinate: vi.fn(async () => ({ ...successResult })),
    moveMouse: vi.fn(async () => ({ ...successResult })),
    scroll: vi.fn(async () => ({ ...successResult })),
    listWindows: vi.fn(async () => ({ windows: [] })),
    focusWindow: vi.fn(async () => ({ ...successResult }))
  }

  beforeEach(() => {
    vi.clearAllMocks()
    runtime.getCapabilities.mockReset()
    runtime.openApplication.mockReset().mockImplementation(async (args) => ({
      ...successResult,
      runner: `open -a ${args.application}`
    }))
    runtime.runAppleScript.mockReset().mockImplementation(async () => ({ ...successResult }))
    runtime.activateApplication.mockReset().mockImplementation(async () => ({ ...successResult }))
    runtime.pressKey.mockReset().mockImplementation(async () => ({ ...successResult }))
    runtime.typeText.mockReset().mockImplementation(async () => ({ ...successResult }))
    runtime.clickAtCoordinate.mockReset().mockImplementation(async () => ({ ...successResult }))
    runtime.moveMouse.mockReset().mockImplementation(async () => ({ ...successResult }))
    runtime.scroll.mockReset().mockImplementation(async () => ({ ...successResult }))
    runtime.listWindows.mockReset().mockImplementation(async () => ({ windows: [] }))
    runtime.focusWindow.mockReset().mockImplementation(async () => ({ ...successResult }))
  })

  it('executes finder reveal_path via structured AppleScript helper', async () => {
    const execution = await executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'finder',
        methodId: 'finder.reveal_path',
        target: '/Users/demo/Documents'
      }
    })

    expect(runtime.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('reveal POSIX file "/Users/demo/Documents"'),
      timeoutMs: undefined
    })
    expect(execution.stage).toBe('active')
    expect(execution.successText).toBe('Revealed /Users/demo/Documents in Finder.')
  })

  it('executes finder open_folder via structured open_application helper', async () => {
    const execution = await executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'finder',
        methodId: 'finder.open_folder',
        application: 'Finder',
        target: '/tmp',
        activate: true,
        timeoutMs: 4000
      }
    })

    expect(runtime.openApplication).toHaveBeenCalledWith({
      workDir: '/workspace',
      application: 'Finder',
      target: '/tmp',
      activate: true,
      timeoutMs: 4000
    })
    expect(execution.stage).toBe('active')
    expect(execution.successText).toBe('Opened folder /tmp in Finder.')
  })

  it('executes finder open_home_folder via structured open_application helper', async () => {
    const execution = await executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'finder',
        methodId: 'finder.open_home_folder',
        application: 'Finder',
        activate: true,
        timeoutMs: 4000
      }
    })

    expect(runtime.openApplication).toHaveBeenCalledWith({
      workDir: '/workspace',
      application: 'Finder',
      target: expect.any(String),
      activate: true,
      timeoutMs: 4000
    })
    expect(execution.stage).toBe('active')
    expect(execution.successText).toBe('Opened the home folder in Finder.')
  })

  it('executes finder new_window through activate + shortcut helper', async () => {
    const execution = await executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'finder',
        methodId: 'finder.new_window',
        application: 'Finder',
        timeoutMs: 4000
      }
    })

    expect(runtime.activateApplication).toHaveBeenCalledWith({
      workDir: '/workspace',
      application: 'Finder',
      timeoutMs: 4000
    })
    expect(runtime.pressKey).toHaveBeenCalledWith({
      workDir: '/workspace',
      key: 'n',
      modifiers: ['command'],
      timeoutMs: 4000
    })
    expect(execution.stage).toBe('active')
    expect(execution.successText).toBe('Opened a new Finder window.')
  })

  it('executes finder search through the adapter helper', async () => {
    runtime.runAppleScript.mockResolvedValueOnce({
      ...successResult,
      stdout: '__COUNT__:3\n/Users/demo/Documents/Invoice.pdf\n/Users/demo/Documents/Invoice-copy.pdf\n'
    })

    const execution = await executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'finder',
        methodId: 'finder.search',
        command: 'invoice',
        target: '/Users/demo/Documents',
        limit: 2,
        timeoutMs: 4000
      }
    })

    expect(runtime.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('/usr/bin/mdfind -count -onlyin'),
      timeoutMs: 4000
    })
    expect(execution.stage).toBe('active')
    expect(execution.successText).toBe('Found 2 Finder search matches.')
    expect(execution.data).toEqual({
      query: 'invoice',
      directory: '/Users/demo/Documents',
      results: [
        '/Users/demo/Documents/Invoice.pdf',
        '/Users/demo/Documents/Invoice-copy.pdf'
      ],
      totalResults: 3,
      returnedResults: 2,
      truncated: true
    })
  })

  it('executes terminal run_command for iTerm through the adapter helper', async () => {
    const execution = await executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'terminal',
        methodId: 'terminal.run_command',
        application: 'iTerm2',
        command: 'pnpm test',
        windowIndex: 2,
        tabIndex: 3,
        sessionIndex: 1,
        timeoutMs: 5000
      }
    })

    expect(runtime.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('set targetSession to session 1 of targetTab'),
      timeoutMs: 5000
    })
    expect(execution.stage).toBe('active')
    expect(execution.successText).toBe('Ran command in iTerm2.')
  })

  it('executes terminal list_sessions through the adapter helper', async () => {
    runtime.runAppleScript.mockResolvedValueOnce({
      ...successResult,
      stdout: [
        '1\t1\t1\ttrue\tfalse\tserver\t/dev/ttys001',
        '1\t2\t1\tfalse\ttrue\tworker\t/dev/ttys002'
      ].join('\n')
    })

    const execution = await executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'terminal',
        methodId: 'terminal.list_sessions',
        application: 'iTerm2',
        limit: 1,
        timeoutMs: 5000
      }
    })

    expect(runtime.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('repeat with s in sessions of t'),
      timeoutMs: 5000
    })
    expect(execution.stage).toBe('active')
    expect(execution.successText).toBe('Listed 1 iTerm2 sessions.')
    expect(execution.data).toEqual({
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

  it('executes terminal list_panes through the adapter helper', async () => {
    runtime.runAppleScript.mockResolvedValueOnce({
      ...successResult,
      stdout: [
        '2\t3\t1\ttrue\tfalse\tserver\t/dev/ttys001',
        '2\t3\t2\tfalse\ttrue\tworker\t/dev/ttys002'
      ].join('\n')
    })

    const execution = await executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'terminal',
        methodId: 'terminal.list_panes',
        application: 'iTerm2',
        windowIndex: 2,
        tabIndex: 3,
        limit: 1,
        timeoutMs: 5000
      }
    })

    expect(runtime.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('repeat with s in sessions of targetTab'),
      timeoutMs: 5000
    })
    expect(execution.stage).toBe('active')
    expect(execution.successText).toBe('Listed 1 iTerm2 panes.')
    expect(execution.data).toEqual({
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

  it('executes terminal get_pane_layout through the adapter helper', async () => {
    runtime.runAppleScript.mockResolvedValueOnce({
      ...successResult,
      stdout: [
        '__PANE__\t2\t3\t1\ttrue\tfalse\tserver\t/dev/ttys001\t120\t32',
        '__PANE__\t2\t3\t2\tfalse\ttrue\tworker\t/dev/ttys002\t120\t16'
      ].join('\n')
    })

    const execution = await executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'terminal',
        methodId: 'terminal.get_pane_layout',
        application: 'iTerm2',
        windowIndex: 2,
        tabIndex: 3,
        timeoutMs: 5000
      }
    })

    expect(runtime.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('__PANE__'),
      timeoutMs: 5000
    })
    expect(execution.stage).toBe('active')
    expect(execution.successText).toBe('Read pane layout from iTerm2.')
    expect(execution.data).toEqual({
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

  it('executes terminal focus_session through the adapter helper', async () => {
    const execution = await executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'terminal',
        methodId: 'terminal.focus_session',
        application: 'iTerm2',
        windowIndex: 2,
        tabIndex: 3,
        paneIndex: 2,
        timeoutMs: 5000
      }
    })

    expect(runtime.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('set targetSession to session 2 of targetTab'),
      timeoutMs: 5000
    })
    expect(execution.stage).toBe('active')
    expect(execution.successText).toBe('Focused iTerm2 session.')
  })

  it('executes terminal new_tab_run_command through the adapter helper', async () => {
    const execution = await executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'terminal',
        methodId: 'terminal.new_tab_run_command',
        application: 'Terminal',
        command: 'pnpm lint',
        timeoutMs: 5000
      }
    })

    expect(runtime.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('keystroke "t" using command down'),
      timeoutMs: 5000
    })
    expect(execution.stage).toBe('active')
    expect(execution.successText).toBe('Opened a new tab and ran command in Terminal.')
  })

  it('executes terminal new_window_run_command through the adapter helper', async () => {
    const execution = await executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'terminal',
        methodId: 'terminal.new_window_run_command',
        application: 'iTerm2',
        command: 'pnpm typecheck',
        timeoutMs: 5000
      }
    })

    expect(runtime.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('create window with default profile'),
      timeoutMs: 5000
    })
    expect(execution.stage).toBe('active')
    expect(execution.successText).toBe('Opened a new window and ran command in iTerm2.')
  })

  it('executes terminal split_pane_run_command through the adapter helper', async () => {
    runtime.runAppleScript.mockResolvedValueOnce({
      ...successResult,
      stdout: '2\t3\t4\ttrue\ttrue\tworker\t/dev/ttys004'
    })

    const execution = await executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'terminal',
        methodId: 'terminal.split_pane_run_command',
        application: 'iTerm2',
        command: 'pnpm dev',
        direction: 'horizontal',
        windowIndex: 2,
        tabIndex: 3,
        paneIndex: 2,
        timeoutMs: 5000
      }
    })

    expect(runtime.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('split horizontally with default profile'),
      timeoutMs: 5000
    })
    expect(execution.stage).toBe('active')
    expect(execution.successText).toBe('Split iTerm2 pane (horizontal) and ran command.')
    expect(execution.data).toEqual({
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

  it('executes terminal run_command_in_directory through the adapter helper', async () => {
    const execution = await executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'terminal',
        methodId: 'terminal.run_command_in_directory',
        application: 'Terminal',
        target: '/Users/demo/project',
        command: 'pnpm test',
        timeoutMs: 5000
      }
    })

    expect(runtime.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining(`cd '/Users/demo/project' && pnpm test`),
      timeoutMs: 5000
    })
    expect(execution.stage).toBe('active')
    expect(execution.successText).toBe('Ran command in Terminal at /Users/demo/project.')
  })

  it('executes terminal interrupt_process through activate + shortcut helper', async () => {
    const execution = await executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'terminal',
        methodId: 'terminal.interrupt_process',
        application: 'iTerm2',
        timeoutMs: 5000
      }
    })

    expect(runtime.activateApplication).toHaveBeenCalledWith({
      workDir: '/workspace',
      application: 'iTerm2',
      timeoutMs: 5000
    })
    expect(runtime.pressKey).toHaveBeenCalledWith({
      workDir: '/workspace',
      key: 'c',
      modifiers: ['control'],
      timeoutMs: 5000
    })
    expect(execution.stage).toBe('active')
    expect(execution.successText).toBe('Sent interrupt to iTerm2.')
  })

  it('executes terminal interrupt_process for a targeted iTerm session through focus + shortcut', async () => {
    const execution = await executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'terminal',
        methodId: 'terminal.interrupt_process',
        application: 'iTerm2',
        windowIndex: 2,
        tabIndex: 3,
        paneIndex: 2,
        timeoutMs: 5000
      }
    })

    expect(runtime.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('set targetSession to session 2 of targetTab'),
      timeoutMs: 5000
    })
    expect(runtime.pressKey).toHaveBeenCalledWith({
      workDir: '/workspace',
      key: 'c',
      modifiers: ['control'],
      timeoutMs: 5000
    })
    expect(execution.stage).toBe('active')
    expect(execution.successText).toBe('Sent interrupt to iTerm2.')
  })

  it('executes terminal get_session_state through the adapter helper', async () => {
    runtime.runAppleScript.mockResolvedValueOnce({
      ...successResult,
      stdout: '2\t3\t2\ttrue\tfalse\tServer\t/dev/ttys001'
    })

    const execution = await executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'terminal',
        methodId: 'terminal.get_session_state',
        application: 'iTerm2',
        windowIndex: 2,
        tabIndex: 3,
        paneIndex: 2,
        timeoutMs: 5000
      }
    })

    expect(runtime.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('set busyValue to is processing of targetSession'),
      timeoutMs: 5000
    })
    expect(execution.stage).toBe('active')
    expect(execution.successText).toBe('Read session state from iTerm2.')
    expect(execution.data).toEqual({
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

  it('executes terminal get_last_command_result through the adapter helper', async () => {
    runtime.runAppleScript.mockResolvedValueOnce({
      ...successResult,
      stdout: [
        'line 1',
        '__SKILLSFAN_COMMAND_START__=cmd_abc123',
        'running...',
        '__SKILLSFAN_COMMAND_RESULT__=cmd_abc123\t2',
        '__SKILLSFAN_EXIT_STATUS__=2'
      ].join('\n')
    })

    const execution = await executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'terminal',
        methodId: 'terminal.get_last_command_result',
        application: 'iTerm2',
        windowIndex: 2,
        tabIndex: 3,
        paneIndex: 2,
        timeoutMs: 5000
      }
    })

    expect(runtime.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('return contents of targetSession'),
      timeoutMs: 5000
    })
    expect(execution.stage).toBe('active')
    expect(execution.successText).toBe('Read last command result from iTerm2.')
    expect(execution.data).toEqual({
      application: 'iTerm2',
      commandId: 'cmd_abc123',
      completed: true,
      exitStatus: 2,
      exitMarkerCount: 1,
      windowIndex: 2,
      tabIndex: 3,
      sessionIndex: 2,
      paneIndex: 2,
      completionState: 'failed',
      recoveryHint: 'iTerm2 command exited with status 2.',
      recoverySuggestions: [
        'Use `terminal_read_output` to inspect the latest output tail.',
        'Fix the command or environment, then retry with `terminal_run_command_and_wait`.'
      ]
    })
  })

  it('executes terminal read_output through the adapter helper', async () => {
    runtime.runAppleScript.mockResolvedValueOnce({
      ...successResult,
      stdout: 'line 1\nline 2\nline 3\n__SKILLSFAN_EXIT_STATUS__=0\n'
    })

    const execution = await executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'terminal',
        methodId: 'terminal.read_output',
        application: 'iTerm2',
        windowIndex: 2,
        tabIndex: 3,
        sessionIndex: 1,
        maxChars: 8,
        timeoutMs: 5000
      }
    })

    expect(runtime.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('return contents of targetSession'),
      timeoutMs: 5000
    })
    expect(execution.stage).toBe('active')
    expect(execution.successText).toBe('Read output from iTerm2.')
    expect(execution.data).toEqual({
      application: 'iTerm2',
      output: '2\nline 3',
      totalChars: 20,
      returnedChars: 8,
      truncated: true,
      completed: true,
      exitStatus: 0,
      exitMarkerCount: 1,
      windowIndex: 2,
      tabIndex: 3,
      sessionIndex: 1,
      paneIndex: 1,
      completionState: 'succeeded',
      recoveryHint: 'iTerm2 command finished successfully.',
      recoverySuggestions: []
    })
  })

  it('executes terminal wait_for_output through the adapter helper', async () => {
    runtime.runAppleScript
      .mockResolvedValueOnce({
        ...successResult,
        stdout: 'starting...\n'
      })
      .mockResolvedValueOnce({
        ...successResult,
        stdout: 'starting...\nserver ready\n'
      })

    const execution = await executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'terminal',
        methodId: 'terminal.wait_for_output',
        application: 'Terminal',
        expectedText: 'server ready',
        pollIntervalMs: 1,
        timeoutMs: 5000
      }
    })

    expect(runtime.runAppleScript).toHaveBeenCalledTimes(2)
    expect(execution.stage).toBe('active')
    expect(execution.successText).toBe('Observed "server ready" in Terminal.')
    expect(execution.data).toEqual(expect.objectContaining({
      application: 'Terminal',
      expectedText: 'server ready',
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

  it('executes terminal wait_until_not_busy through the adapter helper', async () => {
    runtime.runAppleScript
      .mockResolvedValueOnce({
        ...successResult,
        stdout: '2\t3\t2\ttrue\ttrue\tBuild\t/dev/ttys001'
      })
      .mockResolvedValueOnce({
        ...successResult,
        stdout: '2\t3\t2\ttrue\tfalse\tBuild\t/dev/ttys001'
      })
      .mockResolvedValueOnce({
        ...successResult,
        stdout: 'done\n__SKILLSFAN_EXIT_STATUS__=0\n'
      })

    const execution = await executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'terminal',
        methodId: 'terminal.wait_until_not_busy',
        application: 'iTerm2',
        windowIndex: 2,
        tabIndex: 3,
        paneIndex: 2,
        pollIntervalMs: 100,
        timeoutMs: 5000
      }
    })

    expect(runtime.runAppleScript).toHaveBeenCalledTimes(3)
    expect(execution.stage).toBe('active')
    expect(execution.successText).toBe('Observed iTerm2 session idle state.')
    expect(execution.data).toEqual(expect.objectContaining({
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

  it('rejects pane targeting for Terminal because only iTerm supports panes', async () => {
    await expect(executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'terminal',
        methodId: 'terminal.read_output',
        application: 'Terminal',
        paneIndex: 2,
        timeoutMs: 5000
      }
    })).rejects.toThrow('paneIndex is only supported for iTerm and iTerm2.')
  })

  it('executes terminal wait_until_idle through the adapter helper', async () => {
    runtime.runAppleScript
      .mockResolvedValueOnce({
        ...successResult,
        stdout: 'building 1\n'
      })
      .mockResolvedValueOnce({
        ...successResult,
        stdout: 'building 2\n'
      })
      .mockResolvedValueOnce({
        ...successResult,
        stdout: 'building 2\n'
      })
      .mockResolvedValueOnce({
        ...successResult,
        stdout: 'building 2\n'
      })

    const execution = await executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'terminal',
        methodId: 'terminal.wait_until_idle',
        application: 'iTerm2',
        idleMs: 100,
        pollIntervalMs: 100,
        timeoutMs: 5000
      }
    })

    expect(runtime.runAppleScript).toHaveBeenCalledTimes(3)
    expect(execution.stage).toBe('active')
    expect(execution.successText).toBe('Observed iTerm2 idle state.')
    expect(execution.data).toEqual(expect.objectContaining({
      application: 'iTerm2',
      idleMs: 100,
      stable: true,
      checks: 3,
      completionState: 'idle_without_exit_status',
      recoveryHint: 'iTerm2 is idle, but no structured exit status was observed yet.',
      recoverySuggestions: [
        'Use `terminal_run_command_and_wait` if you need a reliable exit status.',
        'Use `terminal_read_output` to inspect the final lines before continuing.'
      ]
    }))
  })

  it('executes terminal run_command_and_wait through the adapter helper', async () => {
    runtime.runAppleScript
      .mockResolvedValueOnce({
        ...successResult,
        returnCode: 1,
        stdout: '',
        stderr: 'Terminal has no open windows.',
        ok: false
      })
      .mockResolvedValueOnce({
        ...successResult,
        stdout: ''
      })
      .mockResolvedValueOnce({
        ...successResult,
        stdout: 'running...\n'
      })
      .mockResolvedValueOnce({
        ...successResult,
        stdout: 'running...\ndone\n__SKILLSFAN_EXIT_STATUS__=0\n'
      })

    const execution = await executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'terminal',
        methodId: 'terminal.run_command_and_wait',
        application: 'Terminal',
        command: 'pnpm test',
        pollIntervalMs: 100,
        timeoutMs: 5000
      }
    })

    expect(runtime.runAppleScript).toHaveBeenNthCalledWith(2, {
      workDir: '/workspace',
      script: expect.stringContaining('__SKILLSFAN_EXIT_STATUS__='),
      timeoutMs: 5000
    })
    expect(execution.stage).toBe('active')
    expect(execution.successText).toBe('Completed command in Terminal.')
    expect(execution.data).toEqual(expect.objectContaining({
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

  it('executes terminal run_command_in_directory_and_wait through the adapter helper', async () => {
    runtime.runAppleScript
      .mockResolvedValueOnce({
        ...successResult,
        stdout: 'old output\n__SKILLSFAN_EXIT_STATUS__=0\n'
      })
      .mockResolvedValueOnce({
        ...successResult,
        stdout: ''
      })
      .mockResolvedValueOnce({
        ...successResult,
        stdout: 'old output\n__SKILLSFAN_EXIT_STATUS__=0\nrunning new command\n'
      })
      .mockResolvedValueOnce({
        ...successResult,
        stdout: 'old output\n__SKILLSFAN_EXIT_STATUS__=0\nrunning new command\ndone\n__SKILLSFAN_EXIT_STATUS__=2\n'
      })

    const execution = await executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'terminal',
        methodId: 'terminal.run_command_in_directory_and_wait',
        application: 'iTerm2',
        target: '/Users/demo/project',
        command: 'pnpm lint',
        pollIntervalMs: 100,
        timeoutMs: 5000
      }
    })

    expect(runtime.runAppleScript).toHaveBeenNthCalledWith(2, {
      workDir: '/workspace',
      script: expect.stringContaining(`cd '/Users/demo/project' && pnpm lint`),
      timeoutMs: 5000
    })
    expect(execution.stage).toBe('active')
    expect(execution.successText).toBe('Completed command in iTerm2 at /Users/demo/project.')
    expect(execution.data).toEqual(expect.objectContaining({
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

  it('executes chrome new_tab through activate + shortcut helper', async () => {
    const execution = await executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'chrome',
        methodId: 'chrome.new_tab',
        application: 'Google Chrome',
        timeoutMs: 5000
      }
    })

    expect(runtime.activateApplication).toHaveBeenCalledWith({
      workDir: '/workspace',
      application: 'Google Chrome',
      timeoutMs: 5000
    })
    expect(runtime.pressKey).toHaveBeenCalledWith({
      workDir: '/workspace',
      key: 't',
      modifiers: ['command'],
      timeoutMs: 5000
    })
    expect(execution.stage).toBe('active')
    expect(execution.successText).toBe('Opened a new tab in Google Chrome.')
  })

  it('executes chrome reload_active_tab through activate + shortcut helper', async () => {
    const execution = await executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'chrome',
        methodId: 'chrome.reload_active_tab',
        application: 'Chromium',
        timeoutMs: 5000
      }
    })

    expect(runtime.activateApplication).toHaveBeenCalledWith({
      workDir: '/workspace',
      application: 'Chromium',
      timeoutMs: 5000
    })
    expect(runtime.pressKey).toHaveBeenCalledWith({
      workDir: '/workspace',
      key: 'r',
      modifiers: ['command'],
      timeoutMs: 5000
    })
    expect(execution.stage).toBe('active')
    expect(execution.successText).toBe('Reloaded the active tab in Chromium.')
  })

  it('executes chrome focus_tab_by_url through the adapter helper', async () => {
    const execution = await executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'chrome',
        methodId: 'chrome.focus_tab_by_url',
        application: 'Google Chrome',
        target: 'example.com/dashboard',
        timeoutMs: 5000
      }
    })

    expect(runtime.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('if URL of t contains "example.com/dashboard" then'),
      timeoutMs: 5000
    })
    expect(execution.stage).toBe('active')
    expect(execution.successText).toBe('Focused a tab matching URL "example.com/dashboard" in Google Chrome.')
  })

  it('executes chrome open_url_in_new_tab through the adapter helper', async () => {
    const execution = await executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'chrome',
        methodId: 'chrome.open_url_in_new_tab',
        application: 'Google Chrome',
        target: 'https://example.com/docs',
        timeoutMs: 5000
      }
    })

    expect(runtime.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('make new tab at end of tabs'),
      timeoutMs: 5000
    })
    expect(execution.stage).toBe('active')
    expect(execution.successText).toBe('Opened https://example.com/docs in a new tab in Google Chrome.')
  })

  it('executes chrome list_tabs through the adapter helper', async () => {
    runtime.runAppleScript.mockResolvedValueOnce({
      ...successResult,
      stdout: [
        '1\t1\ttrue\tInbox\thttps://mail.example.com',
        '1\t2\tfalse\tDocs\thttps://docs.example.com'
      ].join('\n')
    })

    const execution = await executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'chrome',
        methodId: 'chrome.list_tabs',
        application: 'Google Chrome',
        limit: 1,
        timeoutMs: 5000
      }
    })

    expect(runtime.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('repeat with t in tabs of w'),
      timeoutMs: 5000
    })
    expect(execution.stage).toBe('active')
    expect(execution.successText).toBe('Listed 1 tabs in Google Chrome.')
    expect(execution.data).toEqual({
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

  it('executes chrome get_active_tab through the adapter helper', async () => {
    runtime.runAppleScript.mockResolvedValueOnce({
      ...successResult,
      stdout: '2\t4\tDashboard\thttps://app.example.com/dashboard'
    })

    const execution = await executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'chrome',
        methodId: 'chrome.get_active_tab',
        application: 'Chromium',
        timeoutMs: 5000
      }
    })

    expect(runtime.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('set activeTabRef to active tab of frontWindow'),
      timeoutMs: 5000
    })
    expect(execution.stage).toBe('active')
    expect(execution.successText).toBe('Read the active tab in Chromium.')
    expect(execution.data).toEqual({
      application: 'Chromium',
      windowIndex: 2,
      tabIndex: 4,
      title: 'Dashboard',
      url: 'https://app.example.com/dashboard'
    })
  })

  it('executes chrome wait_for_tab through the adapter helper', async () => {
    runtime.runAppleScript
      .mockResolvedValueOnce({
        ...successResult,
        stdout: [
          '1\t1\ttrue\tInbox\thttps://mail.example.com',
          '1\t2\tfalse\tDocs\thttps://docs.example.com'
        ].join('\n')
      })
      .mockResolvedValueOnce({
        ...successResult,
        stdout: [
          '1\t1\ttrue\tInbox\thttps://mail.example.com',
          '1\t2\tfalse\tDocs\thttps://docs.example.com',
          '2\t1\tfalse\tPricing\thttps://openai.com/pricing'
        ].join('\n')
      })

    const execution = await executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'chrome',
        methodId: 'chrome.wait_for_tab',
        application: 'Google Chrome',
        query: 'openai.com',
        field: 'domain',
        pollIntervalMs: 100,
        timeoutMs: 5000
      }
    })

    expect(runtime.runAppleScript).toHaveBeenCalledTimes(2)
    expect(runtime.runAppleScript).toHaveBeenNthCalledWith(1, {
      workDir: '/workspace',
      script: expect.stringContaining('repeat with t in tabs of w'),
      timeoutMs: 1000
    })
    expect(execution.stage).toBe('active')
    expect(execution.successText).toBe('Observed matching tab "openai.com" in Google Chrome.')
    expect(execution.data).toEqual(expect.objectContaining({
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

  it('executes chrome wait_for_active_tab through the adapter helper', async () => {
    runtime.runAppleScript
      .mockResolvedValueOnce({
        ...successResult,
        stdout: '1\t1\tInbox\thttps://mail.example.com'
      })
      .mockResolvedValueOnce({
        ...successResult,
        stdout: '2\t3\tDashboard\thttps://app.example.com/dashboard'
      })

    const execution = await executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'chrome',
        methodId: 'chrome.wait_for_active_tab',
        application: 'Chromium',
        query: 'dashboard',
        field: 'title',
        pollIntervalMs: 100,
        timeoutMs: 5000
      }
    })

    expect(runtime.runAppleScript).toHaveBeenCalledTimes(2)
    expect(runtime.runAppleScript).toHaveBeenNthCalledWith(1, {
      workDir: '/workspace',
      script: expect.stringContaining('set activeTabRef to active tab of frontWindow'),
      timeoutMs: 1000
    })
    expect(execution.stage).toBe('active')
    expect(execution.successText).toBe('Observed active tab "dashboard" in Chromium.')
    expect(execution.data).toEqual(expect.objectContaining({
      application: 'Chromium',
      query: 'dashboard',
      field: 'title',
      matched: true,
      attempts: 2,
      windowIndex: 2,
      tabIndex: 3,
      title: 'Dashboard',
      url: 'https://app.example.com/dashboard'
    }))
  })

  it('executes chrome close_active_tab through activate + shortcut helper', async () => {
    const execution = await executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'chrome',
        methodId: 'chrome.close_active_tab',
        application: 'Google Chrome',
        timeoutMs: 5000
      }
    })

    expect(runtime.activateApplication).toHaveBeenCalledWith({
      workDir: '/workspace',
      application: 'Google Chrome',
      timeoutMs: 5000
    })
    expect(runtime.pressKey).toHaveBeenCalledWith({
      workDir: '/workspace',
      key: 'w',
      modifiers: ['command'],
      timeoutMs: 5000
    })
    expect(execution.stage).toBe('active')
    expect(execution.successText).toBe('Closed the active tab in Google Chrome.')
  })

  it('executes chrome find_tabs through the adapter helper', async () => {
    runtime.runAppleScript.mockResolvedValueOnce({
      ...successResult,
      stdout: [
        '1\t1\ttrue\tInbox\thttps://mail.example.com',
        '1\t2\tfalse\tDocs\thttps://docs.example.com',
        '2\t1\tfalse\tPricing\thttps://openai.com/pricing'
      ].join('\n')
    })

    const execution = await executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'chrome',
        methodId: 'chrome.find_tabs',
        application: 'Google Chrome',
        query: 'docs',
        field: 'either',
        limit: 5,
        timeoutMs: 5000
      }
    })

    expect(runtime.runAppleScript).toHaveBeenCalledWith({
      workDir: '/workspace',
      script: expect.stringContaining('repeat with t in tabs of w'),
      timeoutMs: 5000
    })
    expect(execution.stage).toBe('active')
    expect(execution.successText).toBe('Found 1 matching tabs in Google Chrome.')
    expect(execution.data).toEqual({
      application: 'Google Chrome',
      query: 'docs',
      field: 'either',
      tabs: [
        {
          windowIndex: 1,
          tabIndex: 2,
          active: false,
          title: 'Docs',
          url: 'https://docs.example.com'
        }
      ],
      totalMatches: 1,
      returnedMatches: 1,
      truncated: false
    })
  })

  it('executes chrome close_tabs through the adapter helper', async () => {
    runtime.runAppleScript
      .mockResolvedValueOnce({
        ...successResult,
        stdout: [
          '1\t1\ttrue\tDocs\thttps://docs.example.com',
          '1\t2\tfalse\tPricing\thttps://openai.com/pricing'
        ].join('\n')
      })
      .mockResolvedValueOnce({
        ...successResult,
        stdout: ''
      })
      .mockResolvedValueOnce({
        ...successResult,
        stdout: [
          '1\t1\ttrue\tPricing\thttps://openai.com/pricing'
        ].join('\n')
      })

    const execution = await executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'chrome',
        methodId: 'chrome.close_tabs',
        application: 'Google Chrome',
        query: 'docs',
        field: 'either',
        timeoutMs: 5000
      }
    })

    expect(runtime.runAppleScript).toHaveBeenNthCalledWith(1, {
      workDir: '/workspace',
      script: expect.stringContaining('repeat with t in tabs of w'),
      timeoutMs: 5000
    })
    expect(runtime.pressKey).toHaveBeenCalledWith({
      workDir: '/workspace',
      key: 'w',
      modifiers: ['command'],
      timeoutMs: 5000
    })
    expect(execution.stage).toBe('active')
    expect(execution.successText).toBe('Closed 1 matching tabs in Google Chrome.')
    expect(execution.data).toEqual({
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

  it('executes skillsfan open_settings through activate + shortcut helper', async () => {
    const execution = await executeDesktopAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      input: {
        workDir: '/workspace',
        adapterId: 'skillsfan',
        methodId: 'skillsfan.open_settings',
        application: 'SkillsFan',
        timeoutMs: 5000
      }
    })

    expect(runtime.activateApplication).toHaveBeenCalledWith({
      workDir: '/workspace',
      application: 'SkillsFan',
      timeoutMs: 5000
    })
    expect(runtime.pressKey).toHaveBeenCalledWith({
      workDir: '/workspace',
      key: ',',
      modifiers: ['command'],
      timeoutMs: 5000
    })
    expect(execution.stage).toBe('active')
    expect(execution.successText).toBe('Opened settings in SkillsFan.')
  })

  it('routes finder reveal, finder open-folder, and chrome open_application calls through adapter-aware execution', async () => {
    const finderRevealExecution = await maybeExecuteOpenApplicationAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      workDir: '/workspace',
      application: 'Finder',
      target: '/Users/demo/Notes'
    })

    const finderFolderExecution = await maybeExecuteOpenApplicationAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      workDir: '/workspace',
      application: 'Finder',
      target: '/tmp',
      activate: true
    })

    const chromeExecution = await maybeExecuteOpenApplicationAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      workDir: '/workspace',
      application: 'Google Chrome',
      target: 'https://example.com/docs'
    })

    const safariExecution = await maybeExecuteOpenApplicationAdapterMethod({
      runtime: runtime as any,
      platform: 'darwin',
      workDir: '/workspace',
      application: 'Safari',
      target: 'https://example.com/docs'
    })

    expect(finderRevealExecution?.methodId).toBe('finder.reveal_path')
    expect(finderFolderExecution?.methodId).toBe('finder.open_folder')
    expect(chromeExecution?.methodId).toBe('chrome.open_url')
    expect(runtime.openApplication).toHaveBeenCalledWith({
      workDir: '/workspace',
      application: 'Finder',
      target: '/tmp',
      activate: true,
      timeoutMs: undefined
    })
    expect(runtime.openApplication).toHaveBeenCalledWith({
      workDir: '/workspace',
      application: 'Google Chrome',
      target: 'https://example.com/docs',
      activate: undefined,
      timeoutMs: undefined
    })
    expect(safariExecution).toBeNull()
  })
})
