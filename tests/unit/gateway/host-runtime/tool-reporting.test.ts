import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const mocks = vi.hoisted(() => {
  const dispatchEvent = vi.fn()

  return {
    dispatchEvent,
    getChannelManager: vi.fn(() => ({ dispatchEvent })),
    createOutboundEvent: vi.fn((channel, spaceId, conversationId, payload) => ({
      channel,
      spaceId,
      conversationId,
      payload
    }))
  }
})

vi.mock('../../../../src/gateway/channels', () => ({
  getGatewayChannelManager: mocks.getChannelManager,
  createGatewayOutboundEvent: mocks.createOutboundEvent
}))

vi.mock('../../../../src/gateway/channels/relay', () => ({
  relayGatewayConversationEvent: vi.fn(),
  shouldRelayGatewayChannelEvents: vi.fn(() => false)
}))

import { resolveRoute } from '../../../../src/gateway/routing'
import {
  clearGatewaySessionStoreForTests,
  createGatewaySession
} from '../../../../src/gateway/sessions'
import { stepReporterRuntime } from '../../../../src/gateway/host-runtime/step-reporter/runtime'
import { recordToolExecutionStep } from '../../../../src/gateway/host-runtime/step-reporter/tool-reporting'

describe('recordToolExecutionStep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stepReporterRuntime.clearAll()
    clearGatewaySessionStoreForTests()
  })

  it('extracts screenshot previews from image tool results', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-image',
      category: 'browser',
      action: 'browser_screenshot',
      result: {
        content: [
          {
            type: 'image',
            mimeType: 'image/png',
            data: 'preview-image-data'
          }
        ]
      }
    })

    expect(report.artifacts).toEqual([
      {
        kind: 'screenshot',
        label: 'browser_screenshot',
        mimeType: 'image/png',
        previewImageData: 'preview-image-data'
      }
    ])
    expect(stepReporterRuntime.listSteps('task-image')).toHaveLength(1)
  })

  it('extracts snapshot previews and dispatches scoped step events', () => {
    const route = resolveRoute({
      workspaceId: 'space-1',
      conversationId: 'conv-1'
    })
    createGatewaySession(route, { status: 'active' })

    const report = recordToolExecutionStep({
      defaultTaskId: 'task-text',
      defaultSpaceId: 'space-1',
      defaultConversationId: 'conv-1',
      category: 'browser',
      action: 'browser_snapshot',
      toolArgs: {
        filePath: '/tmp/page-snapshot.txt'
      },
      result: {
        content: [
          {
            type: 'text',
            text: 'Heading\nBody copy'
          }
        ]
      }
    })

    expect(report.artifacts).toEqual([
      {
        kind: 'snapshot',
        label: 'browser_snapshot',
        path: '/tmp/page-snapshot.txt',
        previewText: 'Heading\nBody copy'
      }
    ])
    expect(mocks.createOutboundEvent).toHaveBeenCalledWith(
      'agent:host-step',
      'space-1',
      'conv-1',
      expect.objectContaining({
        taskId: 'task-text',
        action: 'browser_snapshot'
      })
    )
    expect(report.metadata).toMatchObject({
      sessionKey: route.sessionKey,
      mainSessionKey: route.mainSessionKey,
      routeChannel: 'electron',
      routePeerType: 'direct',
      routePeerId: 'conv-1',
      routeAccountId: 'local-user'
    })
    expect(mocks.dispatchEvent).toHaveBeenCalledTimes(1)
  })

  it('extracts local screenshot previews from text-only tool results', () => {
    const tempDir = mkdtempSync(join(process.cwd(), 'tmp-tool-report-'))
    const screenshotPath = join(tempDir, 'desktop_screenshot.png')
    writeFileSync(screenshotPath, Buffer.from('desktop-image-preview'))
    const hfsPath = screenshotPath.replace(/^\//, 'Macintosh HD:').replace(/\//g, ':')

    try {
      const report = recordToolExecutionStep({
        defaultTaskId: 'task-applescript',
        category: 'desktop',
        action: 'run_applescript',
        result: {
          content: [
            {
              type: 'text',
              text: `AppleScript completed:\nSaved screenshot to ${hfsPath}`
            }
          ]
        }
      })

      expect(report.artifacts).toEqual([
        expect.objectContaining({
          kind: 'screenshot',
          label: 'run_applescript',
          path: screenshotPath,
          mimeType: 'image/png',
          previewImageData: Buffer.from('desktop-image-preview').toString('base64'),
          previewText: `AppleScript completed:\nSaved screenshot to ${hfsPath}`
        })
      ])
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('extracts local screenshot previews from tilde paths in text-only tool results', () => {
    const homeScreenshotPath = join(homedir(), 'Desktop', 'screenshot.png')
    mkdirSync(join(homedir(), 'Desktop'), { recursive: true })
    writeFileSync(homeScreenshotPath, Buffer.from('desktop-image-tilde-preview'))

    try {
      const report = recordToolExecutionStep({
        defaultTaskId: 'task-applescript-tilde',
        category: 'desktop',
        action: 'run_applescript',
        result: {
          content: [
            {
              type: 'text',
              text: 'AppleScript completed:\n截图已保存到 ~/Desktop/screenshot.png'
            }
          ]
        }
      })

      expect(report.artifacts).toEqual([
        expect.objectContaining({
          kind: 'screenshot',
          label: 'run_applescript',
          path: homeScreenshotPath,
          mimeType: 'image/png',
          previewImageData: Buffer.from('desktop-image-tilde-preview').toString('base64'),
          previewText: 'AppleScript completed:\n截图已保存到 ~/Desktop/screenshot.png'
        })
      ])
    } finally {
      rmSync(homeScreenshotPath, { force: true })
    }
  })

  it('keeps structured desktop text for applescript-only results', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-desktop-structure',
      category: 'desktop',
      action: 'run_applescript',
      result: {
        content: [
          {
            type: 'text',
            text: 'AppleScript completed:\nApplication: Finder\nWindow: Desktop\n- role=AXGroup, name=Desktop items, children=3'
          }
        ]
      }
    })

    expect(report.artifacts).toEqual([
      {
        kind: 'log',
        label: 'run_applescript',
        previewText: 'AppleScript completed:\nApplication: Finder\nWindow: Desktop\n- role=AXGroup, name=Desktop items, children=3'
      }
    ])
  })

  it('attaches auto-perception before/after artifacts around tool artifacts', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-perception',
      category: 'desktop',
      action: 'desktop_click',
      toolArgs: { x: 100, y: 200 },
      autoPerception: {
        before: {
          kind: 'screenshot',
          role: 'before',
          label: 'Before',
          mimeType: 'image/png',
          previewImageData: 'before-data'
        },
        after: {
          kind: 'screenshot',
          role: 'after',
          label: 'After',
          mimeType: 'image/png',
          previewImageData: 'after-data'
        }
      }
    })

    expect(report.artifacts).toHaveLength(2)
    expect(report.artifacts![0]).toMatchObject({ role: 'before', previewImageData: 'before-data' })
    expect(report.artifacts![1]).toMatchObject({ role: 'after', previewImageData: 'after-data' })
  })

  it('merges auto-perception artifacts with tool-extracted artifacts', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-merge',
      category: 'browser',
      action: 'browser_screenshot',
      result: {
        content: [
          { type: 'image', mimeType: 'image/png', data: 'tool-image-data' }
        ]
      },
      autoPerception: {
        before: {
          kind: 'screenshot',
          role: 'before',
          label: 'Before',
          mimeType: 'image/png',
          previewImageData: 'before-data'
        }
      }
    })

    expect(report.artifacts).toHaveLength(2)
    expect(report.artifacts![0].role).toBe('before')
    expect(report.artifacts![1].previewImageData).toBe('tool-image-data')
  })

  it('generates readable summary for desktop_click', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-click',
      category: 'desktop',
      action: 'desktop_click',
      toolArgs: { x: 120, y: 340 }
    })

    expect(report.summary).toBe('Click at (120, 340)')
  })

  it('generates readable summary for browser_navigate', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-nav',
      category: 'browser',
      action: 'browser_navigate',
      toolArgs: { url: 'https://example.com/path?q=1' }
    })

    expect(report.summary).toBe('Navigate to example.com')
  })

  it('generates readable summary for open_application', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-app',
      category: 'desktop',
      action: 'open_application',
      toolArgs: { application: 'Safari', target: 'https://google.com' }
    })

    expect(report.summary).toBe('Open Safari → https://google.com')
  })

  it('generates readable summary for activate_application', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-activate',
      category: 'desktop',
      action: 'activate_application',
      toolArgs: { application: 'Terminal' }
    })

    expect(report.summary).toBe('Activate Terminal')
  })

  it('generates readable summary for terminal_run_command', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-terminal',
      category: 'desktop',
      action: 'terminal_run_command',
      toolArgs: { application: 'iTerm2', commandPreview: 'pnpm test --filter desktop', windowIndex: 2, tabIndex: 3, sessionIndex: 1 }
    })

    expect(report.summary).toBe('Run in iTerm2 [w2:t3:s1] → pnpm test --filter desktop')
  })

  it('generates readable summary for terminal_new_tab_run_command', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-terminal-new-tab',
      category: 'desktop',
      action: 'terminal_new_tab_run_command',
      toolArgs: { application: 'Terminal', commandPreview: 'pnpm lint --fix' }
    })

    expect(report.summary).toBe('Run in new Terminal tab → pnpm lint --fix')
  })

  it('generates readable summary for terminal_new_window_run_command', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-terminal-new-window',
      category: 'desktop',
      action: 'terminal_new_window_run_command',
      toolArgs: { application: 'iTerm2', commandPreview: 'pnpm typecheck --watch' }
    })

    expect(report.summary).toBe('Run in new iTerm2 window → pnpm typecheck --watch')
  })

  it('generates readable summary for terminal_run_command_in_directory', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-terminal-directory',
      category: 'desktop',
      action: 'terminal_run_command_in_directory',
      toolArgs: {
        application: 'Terminal',
        directory: '/Users/demo/project',
        commandPreview: 'pnpm test --filter desktop',
        windowIndex: 1,
        tabIndex: 2
      }
    })

    expect(report.summary).toBe('Run in Terminal [w1:t2] @ /Users/demo/project → pnpm test --filter desktop')
  })

  it('generates readable summary for terminal_list_sessions', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-terminal-list',
      category: 'desktop',
      action: 'terminal_list_sessions',
      toolArgs: { application: 'iTerm2' }
    })

    expect(report.summary).toBe('List iTerm2 sessions')
  })

  it('generates readable summary for terminal_list_panes', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-terminal-list-panes',
      category: 'desktop',
      action: 'terminal_list_panes',
      toolArgs: { application: 'iTerm2', windowIndex: 2, tabIndex: 3 }
    })

    expect(report.summary).toBe('List iTerm2 [w2:t3] panes')
  })

  it('generates readable summary for terminal_get_pane_layout', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-terminal-pane-layout',
      category: 'desktop',
      action: 'terminal_get_pane_layout',
      toolArgs: { application: 'iTerm2', windowIndex: 2, tabIndex: 3 }
    })

    expect(report.summary).toBe('Read iTerm2 [w2:t3] pane layout')
  })

  it('generates readable summary for terminal_focus_session', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-terminal-focus',
      category: 'desktop',
      action: 'terminal_focus_session',
      toolArgs: { application: 'Terminal', windowIndex: 2, tabIndex: 1 }
    })

    expect(report.summary).toBe('Focus Terminal [w2:t1]')
  })

  it('generates readable summary for terminal_interrupt_process', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-terminal-interrupt',
      category: 'desktop',
      action: 'terminal_interrupt_process',
      toolArgs: { application: 'iTerm2', windowIndex: 2, tabIndex: 3, paneIndex: 2 }
    })

    expect(report.summary).toBe('Interrupt process in iTerm2 [w2:t3:p2]')
  })

  it('generates readable summary for terminal_get_session_state', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-terminal-session-state',
      category: 'desktop',
      action: 'terminal_get_session_state',
      toolArgs: { application: 'iTerm2', windowIndex: 2, tabIndex: 3, paneIndex: 2 }
    })

    expect(report.summary).toBe('Read session state from iTerm2 [w2:t3:p2]')
  })

  it('generates readable summary for terminal_get_last_command_result', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-terminal-last-command-result',
      category: 'desktop',
      action: 'terminal_get_last_command_result',
      toolArgs: { application: 'iTerm2', windowIndex: 2, tabIndex: 3, paneIndex: 2 }
    })

    expect(report.summary).toBe('Read last command result from iTerm2 [w2:t3:p2]')
  })

  it('generates readable summary for terminal_read_output', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-terminal-read-output',
      category: 'desktop',
      action: 'terminal_read_output',
      toolArgs: { application: 'iTerm2', windowIndex: 2, tabIndex: 3, sessionIndex: 1 }
    })

    expect(report.summary).toBe('Read output from iTerm2 [w2:t3:s1]')
  })

  it('generates readable summary for terminal_wait_for_output', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-terminal-wait',
      category: 'desktop',
      action: 'terminal_wait_for_output',
      toolArgs: { application: 'Terminal', expectedText: 'server ready', windowIndex: 1, tabIndex: 2 }
    })

    expect(report.summary).toBe('Wait for "server ready" in Terminal [w1:t2]')
  })

  it('generates readable summary for terminal_wait_until_not_busy', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-terminal-not-busy',
      category: 'desktop',
      action: 'terminal_wait_until_not_busy',
      toolArgs: { application: 'iTerm2', windowIndex: 2, tabIndex: 3, paneIndex: 2 }
    })

    expect(report.summary).toBe('Wait for iTerm2 [w2:t3:p2] to become idle')
  })

  it('generates readable summary for terminal_wait_until_idle', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-terminal-idle',
      category: 'desktop',
      action: 'terminal_wait_until_idle',
      toolArgs: { application: 'iTerm2', windowIndex: 2, tabIndex: 3 }
    })

    expect(report.summary).toBe('Wait for idle iTerm2 [w2:t3] output')
  })

  it('generates readable summary for terminal_split_pane_run_command', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-terminal-split-pane',
      category: 'desktop',
      action: 'terminal_split_pane_run_command',
      toolArgs: {
        application: 'iTerm2',
        direction: 'horizontal',
        commandPreview: 'pnpm dev',
        windowIndex: 2,
        tabIndex: 3,
        paneIndex: 2
      }
    })

    expect(report.summary).toBe('Split iTerm2 [w2:t3:p2] horizontal → pnpm dev')
  })

  it('generates readable summary for terminal_run_command_and_wait', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-terminal-run-and-wait',
      category: 'desktop',
      action: 'terminal_run_command_and_wait',
      toolArgs: { application: 'Terminal', commandPreview: 'pnpm test --filter desktop', windowIndex: 1, tabIndex: 2 }
    })

    expect(report.summary).toBe('Run and wait in Terminal [w1:t2] → pnpm test --filter desktop')
  })

  it('generates readable summary for terminal_run_command_in_directory_and_wait', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-terminal-directory-and-wait',
      category: 'desktop',
      action: 'terminal_run_command_in_directory_and_wait',
      toolArgs: {
        application: 'iTerm2',
        directory: '/Users/demo/project',
        commandPreview: 'pnpm lint',
        windowIndex: 2,
        tabIndex: 3,
        sessionIndex: 1
      }
    })

    expect(report.summary).toBe('Run and wait in iTerm2 [w2:t3:s1] @ /Users/demo/project → pnpm lint')
  })

  it('generates readable summary for chrome_open_url', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-chrome-open-url',
      category: 'desktop',
      action: 'chrome_open_url',
      toolArgs: { url: 'https://example.com/path' }
    })

    expect(report.summary).toBe('Open in Chrome → https://example.com/path')
  })

  it('generates readable summary for chrome_open_url_in_new_tab', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-chrome-open-new-tab',
      category: 'desktop',
      action: 'chrome_open_url_in_new_tab',
      toolArgs: { url: 'https://example.com/path' }
    })

    expect(report.summary).toBe('Open in new Chrome tab → https://example.com/path')
  })

  it('generates readable summary for chrome_focus_tab', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-chrome-tab',
      category: 'desktop',
      action: 'chrome_focus_tab',
      toolArgs: { title: 'Dashboard' }
    })

    expect(report.summary).toBe('Focus Chrome tab "Dashboard"')
  })

  it('generates readable summary for chrome_focus_tab_by_url', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-chrome-tab-url',
      category: 'desktop',
      action: 'chrome_focus_tab_by_url',
      toolArgs: { url: 'example.com/dashboard' }
    })

    expect(report.summary).toBe('Focus Chrome tab by URL "example.com/dashboard"')
  })

  it('generates readable summary for chrome_list_tabs', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-chrome-list-tabs',
      category: 'desktop',
      action: 'chrome_list_tabs',
      toolArgs: { application: 'Chromium' }
    })

    expect(report.summary).toBe('List tabs in Chromium')
  })

  it('generates readable summary for chrome_find_tabs', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-chrome-find-tabs',
      category: 'desktop',
      action: 'chrome_find_tabs',
      toolArgs: { query: 'openai.com', field: 'domain' }
    })

    expect(report.summary).toBe('Find Chrome tabs by domain "openai.com"')
  })

  it('generates readable summary for chrome_close_tabs', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-chrome-close-tabs',
      category: 'desktop',
      action: 'chrome_close_tabs',
      toolArgs: { query: 'docs', field: 'either' }
    })

    expect(report.summary).toBe('Close Chrome tabs matching "docs"')
  })

  it('generates readable summary for chrome_get_active_tab', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-chrome-get-active-tab',
      category: 'desktop',
      action: 'chrome_get_active_tab',
      toolArgs: { application: 'Chromium' }
    })

    expect(report.summary).toBe('Read active tab in Chromium')
  })

  it('generates readable summary for chrome_wait_for_tab', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-chrome-wait-tab',
      category: 'desktop',
      action: 'chrome_wait_for_tab',
      toolArgs: { query: 'openai.com', field: 'domain' }
    })

    expect(report.summary).toBe('Wait for Chrome tab by domain "openai.com"')
  })

  it('generates readable summary for chrome_wait_for_active_tab', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-chrome-wait-active-tab',
      category: 'desktop',
      action: 'chrome_wait_for_active_tab',
      toolArgs: { query: 'dashboard', field: 'title' }
    })

    expect(report.summary).toBe('Wait for active Chrome tab by title "dashboard"')
  })

  it('generates readable summary for chrome_close_active_tab', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-chrome-close-active-tab',
      category: 'desktop',
      action: 'chrome_close_active_tab',
      toolArgs: { application: 'Google Chrome' }
    })

    expect(report.summary).toBe('Close active tab in Google Chrome')
  })

  it('generates readable summary for chrome_new_tab', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-chrome-new-tab',
      category: 'desktop',
      action: 'chrome_new_tab',
      toolArgs: {}
    })

    expect(report.summary).toBe('Open new Chrome tab')
  })

  it('generates readable summary for chrome_reload_active_tab', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-chrome-reload',
      category: 'desktop',
      action: 'chrome_reload_active_tab',
      toolArgs: {}
    })

    expect(report.summary).toBe('Reload active Chrome tab')
  })

  it('generates readable summary for finder_open_folder', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-finder-folder',
      category: 'desktop',
      action: 'finder_open_folder',
      toolArgs: { target: '/tmp/demo-folder' }
    })

    expect(report.summary).toBe('Open Finder folder /tmp/demo-folder')
  })

  it('generates readable summary for finder_open_home_folder', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-finder-home',
      category: 'desktop',
      action: 'finder_open_home_folder',
      toolArgs: {}
    })

    expect(report.summary).toBe('Open Finder home folder')
  })

  it('generates readable summary for finder_new_window', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-finder-new-window',
      category: 'desktop',
      action: 'finder_new_window',
      toolArgs: {}
    })

    expect(report.summary).toBe('Open new Finder window')
  })

  it('generates readable summary for finder_reveal_path', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-finder-reveal',
      category: 'desktop',
      action: 'finder_reveal_path',
      toolArgs: { target: '/tmp/demo-file.txt' }
    })

    expect(report.summary).toBe('Reveal in Finder /tmp/demo-file.txt')
  })

  it('generates readable summary for finder_search', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-finder-search',
      category: 'desktop',
      action: 'finder_search',
      toolArgs: { query: 'invoice pdf' }
    })

    expect(report.summary).toBe('Search in Finder "invoice pdf"')
  })

  it('generates readable summary for skillsfan_open_settings', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-settings',
      category: 'desktop',
      action: 'skillsfan_open_settings',
      toolArgs: { application: 'SkillsFan' }
    })

    expect(report.summary).toBe('Open settings in SkillsFan')
  })

  it('generates readable summary for skillsfan_focus_main_window', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-focus-main-window',
      category: 'desktop',
      action: 'skillsfan_focus_main_window',
      toolArgs: { application: 'SkillsFan' }
    })

    expect(report.summary).toBe('Focus SkillsFan main window')
  })

  it('generates readable summary for desktop_press_key', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-press',
      category: 'desktop',
      action: 'desktop_press_key',
      toolArgs: { key: 'l', modifiers: ['command'] }
    })

    expect(report.summary).toBe('Press command+l')
  })

  it('generates readable summary for desktop_type_text', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-type',
      category: 'desktop',
      action: 'desktop_type_text',
      toolArgs: { textLength: 12 }
    })

    expect(report.summary).toBe('Type 12 chars')
  })

  it('generates readable summary for desktop_scroll', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-scroll',
      category: 'desktop',
      action: 'desktop_scroll',
      toolArgs: { x: 500, y: 600, deltaY: -3 }
    })

    expect(report.summary).toBe('Scroll up at (500, 600)')
  })

  it('generates readable summary for focus_window', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-focus',
      category: 'desktop',
      action: 'desktop_focus_window',
      toolArgs: { application: 'Finder', windowName: 'Documents' }
    })

    expect(report.summary).toBe('Focus Finder "Documents"')
  })

  it('falls back to textPreview when no summary template matches', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-summary-fallback',
      category: 'system',
      action: 'custom_unknown_action',
      result: {
        content: [{ type: 'text', text: 'Some result text' }]
      }
    })

    expect(report.summary).toBe('Some result text')
  })

  it('does not expose file artifacts when a tool result is marked as failed', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-error',
      category: 'browser',
      action: 'browser_screenshot',
      toolArgs: {
        filePath: '/tmp/failed-screenshot.png'
      },
      result: {
        content: [
          {
            type: 'text',
            text: 'Screenshot failed'
          }
        ],
        isError: true
      }
    })

    expect(report.artifacts).toBeUndefined()
  })
})

