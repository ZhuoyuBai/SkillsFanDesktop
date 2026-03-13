import type { DesktopAdapterMethodCapability, DesktopKeyModifier } from '../../types'
import { escapeAppleScriptString } from './utils'

export const chromeAdapterMethods: DesktopAdapterMethodCapability[] = [
  {
    id: 'chrome.open_url',
    displayName: 'Open URL',
    action: 'open_application',
    supported: true,
    stage: 'active',
    notes: 'Opens a URL in Chrome without free-form prompting.'
  },
  {
    id: 'chrome.focus_tab_by_title',
    displayName: 'Focus Tab By Title',
    action: 'run_applescript',
    supported: true,
    stage: 'active',
    notes: 'Focuses a Chrome tab by partial title match through a structured adapter method.'
  },
  {
    id: 'chrome.new_tab',
    displayName: 'New Tab',
    action: 'press_key',
    supported: true,
    stage: 'active',
    notes: 'Opens a new Chrome tab through a structured shortcut helper.'
  },
  {
    id: 'chrome.reload_active_tab',
    displayName: 'Reload Active Tab',
    action: 'press_key',
    supported: true,
    stage: 'active',
    notes: 'Reloads the active Chrome tab through a structured shortcut helper.'
  },
  {
    id: 'chrome.focus_tab_by_url',
    displayName: 'Focus Tab By URL',
    action: 'run_applescript',
    supported: true,
    stage: 'active',
    notes: 'Focuses a Chrome tab by partial URL match through a structured adapter method.'
  },
  {
    id: 'chrome.open_url_in_new_tab',
    displayName: 'Open URL In New Tab',
    action: 'run_applescript',
    supported: true,
    stage: 'active',
    notes: 'Opens a URL in a new Chrome tab through a structured adapter method.'
  },
  {
    id: 'chrome.list_tabs',
    displayName: 'List Tabs',
    action: 'run_applescript',
    supported: true,
    stage: 'active',
    notes: 'Lists Chrome tabs with titles, URLs, window indices, and active state through a structured adapter method.'
  },
  {
    id: 'chrome.get_active_tab',
    displayName: 'Get Active Tab',
    action: 'run_applescript',
    supported: true,
    stage: 'active',
    notes: 'Reads the active Chrome tab title and URL through a structured adapter method.'
  },
  {
    id: 'chrome.wait_for_tab',
    displayName: 'Wait For Tab',
    action: 'run_applescript',
    supported: true,
    stage: 'active',
    notes: 'Polls Chrome tabs until a title, URL, or domain match appears through a structured adapter workflow.'
  },
  {
    id: 'chrome.wait_for_active_tab',
    displayName: 'Wait For Active Tab',
    action: 'run_applescript',
    supported: true,
    stage: 'active',
    notes: 'Polls the active Chrome tab until its title, URL, or domain matches a structured query.'
  },
  {
    id: 'chrome.close_active_tab',
    displayName: 'Close Active Tab',
    action: 'press_key',
    supported: true,
    stage: 'active',
    notes: 'Closes the active Chrome tab through a structured shortcut helper.'
  },
  {
    id: 'chrome.find_tabs',
    displayName: 'Find Tabs',
    action: 'run_applescript',
    supported: true,
    stage: 'active',
    notes: 'Filters Chrome tabs by title, URL, or domain through a structured adapter method.'
  },
  {
    id: 'chrome.close_tabs',
    displayName: 'Close Tabs',
    action: 'press_key',
    supported: true,
    stage: 'active',
    notes: 'Finds and closes matching Chrome tabs through a structured adapter workflow.'
  }
]

export function buildChromeOpenUrlTarget(url: string): string {
  return url.trim()
}

export function buildChromeFocusTabScript(
  title: string,
  application = 'Google Chrome'
): string {
  const escapedTitle = escapeAppleScriptString(title.trim())
  const escapedApplication = escapeAppleScriptString(application.trim() || 'Google Chrome')

  return [
    `tell application "${escapedApplication}"`,
    '  activate',
    '  set matchedTab to false',
    '  repeat with w in windows',
    '    repeat with t in tabs of w',
    `      if title of t contains "${escapedTitle}" then`,
    '        set active tab index of w to (index of t)',
    '        set index of w to 1',
    '        set matchedTab to true',
    '        return',
    '      end if',
    '    end repeat',
    '  end repeat',
    `  error "Tab not found: ${escapedTitle}"`,
    'end tell'
  ].join('\n')
}

export function buildChromeFocusTabByUrlScript(
  url: string,
  application = 'Google Chrome'
): string {
  const escapedUrl = escapeAppleScriptString(url.trim())
  const escapedApplication = escapeAppleScriptString(application.trim() || 'Google Chrome')

  return [
    `tell application "${escapedApplication}"`,
    '  activate',
    '  repeat with w in windows',
    '    repeat with t in tabs of w',
    `      if URL of t contains "${escapedUrl}" then`,
    '        set active tab index of w to (index of t)',
    '        set index of w to 1',
    '        return',
    '      end if',
    '    end repeat',
    '  end repeat',
    `  error "Tab not found by URL: ${escapedUrl}"`,
    'end tell'
  ].join('\n')
}

