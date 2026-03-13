import { existsSync, readFileSync } from 'fs'
import { extname } from 'path'
import {
  createGatewayOutboundEvent,
  getGatewayChannelManager
} from '../../channels'
import {
  relayGatewayConversationEvent,
  shouldRelayGatewayChannelEvents
} from '../../channels/relay'
import { findPreferredGatewaySessionByConversationId } from '../../sessions'
import { normalizeLocalFilePath } from '../../../main/services/local-tools/path-utils'
import type { StepArtifactRef, StepReport } from '../types'
import { stepReporterRuntime } from './runtime'

function truncateText(value: string, maxLength = 240): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    return truncateText(value)
  }

  if (depth >= 2) {
    return '[truncated]'
  }

  if (Array.isArray(value)) {
    return value.slice(0, 8).map((item) => sanitizeValue(item, depth + 1))
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 12)
    return Object.fromEntries(entries.map(([key, nestedValue]) => [key, sanitizeValue(nestedValue, depth + 1)]))
  }

  return String(value)
}

function getRecord(extra: unknown): Record<string, unknown> | null {
  return extra && typeof extra === 'object' ? extra as Record<string, unknown> : null
}

export function resolveStepTaskId(extra: unknown, fallbackTaskId: string): string {
  const record = getRecord(extra)
  const candidates = [
    record?.taskId,
    record?.task_id,
    record?.conversationId,
    record?.conversation_id
  ]

  return candidates.find((value): value is string => typeof value === 'string' && value.length > 0)
    || fallbackTaskId
}

function resolveStepSpaceId(extra: unknown, fallbackSpaceId?: string): string | undefined {
  const record = getRecord(extra)
  const candidates = [
    record?.spaceId,
    record?.space_id,
    fallbackSpaceId
  ]

  return candidates.find((value): value is string => typeof value === 'string' && value.length > 0)
}

function resolveStepConversationId(extra: unknown, fallbackConversationId?: string): string | undefined {
  const record = getRecord(extra)
  const candidates = [
    record?.conversationId,
    record?.conversation_id,
    fallbackConversationId
  ]

  return candidates.find((value): value is string => typeof value === 'string' && value.length > 0)
}

export function resolveStepId(extra: unknown): string | undefined {
  const record = getRecord(extra)
  const candidates = [
    record?.toolUseId,
    record?.tool_use_id,
    record?.toolUseID,
    record?.id
  ]

  return candidates.find((value): value is string => typeof value === 'string' && value.length > 0)
}

function extractTextPreview(result: unknown): string | undefined {
  if (!result || typeof result !== 'object') return undefined

  const content = (result as { content?: unknown }).content
  if (!Array.isArray(content)) return undefined

  const firstTextBlock = content.find((item) => (
    item
    && typeof item === 'object'
    && (item as { type?: unknown }).type === 'text'
    && typeof (item as { text?: unknown }).text === 'string'
  )) as { text?: string } | undefined

  return firstTextBlock?.text ? truncateText(firstTextBlock.text.replace(/\s+/g, ' ').trim()) : undefined
}

function extractTextContent(result: unknown, maxLength = 4000): string | undefined {
  if (!result || typeof result !== 'object') return undefined

  const content = (result as { content?: unknown }).content
  if (!Array.isArray(content)) return undefined

  const firstTextBlock = content.find((item) => (
    item
    && typeof item === 'object'
    && (item as { type?: unknown }).type === 'text'
    && typeof (item as { text?: unknown }).text === 'string'
  )) as { text?: string } | undefined

  if (!firstTextBlock?.text) return undefined
  return firstTextBlock.text.length > maxLength
    ? `${firstTextBlock.text.slice(0, maxLength)}...`
    : firstTextBlock.text
}

function getArtifactKind(action: string, filePath?: string): StepArtifactRef['kind'] {
  const extension = extname(filePath || '').toLowerCase()
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(extension)) {
    return 'screenshot'
  }

  if (action.includes('screenshot')) {
    return 'screenshot'
  }

  if (action.includes('snapshot') || action.includes('ui_tree')) {
    return 'snapshot'
  }

  return 'file'
}

function getImageMimeType(filePath: string): StepArtifactRef['mimeType'] | undefined {
  switch (extname(filePath).toLowerCase()) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    default:
      return undefined
  }
}

