import { describe, expect, it } from 'vitest'
import { buildToolCatalog } from '../../../../src/main/services/local-tools/tool-catalog'
import { searchToolsByBm25, searchToolsByRegex } from '../../../../src/main/services/local-tools/tool-search'

describe('local tool search', () => {
  it('finds tool matches with regex', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: true })
    const results = searchToolsByRegex({
      catalog,
      pattern: 'web(search|fetch)',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual([
      'mcp__web-tools__WebFetch',
      'mcp__web-tools__WebSearch'
    ])
  })

  it('ranks relevant tools with bm25 search', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'search memory history',
      limit: 3
    })

    expect(results[0]?.name).toBe('mcp__local-tools__memory')
    expect(results[0]?.score).toBeGreaterThan(0)
  })

  it('surfaces macOS automation tools for system browser workflows', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'open real chrome and focus browser tab on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__open_application',
      'mcp__local-tools__chrome_focus_tab'
    ]))
  })

  it('surfaces Finder folder helpers for desktop navigation workflows', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'open folder in finder on macos desktop',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__finder_open_folder'
    ]))
  })

  it('surfaces Finder home-folder helpers for desktop navigation workflows', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'open home folder in finder on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__finder_open_home_folder'
    ]))
  })

  it('surfaces Finder new-window helpers for desktop navigation workflows', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'open new finder window on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__finder_new_window'
    ]))
  })

  it('surfaces Finder reveal helpers for file navigation workflows', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'reveal file path in finder on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__finder_reveal_path'
    ]))
  })

  it('surfaces Finder search helpers for desktop file discovery workflows', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'search finder files by name on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__finder_search'
    ]))
  })

  it('surfaces structured terminal automation tools', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'run command in terminal app on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__terminal_run_command'
    ]))
  })

  it('surfaces new-tab terminal automation tools', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'run command in new terminal tab on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__terminal_new_tab_run_command'
    ]))
  })

  it('surfaces new-window terminal automation tools', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'run command in new terminal window on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__terminal_new_window_run_command'
    ]))
  })

  it('surfaces terminal run-in-directory helpers', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'run command in terminal directory on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__terminal_run_command_in_directory'
    ]))
  })

  it('surfaces terminal session-list helpers', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'list terminal iterm sessions tabs windows on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__terminal_list_sessions'
    ]))
  })

  it('surfaces terminal pane-list helpers', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'list iterm panes in selected tab on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__terminal_list_panes'
    ]))
  })

  it('surfaces terminal pane-layout helpers', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'read iterm pane layout split hierarchy in selected tab on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__terminal_get_pane_layout'
    ]))
  })

  it('surfaces terminal focus-session helpers', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'focus terminal or iterm pane session tab window on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__terminal_focus_session'
    ]))
  })

  it('surfaces terminal interrupt helpers', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'interrupt terminal process control c on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__terminal_interrupt_process'
    ]))
  })

  it('surfaces terminal session-state helpers', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'read terminal or iterm pane session busy tty active state on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__terminal_get_session_state'
    ]))
  })

  it('surfaces terminal last-command-result helpers', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'read last terminal command result exit status command id on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__terminal_get_last_command_result'
    ]))
  })

  it('surfaces terminal output-reading helpers', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'read output from terminal or iterm pane on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__terminal_read_output'
    ]))
  })

  it('surfaces terminal wait-for-output helpers', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'wait for text in terminal output on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__terminal_wait_for_output'
    ]))
  })

  it('surfaces terminal not-busy wait helpers', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'wait until terminal or iterm pane session is no longer busy on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__terminal_wait_until_not_busy'
    ]))
  })

  it('surfaces terminal idle-wait helpers', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'wait until terminal output is idle on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__terminal_wait_until_idle'
    ]))
  })

  it('surfaces terminal run-and-wait helpers', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'run command in terminal and wait for completion exit status on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__terminal_run_command_and_wait'
    ]))
  })

  it('surfaces terminal split-pane helpers', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'split iterm pane vertically and run command on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__terminal_split_pane_run_command'
    ]))
  })

  it('surfaces terminal directory run-and-wait helpers', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'run terminal command in directory and wait for exit status on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__terminal_run_command_in_directory_and_wait'
    ]))
  })

  it('surfaces structured chrome URL open helpers', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'open url in google chrome on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__chrome_open_url'
    ]))
  })

  it('surfaces structured chrome new-tab helpers', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'open new chrome tab on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__chrome_new_tab'
    ]))
  })

  it('surfaces structured chrome open-url-in-new-tab helpers', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'open url in new chrome tab on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__chrome_open_url_in_new_tab'
    ]))
  })

  it('surfaces structured chrome reload helpers', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'reload active chrome tab on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__chrome_reload_active_tab'
    ]))
  })

  it('surfaces structured chrome focus-by-url helpers', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'focus chrome tab by url on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__chrome_focus_tab_by_url'
    ]))
  })

  it('surfaces structured chrome tab-list helpers', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'list open chrome tabs and browser pages on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__chrome_list_tabs'
    ]))
  })

  it('surfaces structured chrome tab-filter helpers', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'find chrome tabs by domain or title on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__chrome_find_tabs'
    ]))
  })

  it('surfaces structured chrome tab-closing helpers', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'close matching chrome tabs by query on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__chrome_close_tabs'
    ]))
  })

  it('surfaces structured chrome active-tab helpers', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'read current active chrome tab url and title on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__chrome_get_active_tab'
    ]))
  })

  it('surfaces structured chrome wait-for-tab helpers', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'wait until chrome tab by domain or url appears on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__chrome_wait_for_tab'
    ]))
  })

  it('surfaces structured chrome active-tab wait helpers', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'wait for active chrome tab title or url on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__chrome_wait_for_active_tab'
    ]))
  })

  it('surfaces structured chrome close-tab helpers', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'close active chrome tab on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__chrome_close_active_tab'
    ]))
  })

  it('surfaces first-party desktop settings helpers', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'open skillsfan settings window on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__skillsfan_open_settings'
    ]))
  })

  it('surfaces first-party desktop focus helpers', () => {
    const catalog = buildToolCatalog({ aiBrowserEnabled: false })
    const results = searchToolsByBm25({
      catalog,
      query: 'focus skillsfan main window on macos',
      limit: 5
    })

    expect(results.map((item) => item.name)).toEqual(expect.arrayContaining([
      'mcp__local-tools__skillsfan_focus_main_window'
    ]))
  })
})
