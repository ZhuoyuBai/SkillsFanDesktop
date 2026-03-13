import type { DesktopAdapterMethodCapability, DesktopKeyModifier } from '../../types'
import { escapeAppleScriptString } from './utils'

export const finderAdapterMethods: DesktopAdapterMethodCapability[] = [
  {
    id: 'finder.reveal_path',
    displayName: 'Reveal Path',
    action: 'run_applescript',
    supported: true,
    stage: 'active',
    notes: 'Reveals a POSIX path in Finder without free-form AppleScript.'
  },
  {
    id: 'finder.open_folder',
    displayName: 'Open Folder',
    action: 'open_application',
    supported: true,
    stage: 'active',
    notes: 'Opens a folder directly in Finder without free-form AppleScript.'
  },
  {
    id: 'finder.open_home_folder',
    displayName: 'Open Home Folder',
    action: 'open_application',
    supported: true,
    stage: 'active',
    notes: 'Opens the current user home folder in Finder through a structured adapter method.'
  },
  {
    id: 'finder.new_window',
    displayName: 'New Window',
    action: 'press_key',
    supported: true,
    stage: 'active',
    notes: 'Opens a new Finder window through a structured shortcut helper.'
  },
  {
    id: 'finder.search',
    displayName: 'Search',
    action: 'run_applescript',
    supported: true,
    stage: 'active',
    notes: 'Searches files through a structured Finder-oriented desktop helper.'
  }
]

function quoteShellSingleString(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`
}

export function buildFinderRevealPathScript(targetPath: string): string {
  const escapedPath = escapeAppleScriptString(targetPath.trim())

  return [
    'tell application "Finder"',
    '  activate',
    `  reveal POSIX file "${escapedPath}"`,
    'end tell'
  ].join('\n')
}

export function buildFinderOpenFolderTarget(targetPath: string): string {
  return targetPath.trim()
}

export function buildFinderOpenHomeFolderTarget(homePath: string): string {
  return homePath.trim()
}

export function buildFinderNewWindowShortcut(): {
  key: string
  modifiers: DesktopKeyModifier[]
} {
  return {
    key: 'n',
    modifiers: ['command']
  }
}

export function buildFinderSearchScript(
  query: string,
  directory: string,
  limit: number
): string {
  const normalizedLimit = Math.max(1, Math.floor(limit))
  const shellCommand = [
    `count=$(/usr/bin/mdfind -count -onlyin ${quoteShellSingleString(directory.trim())} ${quoteShellSingleString(query.trim())} 2>/dev/null || echo 0)`,
    '/usr/bin/printf "__COUNT__:%s\\n" "$count"',
    `/usr/bin/mdfind -onlyin ${quoteShellSingleString(directory.trim())} ${quoteShellSingleString(query.trim())} | /usr/bin/head -n ${normalizedLimit}`
  ].join('; ')
  const escapedShellCommand = escapeAppleScriptString(shellCommand)

  return [
    `set searchOutput to do shell script "${escapedShellCommand}"`,
    'return searchOutput'
  ].join('\n')
}