function shouldAttachTextPreview(action: string): boolean {
  return action.includes('snapshot')
    || action.includes('ui_tree')
    || action === 'run_applescript'
}

function loadImagePreviewFromPath(filePath: string): Pick<StepArtifactRef, 'mimeType' | 'previewImageData'> | undefined {
  const mimeType = getImageMimeType(filePath)
  if (!mimeType || !existsSync(filePath)) {
    return undefined
  }

  try {
    return {
      mimeType,
      previewImageData: readFileSync(filePath).toString('base64')
    }
  } catch {
    return undefined
  }
}

function extractLocalImagePath(result: unknown): string | undefined {
  const text = extractTextContent(result, 12_000)
  if (!text) return undefined

  const matches = [
    ...Array.from(
      text.matchAll(/(?:^|[\s"'([{<])((?:\/[^\n\r"'<>]*?\.(?:png|jpe?g|gif|webp)\b))/ig),
      (match) => match[1]
    ),
    ...Array.from(
      text.matchAll(/(?:^|[\s"'([{<])((?:~\/[^\n\r"'<>]*?\.(?:png|jpe?g|gif|webp)\b))/ig),
      (match) => match[1]
    ),
    ...Array.from(
      text.matchAll(/(?:^|[\s"'([{<])((?:[A-Za-z0-9_.-]+(?: [A-Za-z0-9_.-]+)*:(?:[^:\n\r"'<>]+:)+[^:\n\r"'<>]*\.(?:png|jpe?g|gif|webp)\b))/ig),
      (match) => match[1]
    )
  ]

  for (const match of matches) {
    const candidate = match.trim().replace(/^["'([{<]+/, '').replace(/[>"')\]}.,;:!?]+$/, '')

    const variants = [candidate]
    if (candidate.includes(' ')) {
      const segments = candidate.split(/\s+/)
      for (let index = 1; index < segments.length; index += 1) {
        variants.push(segments.slice(index).join(' '))
      }
    }

    for (const variant of variants) {
      const normalizedCandidate = normalizeLocalFilePath(variant)
      const mimeType = getImageMimeType(normalizedCandidate)
      if (mimeType && existsSync(normalizedCandidate)) {
        return normalizedCandidate
      }
    }
  }

  return undefined
}

function extractArtifacts(action: string, args: unknown, result: unknown): StepArtifactRef[] | undefined {
  if (
    result
    && typeof result === 'object'
    && (result as { isError?: unknown }).isError === true
  ) {
    return undefined
  }

  const argRecord = args && typeof args === 'object' ? args as Record<string, unknown> : null
  const artifacts: StepArtifactRef[] = []
  const previewText = extractTextContent(result)

  const requestedFilePath = typeof argRecord?.filePath === 'string' && argRecord.filePath.length > 0
    ? normalizeLocalFilePath(argRecord.filePath)
    : undefined
  const resolvedFilePath = requestedFilePath || extractLocalImagePath(result)

  const imageBlock = result && typeof result === 'object' && Array.isArray((result as { content?: unknown }).content)
    ? (result as {
        content: Array<{ type?: string; mimeType?: string; data?: string }>
      }).content.find((item) => item?.type === 'image')
    : undefined

  if (resolvedFilePath) {
    const artifact: StepArtifactRef = {
      kind: getArtifactKind(action, resolvedFilePath),
      label: action,
      path: resolvedFilePath,
      previewText: shouldAttachTextPreview(action)
        ? previewText
        : undefined
    }

    if (artifact.kind === 'screenshot') {
      if (imageBlock?.mimeType && imageBlock.data) {
        artifact.mimeType = imageBlock.mimeType
        artifact.previewImageData = imageBlock.data
      } else {
        Object.assign(artifact, loadImagePreviewFromPath(resolvedFilePath))
      }
    }

    artifacts.push(artifact)
  }

  if (!resolvedFilePath && imageBlock?.mimeType && imageBlock.data) {
    artifacts.push({
      kind: 'screenshot',
      label: action,
      mimeType: imageBlock.mimeType,
      previewImageData: imageBlock.data
    })
  }

  if (artifacts.length === 0 && previewText) {
    if (action.includes('snapshot') || action.includes('ui_tree')) {
      artifacts.push({
        kind: 'snapshot',
        label: action,
        previewText
      })
    } else if (action === 'run_applescript') {
      artifacts.push({
        kind: 'log',
        label: action,
        previewText
      })
    }
  }

  return artifacts.length > 0 ? artifacts : undefined
}

function formatTerminalTargetContext(argRecord: Record<string, unknown> | null): string {
  const windowIndex = typeof argRecord?.windowIndex === 'number' ? `w${argRecord.windowIndex}` : null
  const tabIndex = typeof argRecord?.tabIndex === 'number' ? `t${argRecord.tabIndex}` : null
  const paneNumber = typeof argRecord?.paneIndex === 'number' ? argRecord.paneIndex : null
  const sessionIndex = typeof argRecord?.sessionIndex === 'number' && argRecord.sessionIndex !== paneNumber
    ? `s${argRecord.sessionIndex}`
    : null
  const paneIndex = paneNumber != null ? `p${paneNumber}` : null
  const target = [windowIndex, tabIndex, sessionIndex, paneIndex].filter(Boolean).join(':')
  return target ? ` [${target}]` : ''
}

function generateStepSummary(action: string, toolArgs: unknown, isError: boolean): string | undefined {
  const argRecord = toolArgs && typeof toolArgs === 'object' ? toolArgs as Record<string, unknown> : null

  switch (action) {
    case 'browser_navigate':
    case 'browser_new_page': {
      const url = typeof argRecord?.url === 'string' ? argRecord.url : undefined
      if (url) {
        try {
          return `Navigate to ${new URL(url).hostname}`
        } catch {
          return `Navigate to ${truncateText(url, 60)}`
        }
      }
      return undefined
    }
    case 'browser_click':
      return argRecord?.uid ? `Click "${truncateText(String(argRecord.uid), 40)}"` : 'Click element'
    case 'browser_hover':
      return argRecord?.uid ? `Hover "${truncateText(String(argRecord.uid), 40)}"` : 'Hover element'
    case 'browser_fill':
      return argRecord?.uid ? `Fill "${truncateText(String(argRecord.uid), 40)}"` : 'Fill field'
    case 'browser_fill_form':
      return 'Fill form'
    case 'browser_press_key':
      return argRecord?.key ? `Press ${argRecord.key}` : 'Press key'
    case 'browser_screenshot':
      return 'Capture page screenshot'
    case 'browser_snapshot':
      return 'Read page structure'
    case 'browser_wait_for':
      return argRecord?.text ? `Wait for "${truncateText(String(argRecord.text), 40)}"` : 'Wait for content'
    case 'browser_evaluate':
      return 'Run page script'
    case 'browser_select_page':
      return 'Switch browser tab'
    case 'browser_close_page':
      return 'Close browser tab'
    case 'browser_list_pages':
      return 'List browser tabs'
    case 'browser_upload_file':
      return 'Upload file'
    case 'browser_handle_dialog':
      return 'Handle dialog'
    case 'browser_network_requests':
      return 'Inspect network requests'
    case 'browser_console':
      return 'Inspect console logs'
    case 'browser_emulate':
      return 'Change browser environment'
    case 'browser_resize':
      return 'Resize browser'
    case 'browser_perf_start':
      return 'Start performance trace'
    case 'browser_perf_stop':
      return 'Stop performance trace'
    case 'browser_perf_insight':
      return 'Read performance insight'
    case 'open_application': {
      const app = typeof argRecord?.application === 'string' ? argRecord.application : undefined
      const target = typeof argRecord?.target === 'string' ? argRecord.target : undefined
      if (app && target) return `Open ${app} → ${truncateText(target, 40)}`
      if (app) return `Open ${app}`
      return 'Open application'
    }
    case 'activate_application':
    case 'desktop_activate_application': {
      const app = typeof argRecord?.application === 'string' ? argRecord.application : undefined
      return app ? `Activate ${app}` : 'Activate application'
    }
    case 'run_applescript':
      return 'Run desktop script'
    case 'terminal_run_command': {
      const application = typeof argRecord?.application === 'string' ? argRecord.application : 'Terminal'
      const targetContext = formatTerminalTargetContext(argRecord)
      const command = typeof argRecord?.command === 'string'
        ? truncateText(String(argRecord.command), 40)
        : typeof argRecord?.commandPreview === 'string'
          ? truncateText(String(argRecord.commandPreview), 40)
          : undefined
      return command ? `Run in ${application}${targetContext} → ${command}` : `Run command in ${application}${targetContext}`
    }
    case 'terminal_new_tab_run_command': {
      const application = typeof argRecord?.application === 'string' ? argRecord.application : 'Terminal'
      const command = typeof argRecord?.command === 'string'
        ? truncateText(String(argRecord.command), 40)
        : typeof argRecord?.commandPreview === 'string'
          ? truncateText(String(argRecord.commandPreview), 40)
          : undefined
      return command ? `Run in new ${application} tab → ${command}` : `Run in new ${application} tab`
    }
    case 'terminal_new_window_run_command': {
      const application = typeof argRecord?.application === 'string' ? argRecord.application : 'Terminal'
      const command = typeof argRecord?.command === 'string'
        ? truncateText(String(argRecord.command), 40)
        : typeof argRecord?.commandPreview === 'string'
          ? truncateText(String(argRecord.commandPreview), 40)
          : undefined
      return command ? `Run in new ${application} window → ${command}` : `Run in new ${application} window`
    }
    case 'terminal_run_command_in_directory': {
      const application = typeof argRecord?.application === 'string' ? argRecord.application : 'Terminal'
      const targetContext = formatTerminalTargetContext(argRecord)
      const directory = typeof argRecord?.directory === 'string'
        ? truncateText(String(argRecord.directory), 32)
        : undefined
      const command = typeof argRecord?.command === 'string'
        ? truncateText(String(argRecord.command), 40)
        : typeof argRecord?.commandPreview === 'string'
          ? truncateText(String(argRecord.commandPreview), 40)
          : undefined
      if (directory && command) return `Run in ${application}${targetContext} @ ${directory} → ${command}`
      if (command) return `Run in ${application}${targetContext} → ${command}`
      return `Run command in ${application}${targetContext} directory`
    }
    case 'terminal_list_sessions': {
      const application = typeof argRecord?.application === 'string' ? argRecord.application : 'Terminal'
      return `List ${application} sessions`
    }
    case 'terminal_list_panes': {
      const application = typeof argRecord?.application === 'string' ? argRecord.application : 'iTerm2'
      const targetContext = formatTerminalTargetContext(argRecord)
      return targetContext ? `List ${application}${targetContext} panes` : `List ${application} panes`
    }
    case 'terminal_get_pane_layout': {
      const application = typeof argRecord?.application === 'string' ? argRecord.application : 'iTerm2'
      const targetContext = formatTerminalTargetContext(argRecord)
      return targetContext ? `Read ${application}${targetContext} pane layout` : `Read ${application} pane layout`
    }
    case 'terminal_focus_session': {
      const application = typeof argRecord?.application === 'string' ? argRecord.application : 'Terminal'
      const targetContext = formatTerminalTargetContext(argRecord)
      return targetContext ? `Focus ${application}${targetContext}` : `Focus ${application} session`
    }
    case 'terminal_interrupt_process': {
      const application = typeof argRecord?.application === 'string' ? argRecord.application : 'Terminal'
      const targetContext = formatTerminalTargetContext(argRecord)
      return `Interrupt process in ${application}${targetContext}`
    }
    case 'terminal_get_session_state': {
      const application = typeof argRecord?.application === 'string' ? argRecord.application : 'Terminal'
      const targetContext = formatTerminalTargetContext(argRecord)
      return `Read session state from ${application}${targetContext}`
    }
    case 'terminal_get_last_command_result': {
      const application = typeof argRecord?.application === 'string' ? argRecord.application : 'Terminal'
      const targetContext = formatTerminalTargetContext(argRecord)
      return `Read last command result from ${application}${targetContext}`
    }
    case 'terminal_read_output': {
      const application = typeof argRecord?.application === 'string' ? argRecord.application : 'Terminal'
      const targetContext = formatTerminalTargetContext(argRecord)
      return `Read output from ${application}${targetContext}`
    }
    case 'terminal_wait_for_output': {
      const application = typeof argRecord?.application === 'string' ? argRecord.application : 'Terminal'
      const targetContext = formatTerminalTargetContext(argRecord)
      const expectedText = typeof argRecord?.expectedText === 'string'
        ? truncateText(String(argRecord.expectedText), 40)
        : undefined
      return expectedText
        ? `Wait for "${expectedText}" in ${application}${targetContext}`
        : `Wait for terminal output in ${application}${targetContext}`
    }
    case 'terminal_wait_until_not_busy': {
      const application = typeof argRecord?.application === 'string' ? argRecord.application : 'Terminal'
      const targetContext = formatTerminalTargetContext(argRecord)
      return `Wait for ${application}${targetContext} to become idle`
    }
    case 'terminal_wait_until_idle': {
      const application = typeof argRecord?.application === 'string' ? argRecord.application : 'Terminal'
      const targetContext = formatTerminalTargetContext(argRecord)
      return `Wait for idle ${application}${targetContext} output`
    }
    case 'terminal_split_pane_run_command': {
      const application = typeof argRecord?.application === 'string' ? argRecord.application : 'iTerm2'
      const targetContext = formatTerminalTargetContext(argRecord)
      const direction = typeof argRecord?.direction === 'string' ? argRecord.direction : 'vertical'
      const command = typeof argRecord?.command === 'string'
        ? truncateText(String(argRecord.command), 40)
        : typeof argRecord?.commandPreview === 'string'
          ? truncateText(String(argRecord.commandPreview), 40)
          : undefined
      return command
        ? `Split ${application}${targetContext} ${direction} → ${command}`
        : `Split ${application}${targetContext} ${direction}`
    }
    case 'terminal_run_command_and_wait': {
      const application = typeof argRecord?.application === 'string' ? argRecord.application : 'Terminal'
      const targetContext = formatTerminalTargetContext(argRecord)
      const command = typeof argRecord?.command === 'string'
        ? truncateText(String(argRecord.command), 40)
        : typeof argRecord?.commandPreview === 'string'
          ? truncateText(String(argRecord.commandPreview), 40)
          : undefined
      return command ? `Run and wait in ${application}${targetContext} → ${command}` : `Run and wait in ${application}${targetContext}`
    }
    case 'terminal_run_command_in_directory_and_wait': {
      const application = typeof argRecord?.application === 'string' ? argRecord.application : 'Terminal'
      const targetContext = formatTerminalTargetContext(argRecord)
      const directory = typeof argRecord?.directory === 'string'
        ? truncateText(String(argRecord.directory), 32)
        : undefined
      const command = typeof argRecord?.command === 'string'
        ? truncateText(String(argRecord.command), 40)
        : typeof argRecord?.commandPreview === 'string'
          ? truncateText(String(argRecord.commandPreview), 40)
          : undefined
      if (directory && command) return `Run and wait in ${application}${targetContext} @ ${directory} → ${command}`
      if (command) return `Run and wait in ${application}${targetContext} → ${command}`
      return `Run and wait in ${application}${targetContext} directory`
    }
    case 'chrome_open_url': {
      const url = typeof argRecord?.url === 'string'
        ? truncateText(String(argRecord.url), 40)
        : typeof argRecord?.target === 'string'
          ? truncateText(String(argRecord.target), 40)
          : undefined
      return url ? `Open in Chrome → ${url}` : 'Open in Chrome'
    }
    case 'chrome_open_url_in_new_tab': {
      const url = typeof argRecord?.url === 'string'
        ? truncateText(String(argRecord.url), 40)
        : typeof argRecord?.target === 'string'
          ? truncateText(String(argRecord.target), 40)
          : undefined
      return url ? `Open in new Chrome tab → ${url}` : 'Open in new Chrome tab'
    }
    case 'chrome_new_tab':
      return 'Open new Chrome tab'
    case 'chrome_reload_active_tab':
      return 'Reload active Chrome tab'
    case 'chrome_focus_tab': {
      const title = typeof argRecord?.title === 'string'
        ? truncateText(String(argRecord.title), 40)
        : typeof argRecord?.target === 'string'
          ? truncateText(String(argRecord.target), 40)
          : undefined
      return title ? `Focus Chrome tab "${title}"` : 'Focus Chrome tab'
    }
    case 'chrome_focus_tab_by_url': {
      const url = typeof argRecord?.url === 'string'
        ? truncateText(String(argRecord.url), 40)
        : typeof argRecord?.target === 'string'
          ? truncateText(String(argRecord.target), 40)
          : undefined
      return url ? `Focus Chrome tab by URL "${url}"` : 'Focus Chrome tab by URL'
    }
    case 'chrome_list_tabs': {
      const application = typeof argRecord?.application === 'string'
        ? truncateText(String(argRecord.application), 40)
        : 'Google Chrome'
      return `List tabs in ${application}`
    }
    case 'chrome_find_tabs': {
      const query = typeof argRecord?.query === 'string'
        ? truncateText(String(argRecord.query), 40)
        : undefined
      const field = typeof argRecord?.field === 'string'
        ? truncateText(String(argRecord.field), 20)
        : 'either'
      if (query && field !== 'either') {
        return `Find Chrome tabs by ${field} "${query}"`
      }
      return query ? `Find Chrome tabs matching "${query}"` : 'Find Chrome tabs'
    }
    case 'chrome_close_tabs': {
      const query = typeof argRecord?.query === 'string'
        ? truncateText(String(argRecord.query), 40)
        : undefined
      const field = typeof argRecord?.field === 'string'
        ? truncateText(String(argRecord.field), 20)
        : 'either'
      if (query && field !== 'either') {
        return `Close Chrome tabs by ${field} "${query}"`
      }
      return query ? `Close Chrome tabs matching "${query}"` : 'Close Chrome tabs'
    }
    case 'chrome_get_active_tab': {
      const application = typeof argRecord?.application === 'string'
        ? truncateText(String(argRecord.application), 40)
        : 'Google Chrome'
      return `Read active tab in ${application}`
    }
    case 'chrome_wait_for_tab': {
      const query = typeof argRecord?.query === 'string'
        ? truncateText(String(argRecord.query), 40)
        : undefined
      const field = typeof argRecord?.field === 'string'
        ? truncateText(String(argRecord.field), 20)
        : 'either'
      if (query && field !== 'either') {
        return `Wait for Chrome tab by ${field} "${query}"`
      }
      return query ? `Wait for Chrome tab matching "${query}"` : 'Wait for Chrome tab'
    }
    case 'chrome_wait_for_active_tab': {
      const query = typeof argRecord?.query === 'string'
        ? truncateText(String(argRecord.query), 40)
        : undefined
      const field = typeof argRecord?.field === 'string'
        ? truncateText(String(argRecord.field), 20)
        : 'either'
      if (query && field !== 'either') {
        return `Wait for active Chrome tab by ${field} "${query}"`
      }
      return query ? `Wait for active Chrome tab matching "${query}"` : 'Wait for active Chrome tab'
    }
    case 'chrome_close_active_tab': {
      const application = typeof argRecord?.application === 'string'
        ? truncateText(String(argRecord.application), 40)
        : 'Google Chrome'
      return `Close active tab in ${application}`
    }
    case 'finder_reveal_path': {
      const target = typeof argRecord?.target === 'string'
        ? truncateText(String(argRecord.target), 40)
        : undefined
      return target ? `Reveal in Finder ${target}` : 'Reveal in Finder'
    }
    case 'finder_open_folder': {
      const target = typeof argRecord?.target === 'string'
        ? truncateText(String(argRecord.target), 40)
        : undefined
      return target ? `Open Finder folder ${target}` : 'Open Finder folder'
    }
    case 'finder_open_home_folder':
      return 'Open Finder home folder'
    case 'finder_new_window':
      return 'Open new Finder window'
    case 'finder_search': {
      const query = typeof argRecord?.query === 'string'
        ? truncateText(String(argRecord.query), 40)
        : undefined
      return query ? `Search in Finder "${query}"` : 'Search in Finder'
    }
    case 'skillsfan_open_settings': {
      const application = typeof argRecord?.application === 'string'
        ? truncateText(String(argRecord.application), 40)
        : 'SkillsFan'
      return `Open settings in ${application}`
    }
    case 'skillsfan_focus_main_window': {
      const application = typeof argRecord?.application === 'string'
        ? truncateText(String(argRecord.application), 40)
        : 'SkillsFan'
      return `Focus ${application} main window`
    }
    case 'desktop_screenshot':
      return 'Capture desktop screenshot'
    case 'desktop_ui_tree':
      return 'Read desktop elements'
    case 'press_key':
    case 'desktop_press_key': {
      const key = typeof argRecord?.key === 'string' ? argRecord.key : undefined
      const modifiers = Array.isArray(argRecord?.modifiers)
        ? argRecord.modifiers.filter((value): value is string => typeof value === 'string')
        : []
      if (key) {
        const shortcut = [...modifiers, key].join('+')
        return `Press ${shortcut}`
      }
      return 'Press key'
    }
    case 'type_text':
    case 'desktop_type_text': {
      const textLength = typeof argRecord?.textLength === 'number'
        ? argRecord.textLength
        : typeof argRecord?.text === 'string'
          ? argRecord.text.length
          : undefined
      return typeof textLength === 'number' ? `Type ${textLength} chars` : 'Type text'
    }
    case 'click':
    case 'desktop_click': {
      const x = argRecord?.x
      const y = argRecord?.y
      if (typeof x === 'number' && typeof y === 'number') {
        return `Click at (${x}, ${y})`
      }
      return 'Click'
    }
    case 'move_mouse':
    case 'desktop_move_mouse': {
      const x = argRecord?.x
      const y = argRecord?.y
      if (typeof x === 'number' && typeof y === 'number') {
        return `Move mouse to (${x}, ${y})`
      }
      return 'Move mouse'
    }
    case 'scroll':
    case 'desktop_scroll': {
      const x = argRecord?.x
      const y = argRecord?.y
      const dy = argRecord?.deltaY
      if (typeof x === 'number' && typeof y === 'number') {
        const direction = typeof dy === 'number' ? (dy < 0 ? ' up' : ' down') : ''
        return `Scroll${direction} at (${x}, ${y})`
      }
      return 'Scroll'
    }
    case 'list_windows':
    case 'desktop_list_windows':
      return 'List windows'
    case 'focus_window':
    case 'desktop_focus_window': {
      const app = typeof argRecord?.application === 'string' ? argRecord.application : undefined
      const win = typeof argRecord?.windowName === 'string' ? argRecord.windowName : undefined
      if (app && win) return `Focus ${app} "${win}"`
      if (app) return `Focus ${app}`
      return 'Focus window'
    }
    default:
      return undefined
  }
}

export function recordToolExecutionStep(args: {
  defaultTaskId: string
  defaultSpaceId?: string
  defaultConversationId?: string
  extra?: unknown
  category: StepReport['category']
  action: string
  toolArgs?: unknown
  result?: unknown
  metadata?: Record<string, unknown>
  autoPerception?: {
    before?: StepArtifactRef
    after?: StepArtifactRef
  }
}): StepReport {
  const isError = Boolean(
    args.result
    && typeof args.result === 'object'
    && (args.result as { isError?: unknown }).isError === true
  )
  const textPreview = extractTextPreview(args.result)
  const taskId = resolveStepTaskId(args.extra, args.defaultTaskId)
  const conversationId = resolveStepConversationId(args.extra, args.defaultConversationId)
  const spaceId = resolveStepSpaceId(args.extra, args.defaultSpaceId)
  const session = conversationId
    ? findPreferredGatewaySessionByConversationId(conversationId, spaceId ? { workspaceId: spaceId } : {})
    : null

  const toolArtifacts = extractArtifacts(args.action, args.toolArgs, args.result)
  const allArtifacts: StepArtifactRef[] = []
  if (args.autoPerception?.before) {
    allArtifacts.push(args.autoPerception.before)
  }
  if (toolArtifacts) {
    allArtifacts.push(...toolArtifacts)
  }
  if (args.autoPerception?.after) {
    allArtifacts.push(args.autoPerception.after)
  }

  const report = stepReporterRuntime.recordStep({
    taskId,
    stepId: resolveStepId(args.extra),
    category: args.category,
    action: args.action,
    summary: generateStepSummary(args.action, args.toolArgs, isError)
      || textPreview
      || `${args.action} ${isError ? 'failed' : 'completed'}`,
    artifacts: allArtifacts.length > 0 ? allArtifacts : undefined,
    metadata: {
      ...(args.metadata || {}),
      ...(session ? {
        sessionKey: session.sessionKey,
        mainSessionKey: session.mainSessionKey,
        routeChannel: session.route.channel,
        routePeerType: session.route.peerType,
        routePeerId: session.route.peerId,
        routeAccountId: session.route.accountId
      } : {}),
      isError,
      args: sanitizeValue(args.toolArgs)
    }
  })

  if (spaceId && conversationId) {
    const event = createGatewayOutboundEvent('agent:host-step', spaceId, conversationId, { ...report })
    getGatewayChannelManager().dispatchEvent(event)

    if (shouldRelayGatewayChannelEvents()) {
      relayGatewayConversationEvent(event)
    }
  }

  return report
}
