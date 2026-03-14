import { describe, expect, it } from 'vitest'
import {
  buildChromeCloseActiveTabShortcut,
  buildChromeGetActiveTabScript,
  buildChromeListTabsScript,
  buildChromeFocusTabScript,
  buildChromeFocusTabByUrlScript,
  buildChromeNewTabShortcut,
  buildChromeOpenUrlInNewTabScript,
  buildChromeOpenUrlTarget,
  buildChromeReloadActiveTabShortcut,
} from '../../../../src/gateway/host-runtime/desktop/adapters/chrome'
import {
  buildFinderNewWindowShortcut,
  buildFinderOpenFolderTarget,
  buildFinderOpenHomeFolderTarget,
  buildFinderSearchScript,
  buildFinderRevealPathScript
} from '../../../../src/gateway/host-runtime/desktop/adapters/finder'
import {
  listDesktopAppAdapters,
  resolveDesktopAppAdapter
} from '../../../../src/gateway/host-runtime/desktop/adapters/registry'
import {
  buildSkillsFanOpenSettingsShortcut
} from '../../../../src/gateway/host-runtime/desktop/adapters/skillsfan'
import {
  buildTerminalInterruptShortcut,
  buildTerminalFocusSessionScript,
  buildTerminalGetPaneLayoutScript,
  buildTerminalListPanesScript,
  buildTerminalListSessionsScript,
  buildTerminalNewTabRunCommandScript,
  buildTerminalNewWindowRunCommandScript,
  buildTerminalReadOutputScript,
  buildTerminalRunCommandInDirectoryScript,
  buildTerminalRunCommandScript,
  buildTerminalSplitPaneRunCommandScript
} from '../../../../src/gateway/host-runtime/desktop/adapters/terminal'

