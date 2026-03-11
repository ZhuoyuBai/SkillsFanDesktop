import { existsSync, readFileSync } from 'fs'
import { extname } from 'path'
import { createOutboundEvent, getChannelManager } from '../../../main/services/channel/channel-manager'
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

  const report = stepReporterRuntime.recordStep({
    taskId,
    stepId: resolveStepId(args.extra),
    category: args.category,
    action: args.action,
    summary: textPreview || `${args.action} ${isError ? 'failed' : 'completed'}`,
    artifacts: extractArtifacts(args.action, args.toolArgs, args.result),
    metadata: {
      ...(args.metadata || {}),
      isError,
      args: sanitizeValue(args.toolArgs)
    }
  })

  if (spaceId && conversationId) {
    getChannelManager().dispatchEvent(
      createOutboundEvent('agent:host-step', spaceId, conversationId, { ...report })
    )
  }

  return report
}