export function buildChromeOpenUrlInNewTabScript(
  url: string,
  application = 'Google Chrome'
): string {
  const escapedUrl = escapeAppleScriptString(url.trim())
  const escapedApplication = escapeAppleScriptString(application.trim() || 'Google Chrome')

  return [
    `tell application "${escapedApplication}"`,
    '  activate',
    '  if (count of windows) = 0 then',
    '    make new window',
    `    set URL of active tab of front window to "${escapedUrl}"`,
    '  else',
    '    tell front window',
    `      set newTab to make new tab at end of tabs with properties {URL:"${escapedUrl}"}`,
    '      set active tab index to (index of newTab)',
    '    end tell',
    '    set index of front window to 1',
    '  end if',
    'end tell'
  ].join('\n')
}

export function buildChromeNewTabShortcut(): {
  key: string
  modifiers: DesktopKeyModifier[]
} {
  return {
    key: 't',
    modifiers: ['command']
  }
}

export function buildChromeReloadActiveTabShortcut(): {
  key: string
  modifiers: DesktopKeyModifier[]
} {
  return {
    key: 'r',
    modifiers: ['command']
  }
}

export function buildChromeCloseActiveTabShortcut(): {
  key: string
  modifiers: DesktopKeyModifier[]
} {
  return {
    key: 'w',
    modifiers: ['command']
  }
}

export function buildChromeListTabsScript(
  application = 'Google Chrome'
): string {
  const escapedApplication = escapeAppleScriptString(application.trim() || 'Google Chrome')

  return [
    'on replaceText(subjectText, searchText, replacementText)',
    '  set AppleScript\'s text item delimiters to searchText',
    '  set textItems to every text item of subjectText',
    '  set AppleScript\'s text item delimiters to replacementText',
    '  set normalizedText to textItems as text',
    '  set AppleScript\'s text item delimiters to ""',
    '  return normalizedText',
    'end replaceText',
    '',
    'on sanitizeField(rawValue)',
    '  set normalizedText to rawValue as text',
    '  set normalizedText to my replaceText(normalizedText, return, " ")',
    '  set normalizedText to my replaceText(normalizedText, linefeed, " ")',
    '  set normalizedText to my replaceText(normalizedText, (ASCII character 9), " ")',
    '  return normalizedText',
    'end sanitizeField',
    '',
    `tell application "${escapedApplication}"`,
    '  activate',
    '  set fieldSeparator to ASCII character 9',
    '  set outputLines to {}',
    '  repeat with w in windows',
    '    set activeTabIndex to active tab index of w',
    '    repeat with t in tabs of w',
    '      set tabTitle to my sanitizeField(title of t)',
    '      set tabUrl to my sanitizeField(URL of t)',
    '      set isActive to ((index of t) is activeTabIndex) as string',
    '      set end of outputLines to ((index of w as string) & fieldSeparator & (index of t as string) & fieldSeparator & isActive & fieldSeparator & tabTitle & fieldSeparator & tabUrl)',
    '    end repeat',
    '  end repeat',
    '  set AppleScript\'s text item delimiters to linefeed',
    '  set outputText to outputLines as text',
    '  set AppleScript\'s text item delimiters to ""',
    '  return outputText',
    'end tell'
  ].join('\n')
}

export function buildChromeGetActiveTabScript(
  application = 'Google Chrome'
): string {
  const escapedApplication = escapeAppleScriptString(application.trim() || 'Google Chrome')

  return [
    'on replaceText(subjectText, searchText, replacementText)',
    '  set AppleScript\'s text item delimiters to searchText',
    '  set textItems to every text item of subjectText',
    '  set AppleScript\'s text item delimiters to replacementText',
    '  set normalizedText to textItems as text',
    '  set AppleScript\'s text item delimiters to ""',
    '  return normalizedText',
    'end replaceText',
    '',
    'on sanitizeField(rawValue)',
    '  set normalizedText to rawValue as text',
    '  set normalizedText to my replaceText(normalizedText, return, " ")',
    '  set normalizedText to my replaceText(normalizedText, linefeed, " ")',
    '  set normalizedText to my replaceText(normalizedText, (ASCII character 9), " ")',
    '  return normalizedText',
    'end sanitizeField',
    '',
    `tell application "${escapedApplication}"`,
    '  activate',
    '  if (count of windows) = 0 then',
    `    error "${escapedApplication} has no open windows."`,
    '  end if',
    '  set fieldSeparator to ASCII character 9',
    '  set frontWindow to front window',
    '  set activeTabIndexValue to active tab index of frontWindow',
    '  set activeTabRef to active tab of frontWindow',
    '  set tabTitle to my sanitizeField(title of activeTabRef)',
    '  set tabUrl to my sanitizeField(URL of activeTabRef)',
    '  return ((index of frontWindow as string) & fieldSeparator & (activeTabIndexValue as string) & fieldSeparator & tabTitle & fieldSeparator & tabUrl)',
    'end tell'
  ].join('\n')
}