describe('stepReporterRuntime persistence', () => {
  let tempDir: string

  beforeEach(() => {
    vi.clearAllMocks()
    stepReporterRuntime.clearAll()
    clearGatewaySessionStoreForTests()
    tempDir = mkdtempSync(join(process.cwd(), 'tmp-step-persist-'))
    stepReporterRuntime.setPersistenceDir(tempDir)
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('persists steps to disk and recovers after clearing memory', () => {
    recordToolExecutionStep({
      defaultTaskId: 'persist-task-1',
      category: 'browser',
      action: 'browser_navigate',
      toolArgs: { url: 'https://example.com' }
    })
    recordToolExecutionStep({
      defaultTaskId: 'persist-task-1',
      category: 'browser',
      action: 'browser_click',
      toolArgs: { uid: 'btn-submit' }
    })

    expect(stepReporterRuntime.listSteps('persist-task-1')).toHaveLength(2)

    // After clearing memory, listSteps should recover from disk automatically
    stepReporterRuntime.clearAll()

    const recovered = stepReporterRuntime.listSteps('persist-task-1')
    expect(recovered).toHaveLength(2)
    expect(recovered[0].action).toBe('browser_navigate')
    expect(recovered[1].action).toBe('browser_click')
    expect(recovered[0].summary).toBe('Navigate to example.com')
    expect(recovered[1].summary).toBe('Click "btn-submit"')
  })

  it('strips large previewImageData when persisting to disk', () => {
    const { readFileSync: readFs } = require('fs')

    recordToolExecutionStep({
      defaultTaskId: 'persist-strip',
      category: 'desktop',
      action: 'desktop_screenshot',
      result: {
        content: [
          { type: 'image', mimeType: 'image/png', data: 'x'.repeat(2000) }
        ]
      }
    })

    const content = readFs(join(tempDir, 'persist-strip.jsonl'), 'utf-8')
    const persisted = JSON.parse(content.trim())

    expect(persisted.artifacts[0].previewImageData).toBeUndefined()
    expect(persisted.artifacts[0].metadata?.hadPreviewImage).toBe(true)
  })

  it('returns empty array for unknown task from disk', () => {
    const steps = stepReporterRuntime.loadStepsFromDisk('nonexistent-task')
    expect(steps).toEqual([])
  })
})