describe('desktop app adapter registry', () => {
  it('lists generic and active desktop adapters for macOS', () => {
    const adapters = listDesktopAppAdapters('darwin')

    expect(adapters.map((adapter) => adapter.id)).toEqual([
      'generic-macos',
      'finder',
      'terminal',
      'chrome',
      'skillsfan'
    ])
    expect(adapters[0]).toMatchObject({
      id: 'generic-macos',
      supported: true,
      stage: 'active',
      methods: []
    })
    expect(adapters[1]).toMatchObject({
      id: 'finder',
      supported: true,
      stage: 'active',
      workflows: [
        expect.objectContaining({
          id: 'finder.folder-access',
          stage: 'active',
          supported: true
        }),
        expect.objectContaining({
          id: 'finder.window-and-search',
          stage: 'active',
          supported: true
        })
      ],
      smokeFlows: [
        expect.objectContaining({
          id: 'finder.navigation-roundtrip',
          stage: 'active',
          supported: true
        })
      ]
    })
    expect(adapters[2]).toMatchObject({
      id: 'terminal',
      supported: true,
      stage: 'active',
      workflows: [
        expect.objectContaining({
          id: 'terminal.session-control',
          stage: 'active',
          supported: true
        }),
        expect.objectContaining({
          id: 'terminal.run-and-verify',
          stage: 'active',
          supported: true
        }),
        expect.objectContaining({
          id: 'iterm.pane-ops',
          stage: 'active',
          supported: true
        })
      ],
      smokeFlows: [
        expect.objectContaining({
          id: 'terminal.command-roundtrip',
          stage: 'active',
          supported: true
        }),
        expect.objectContaining({
          id: 'terminal.session-targeting',
          stage: 'active',
          supported: true
        }),
        expect.objectContaining({
          id: 'iterm.split-pane-roundtrip',
          stage: 'active',
          supported: true
        })
      ]
    })
    expect(adapters[3]).toMatchObject({
      id: 'chrome',
      supported: true,
      stage: 'active',
      workflows: [
        expect.objectContaining({
          id: 'chrome.tab-navigation',
          stage: 'active',
          supported: true
        }),
        expect.objectContaining({
          id: 'chrome.tab-observe',
          stage: 'active',
          supported: true
        }),
        expect.objectContaining({
          id: 'chrome.tab-cleanup',
          stage: 'active',
          supported: true
        })
      ],
      smokeFlows: [
        expect.objectContaining({
          id: 'chrome.tab-roundtrip',
          stage: 'active',
          supported: true
        }),
        expect.objectContaining({
          id: 'chrome.discovery-roundtrip',
          stage: 'active',
          supported: true
        })
      ]
    })
    expect(adapters[4]).toMatchObject({
      id: 'skillsfan',
      supported: true,
      stage: 'active',
      workflows: [
        expect.objectContaining({
          id: 'skillsfan.app-control',
          stage: 'active',
          supported: true
        })
      ],
      smokeFlows: [
        expect.objectContaining({
          id: 'skillsfan.settings-roundtrip',
          stage: 'active',
          supported: true
        })
      ]
    })
    expect(adapters[1]?.methods).toEqual([
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
    expect(adapters[4]?.methods).toEqual([
      expect.objectContaining({
        id: 'skillsfan.focus_main_window',
        action: 'focus_window',
        stage: 'active',
        supported: true
      }),
      expect.objectContaining({
        id: 'skillsfan.open_settings',
        action: 'press_key',
        stage: 'active',
        supported: true
      })
    ])
  })

  it('resolves known app names to registered adapters', () => {
    expect(resolveDesktopAppAdapter('Finder', 'darwin').id).toBe('finder')
    expect(resolveDesktopAppAdapter('Google Chrome', 'darwin').id).toBe('chrome')
    expect(resolveDesktopAppAdapter('iTerm2', 'darwin').id).toBe('terminal')
    expect(resolveDesktopAppAdapter('SkillsFan', 'darwin').id).toBe('skillsfan')
  })

  it('falls back to generic adapter for unknown apps or missing names', () => {
    expect(resolveDesktopAppAdapter(undefined, 'darwin').id).toBe('generic-macos')
    expect(resolveDesktopAppAdapter('Preview', 'darwin').id).toBe('generic-macos')
  })

  it('builds scaffolded helper payloads for future app-specific adapters', () => {
    const adapters = listDesktopAppAdapters('darwin')

    expect(buildFinderRevealPathScript('/Users/demo/Notes')).toContain('reveal POSIX file "/Users/demo/Notes"')
    expect(buildFinderOpenFolderTarget(' /Users/demo/Documents ')).toBe('/Users/demo/Documents')
    expect(buildFinderOpenHomeFolderTarget(' /Users/demo ')).toBe('/Users/demo')
    expect(buildFinderNewWindowShortcut()).toEqual({
      key: 'n',
      modifiers: ['command']
    })
    expect(buildFinderSearchScript('invoice', '/Users/demo/Documents', 5)).toContain('/usr/bin/mdfind -count -onlyin')
    expect(buildTerminalRunCommandScript('echo "hello"')).toContain('do script "echo \\"hello\\""')
    expect(buildTerminalRunCommandScript('echo "hello"')).not.toContain('__SKILLSFAN_EXIT_STATUS__=')
    expect(buildTerminalRunCommandScript('echo "hello"', 'Terminal', undefined, 'cmd_123')).toContain('__SKILLSFAN_COMMAND_START__=')
    expect(buildTerminalRunCommandScript('echo "hello"', 'Terminal', undefined, 'cmd_123')).toContain('__SKILLSFAN_COMMAND_RESULT__=')
    expect(buildTerminalRunCommandScript('pwd', 'iTerm2')).toContain('tell application "iTerm2"')
    expect(buildTerminalRunCommandScript('pwd', 'iTerm')).toContain('tell application "iTerm"')
    expect(buildTerminalRunCommandScript('pwd', 'iTerm2')).toContain('delay 0.1')
    expect(buildTerminalRunCommandScript('pwd', 'iTerm2')).toContain('set targetWindow to (create window with default profile)')
    expect(buildTerminalRunCommandScript('pwd', 'iTerm2')).toContain('tell targetWindow')
    expect(buildTerminalRunCommandScript('pwd', 'iTerm2')).toContain('tell targetTab')
    expect(buildTerminalRunCommandScript('pwd', 'iTerm2')).not.toContain('current session of targetTab')
    expect(buildTerminalNewTabRunCommandScript('pwd')).toContain('keystroke "t" using command down')
    expect(buildTerminalNewTabRunCommandScript('pwd')).toContain('if (count of windows) = 0 then')
    expect(buildTerminalNewTabRunCommandScript('pwd')).toContain('do script "pwd"')
    expect(buildTerminalNewTabRunCommandScript('pwd')).not.toContain('do script ""')
    expect(buildTerminalNewTabRunCommandScript('pwd', 'iTerm2')).toContain('create tab with default profile')
    expect(buildTerminalNewWindowRunCommandScript('pwd')).toContain('keystroke "n" using command down')
    expect(buildTerminalNewWindowRunCommandScript('pwd')).toContain('if (count of windows) = 0 then')
    expect(buildTerminalNewWindowRunCommandScript('pwd')).toContain('do script "pwd"')
    expect(buildTerminalNewWindowRunCommandScript('pwd')).not.toContain('do script ""')
    expect(buildTerminalNewWindowRunCommandScript('pwd', 'iTerm2')).toContain('create window with default profile')
    expect(buildTerminalRunCommandInDirectoryScript('pnpm test', '/Users/demo/project')).toContain(`cd '/Users/demo/project' && pnpm test`)
    expect(buildTerminalRunCommandScript('pnpm test', 'iTerm2', { windowIndex: 2, tabIndex: 3, paneIndex: 2 })).toContain('set targetWindow to first window whose index is 2')
    expect(buildTerminalRunCommandScript('pnpm test', 'iTerm2', { windowIndex: 2, tabIndex: 3, paneIndex: 2 })).toContain('tell targetTab')
    expect(buildTerminalRunCommandScript('pnpm test', 'iTerm2', { windowIndex: 2, tabIndex: 3, paneIndex: 2 })).toContain('set targetSession to session 2')
    expect(buildTerminalInterruptShortcut()).toEqual({
      key: 'c',
      modifiers: ['control']
    })
    expect(buildTerminalReadOutputScript()).toContain('return contents of targetTab')
    expect(buildTerminalReadOutputScript('iTerm2')).toContain('return contents of targetSession')
    expect(buildTerminalReadOutputScript('Terminal', { windowIndex: 2, tabIndex: 3 })).toContain('set targetTab to tab 3 of targetWindow')
    expect(buildTerminalListSessionsScript()).toContain('repeat with t in tabs of w')
    expect(buildTerminalListSessionsScript('iTerm2')).toContain('repeat with s in sessions of t')
    expect(buildTerminalListPanesScript('iTerm2', { windowIndex: 2, tabIndex: 3 })).toContain('repeat with s in sessions of targetTab')
    expect(buildTerminalListPanesScript('iTerm2', { windowIndex: 2, tabIndex: 3 })).toContain('tell targetWindow')
    expect(buildTerminalListPanesScript('iTerm2', { windowIndex: 2, tabIndex: 3 })).toContain('set targetTab to tab 3')
    expect(buildTerminalGetPaneLayoutScript('iTerm2', { windowIndex: 2, tabIndex: 3 })).toContain('__PANE__')
    expect(buildTerminalGetPaneLayoutScript('iTerm2', { windowIndex: 2, tabIndex: 3 })).toContain('set columnsValue to columns of s')
    expect(buildTerminalGetPaneLayoutScript('iTerm2', { windowIndex: 2, tabIndex: 3 })).toContain('set rowsValue to rows of s')
    expect(buildTerminalFocusSessionScript('Terminal', { windowIndex: 2, tabIndex: 1 })).toContain('set front window to targetWindow')
    expect(buildTerminalFocusSessionScript('iTerm2', { windowIndex: 2, tabIndex: 1, paneIndex: 2 })).toContain('tell targetSession to select')
    expect(buildTerminalSplitPaneRunCommandScript('pnpm dev', 'horizontal', 'iTerm2', { windowIndex: 2, tabIndex: 1, paneIndex: 2 })).toContain('split horizontally with default profile')
    expect(buildTerminalSplitPaneRunCommandScript('pnpm dev', 'vertical', 'iTerm2')).toContain('split vertically with default profile')
    expect(buildChromeOpenUrlTarget(' https://example.com/path ')).toBe('https://example.com/path')
    expect(buildChromeFocusTabScript('Claude')).toContain('if title of t contains "Claude" then')
    expect(buildChromeFocusTabScript('Claude', 'Chromium')).toContain('tell application "Chromium"')
    expect(buildChromeFocusTabScript('Claude')).toContain('error "Tab not found: Claude"')
    expect(buildChromeFocusTabByUrlScript('example.com/docs')).toContain('if URL of t contains "example.com/docs" then')
    expect(buildChromeOpenUrlInNewTabScript('https://example.com/path')).toContain('make new tab at end of tabs')
    expect(buildChromeListTabsScript()).toContain('repeat with t in tabs of w')
    expect(buildChromeGetActiveTabScript()).toContain('set activeTabRef to active tab of frontWindow')
    expect(buildChromeListTabsScript('Chromium')).toContain('tell application "Chromium"')
    expect(buildChromeNewTabShortcut()).toEqual({
      key: 't',
      modifiers: ['command']
    })
    expect(buildChromeReloadActiveTabShortcut()).toEqual({
      key: 'r',
      modifiers: ['command']
    })
    expect(buildChromeCloseActiveTabShortcut()).toEqual({
      key: 'w',
      modifiers: ['command']
    })
    expect(buildSkillsFanOpenSettingsShortcut()).toEqual({
      key: ',',
      modifiers: ['command']
    })
    expect(adapters[4]?.methods).toEqual([
      expect.objectContaining({
        id: 'skillsfan.focus_main_window',
        action: 'focus_window',
        stage: 'active',
        supported: true
      }),
      expect.objectContaining({
        id: 'skillsfan.open_settings',
        action: 'press_key',
        stage: 'active',
        supported: true
      })
    ])
    expect(adapters[2]?.methods).toEqual([
      expect.objectContaining({
        id: 'terminal.run_command',
        action: 'run_applescript',
        stage: 'active',
        supported: true
      }),
      expect.objectContaining({
        id: 'terminal.new_tab_run_command',
        action: 'run_applescript',
        stage: 'active',
        supported: true
      }),
      expect.objectContaining({
        id: 'terminal.new_window_run_command',
        action: 'run_applescript',
        stage: 'active',
        supported: true
      }),
      expect.objectContaining({
        id: 'terminal.run_command_in_directory',
        action: 'run_applescript',
        stage: 'active',
        supported: true
      }),
      expect.objectContaining({
        id: 'terminal.list_sessions',
        action: 'run_applescript',
        stage: 'active',
        supported: true
      }),
      expect.objectContaining({
        id: 'terminal.list_panes',
        action: 'run_applescript',
        stage: 'active',
        supported: true
      }),
      expect.objectContaining({
        id: 'terminal.get_pane_layout',
        action: 'run_applescript',
        stage: 'active',
        supported: true
      }),
      expect.objectContaining({
        id: 'terminal.focus_session',
        action: 'run_applescript',
        stage: 'active',
        supported: true
      }),
      expect.objectContaining({
        id: 'terminal.interrupt_process',
        action: 'press_key',
        stage: 'active',
        supported: true
      }),
      expect.objectContaining({
        id: 'terminal.get_session_state',
        action: 'run_applescript',
        stage: 'active',
        supported: true
      }),
      expect.objectContaining({
        id: 'terminal.read_output',
        action: 'run_applescript',
        stage: 'active',
        supported: true
      }),
      expect.objectContaining({
        id: 'terminal.get_last_command_result',
        action: 'run_applescript',
        stage: 'active',
        supported: true
      }),
      expect.objectContaining({
        id: 'terminal.wait_for_output',
        action: 'run_applescript',
        stage: 'active',
        supported: true
      }),
      expect.objectContaining({
        id: 'terminal.wait_until_not_busy',
        action: 'run_applescript',
        stage: 'active',
        supported: true
      }),
      expect.objectContaining({
        id: 'terminal.wait_until_idle',
        action: 'run_applescript',
        stage: 'active',
        supported: true
      }),
      expect.objectContaining({
        id: 'terminal.split_pane_run_command',
        action: 'run_applescript',
        stage: 'active',
        supported: true
      }),
      expect.objectContaining({
        id: 'terminal.run_command_and_wait',
        action: 'run_applescript',
        stage: 'active',
        supported: true
      }),
      expect.objectContaining({
        id: 'terminal.run_command_in_directory_and_wait',
        action: 'run_applescript',
        stage: 'active',
        supported: true
      })
    ])
    expect(adapters[3]?.methods).toEqual([
      expect.objectContaining({
        id: 'chrome.open_url',
        action: 'open_application',
        stage: 'active',
        supported: true
      }),
      expect.objectContaining({
        id: 'chrome.focus_tab_by_title',
        action: 'run_applescript',
        stage: 'active',
        supported: true
      }),
      expect.objectContaining({
        id: 'chrome.new_tab',
        action: 'press_key',
        stage: 'active',
        supported: true
      }),
      expect.objectContaining({
        id: 'chrome.reload_active_tab',
        action: 'press_key',
        stage: 'active',
        supported: true
      }),
      expect.objectContaining({
        id: 'chrome.focus_tab_by_url',
        action: 'run_applescript',
        stage: 'active',
        supported: true
      }),
      expect.objectContaining({
        id: 'chrome.open_url_in_new_tab',
        action: 'run_applescript',
        stage: 'active',
        supported: true
      }),
      expect.objectContaining({
        id: 'chrome.list_tabs',
        action: 'run_applescript',
        stage: 'active',
        supported: true
      }),
      expect.objectContaining({
        id: 'chrome.get_active_tab',
        action: 'run_applescript',
        stage: 'active',
        supported: true
      }),
      expect.objectContaining({
        id: 'chrome.wait_for_tab',
        action: 'run_applescript',
        stage: 'active',
        supported: true
      }),
      expect.objectContaining({
        id: 'chrome.wait_for_active_tab',
        action: 'run_applescript',
        stage: 'active',
        supported: true
      }),
      expect.objectContaining({
        id: 'chrome.close_active_tab',
        action: 'press_key',
        stage: 'active',
        supported: true
      }),
      expect.objectContaining({
        id: 'chrome.find_tabs',
        action: 'run_applescript',
        stage: 'active',
        supported: true
      }),
      expect.objectContaining({
        id: 'chrome.close_tabs',
        action: 'press_key',
        stage: 'active',
        supported: true
      })
    ])
  })
})
