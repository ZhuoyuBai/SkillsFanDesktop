/**
 * Message List - Displays chat messages with streaming and thinking support
 * Layout: User message -> [Linear Stream (Claude Code style)] -> [Assistant Reply]
 *
 * Key Feature: LinearStream - Claude Code style timeline display
 * - All content shown chronologically from top to bottom
 * - Thinking blocks: single line summary, click to expand
 * - Tool calls: inline single-line items
 * - Text: prominent display (bright color)
 * - Skill: gradient label with child tools nested
 *
 * @see docs/streaming-scroll-animation.md for detailed implementation notes
 */

import { useEffect, useMemo, useState } from 'react'
import { MessageItem } from './MessageItem'
import { CollapsedThoughtProcess } from './CollapsedThoughtProcess'
import { LinearStream } from './LinearStream'
import { CompactNotice } from './CompactNotice'
import { BrowserTaskCard, isBrowserTool } from '../tool/BrowserTaskCard'
import { DesktopResultCard } from '../tool/DesktopResultCard'
import { buildDesktopResultModel } from '../tool/desktop-result-parser'
import { HostActivityCard } from '../tool/HostActivityCard'
import { HostStatusBanner } from '../tool/HostStatusBanner'
import type {
  Message,
  Thought,
  CompactInfo,
  TextSegment,
  HostEnvironmentStatus,
  HostStep,
  ImageAttachment
} from '../../types'
import type { SubagentRunEntry } from '../../stores/chat.store'
import { api } from '../../api'
import { useTranslation } from '../../i18n'
import {
  getLatestVisibleActiveToolUseIds,
  getMatchingToolResult
} from '../../../shared/utils/thought-dedupe'
import { stripLeadingSetModelStatus } from '../../../shared/utils/sdk-status'

interface MessageListProps {
  messages: Message[]
  streamingContent: string
  isGenerating: boolean
  isStreaming?: boolean  // True during token-level text streaming
  thoughts?: Thought[]
  isThinking?: boolean
  compactInfo?: CompactInfo | null
  error?: string | null  // Error message to display when generation fails
  isCompact?: boolean  // Compact mode when Canvas is open
  // Sub-agent task progress
  taskProgressMap?: Map<string, {
    taskId: string
    toolUseId?: string
    description: string
    summary?: string
    lastToolName?: string
    status: 'running' | 'completed' | 'failed' | 'stopped'
    usage?: { total_tokens: number; tool_uses: number; duration_ms: number }
  }>
  subagentRunMap?: Map<string, SubagentRunEntry>
  // Linear stream: text segments for timeline
  textSegments?: TextSegment[]
  lastSegmentIndex?: number
  // SDK status line
  sdkStatus?: string | null
  // Host/browser/desktop activity
  hostSteps?: HostStep[]
  hostStatus?: HostEnvironmentStatus | null
  activityCollapsed?: boolean
  onToggleActivity?: () => void
  // Hosted subagent callbacks
  onViewSubagentDetails?: (runId: string) => void
  onKillSubagent?: (runId: string) => void
}

function getBaseName(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/')
  return parts[parts.length - 1] || path
}

function extractLocalImagePaths(content: string): string[] {
  if (!content) return []

  const matches = [
    ...Array.from(
      content.matchAll(/(?:^|[\s"'([{<])((?:\/[^\n\r"'<>]*?\.(?:png|jpe?g|gif|webp)\b))/ig),
      (match) => match[1]
    ),
    ...Array.from(
      content.matchAll(/(?:^|[\s"'([{<])((?:~\/[^\n\r"'<>]*?\.(?:png|jpe?g|gif|webp)\b))/ig),
      (match) => match[1]
    ),
    ...Array.from(
      content.matchAll(/(?:^|[\s"'([{<])((?:[A-Za-z0-9_.-]+(?: [A-Za-z0-9_.-]+)*:(?:[^:\n\r"'<>]+:)+[^:\n\r"'<>]*\.(?:png|jpe?g|gif|webp)\b))/ig),
      (match) => match[1]
    )
  ]

  const seen = new Set<string>()
  const paths: string[] = []
  for (const match of matches) {
    const candidate = match.trim().replace(/^["'([{<]+/, '').replace(/[>"')\]}.,;:!?]+$/, '')
    if (!candidate || seen.has(candidate)) continue
    seen.add(candidate)
    paths.push(candidate)
  }

  return paths
}

export function MessageList({
  messages,
  streamingContent,
  isGenerating,
  isStreaming = false,
  thoughts = [],
  isThinking = false,
  compactInfo = null,
  error = null,
  isCompact = false,
  taskProgressMap,
  subagentRunMap,
  textSegments = [],
  lastSegmentIndex = 0,
  sdkStatus,
  hostSteps = [],
  hostStatus = null,
  activityCollapsed = false,
  onToggleActivity,
  onViewSubagentDetails,
  onKillSubagent,
}: MessageListProps) {
  const { t } = useTranslation()
  const [assistantInlineImageMap, setAssistantInlineImageMap] = useState<Record<string, ImageAttachment[]>>({})

  // Filter out assistant placeholders with no visible text,
  // and SDK status messages that leaked into conversation history.
  const displayMessages = messages
    .map((msg) => {
      if (msg.role !== 'assistant') return msg
      const content = stripLeadingSetModelStatus(msg.content || '')
      const hasThoughts = Array.isArray(msg.thoughts) && msg.thoughts.length > 0
      if (!content.trim() && !hasThoughts) return null
      return content === msg.content ? msg : { ...msg, content }
    })
    .filter((msg): msg is Message => msg !== null)


  // Extract real-time browser tool calls from streaming thoughts
  // This enables BrowserTaskCard to show operations as they happen
  const streamingBrowserToolCalls = useMemo(() => {
    const visibleActiveToolUseIds = getLatestVisibleActiveToolUseIds(thoughts)
    return thoughts
      .filter(t =>
        t.type === 'tool_use' &&
        t.toolName &&
        isBrowserTool(t.toolName) &&
        (getMatchingToolResult(thoughts, t) || visibleActiveToolUseIds.has(t.id))
      )
      .map(t => ({
        id: t.id,
        name: t.toolName!,
        status: getMatchingToolResult(thoughts, t)
          ? 'success' as const
          : 'running' as const,
        input: t.toolInput || {},
      }))
  }, [thoughts])

  const hasSubagentActivity = (subagentRunMap?.size || 0) > 0
  const hasHostActivity = hostSteps.length > 0
  const desktopResultModel = useMemo(() => buildDesktopResultModel(hostSteps), [hostSteps])
  const desktopPreviewAttachment = useMemo<ImageAttachment | null>(() => {
    const screenshot = desktopResultModel?.screenshot
    if (!screenshot?.previewImageData || !screenshot.mimeType?.startsWith('image/')) {
      return null
    }

    const imageName = screenshot.path
      ? screenshot.path.replace(/\\/g, '/').split('/').pop() || screenshot.path
      : t('Desktop screenshot')

    const attachment: ImageAttachment = {
      id: `desktop-preview-${hostSteps[hostSteps.length - 1]?.stepId || 'latest'}`,
      type: 'image',
      mediaType: screenshot.mimeType as ImageAttachment['mediaType'],
      data: screenshot.previewImageData,
      name: imageName
    }

    return attachment
  }, [desktopResultModel, hostSteps, t])

  useEffect(() => {
    let cancelled = false

    async function loadInlineImages(): Promise<void> {
      const nextMap: Record<string, ImageAttachment[]> = {}

      for (const message of displayMessages) {
        if (message.role !== 'assistant' || !message.content) continue

        const paths = extractLocalImagePaths(message.content)
        if (paths.length === 0) continue

        const attachments: ImageAttachment[] = []
        for (const path of paths) {
          try {
            const response = await api.readArtifactContent(path)
            const data = response.data as { content?: string; mimeType?: string; encoding?: string } | undefined
            if (!response.success || !data?.content || data.encoding !== 'base64' || !data.mimeType?.startsWith('image/')) {
              continue
            }

            attachments.push({
              id: `assistant-inline-image:${message.id}:${path}`,
              type: 'image',
              mediaType: data.mimeType as ImageAttachment['mediaType'],
              data: data.content,
              name: getBaseName(path)
            })
          } catch {
            // Ignore unreadable inline image paths and keep rendering text normally.
          }
        }

        if (attachments.length > 0) {
          nextMap[message.id] = attachments
        }
      }

      if (!cancelled) {
        setAssistantInlineImageMap(nextMap)
      }
    }

    void loadInlineImages()

    return () => {
      cancelled = true
    }
  }, [displayMessages])

  const displayMessagesWithHostPreview = useMemo(() => {
    const hasInlineImages = Object.keys(assistantInlineImageMap).length > 0
    if (!desktopPreviewAttachment && !hasInlineImages) {
      return displayMessages
    }

    const nextMessages = [...displayMessages]
    let touched = false

    for (let index = displayMessages.length - 1; index >= 0; index -= 1) {
      const message = displayMessages[index]
      if (message.role !== 'assistant') continue

      const currentAttachments = message.attachments && message.attachments.length > 0
        ? message.attachments
        : message.images || []
      const inlineAttachments = assistantInlineImageMap[message.id] || []

      const mergedAttachments = [...currentAttachments]
      const maybeAppend = (attachment: ImageAttachment | undefined) => {
        if (!attachment) return
        const exists = mergedAttachments.some((current) => (
          current.type === 'image'
          && current.name === attachment.name
        ))
        if (!exists) {
          mergedAttachments.unshift(attachment)
        }
      }

      for (const inlineAttachment of inlineAttachments) {
        maybeAppend(inlineAttachment)
      }

      if (index === displayMessages.length - 1) {
        maybeAppend(desktopPreviewAttachment || undefined)
      }

      if (mergedAttachments.length !== currentAttachments.length) {
        nextMessages[index] = {
          ...message,
          attachments: mergedAttachments
        }
        touched = true
      }
    }

    return touched ? nextMessages : displayMessages
  }, [assistantInlineImageMap, desktopPreviewAttachment, displayMessages])

  return (
    <div className={`
      space-y-2 transition-[max-width] duration-300 ease-out
      ${isCompact ? 'max-w-full' : 'max-w-3xl mx-auto'}
    `}>
      {/* Render completed messages - thoughts shown above assistant messages */}
      {displayMessagesWithHostPreview.map((message) => {
        // Show collapsed thoughts ABOVE assistant messages
        if (message.role === 'assistant' && message.thoughts && message.thoughts.length > 0) {
          return (
            <div key={message.id}>
              <CollapsedThoughtProcess thoughts={message.thoughts} />
              <MessageItem message={message} hideThoughts isInContainer />
            </div>
          )
        }
        return <MessageItem key={message.id} message={message} />
      })}

      {/* Current generation block: Linear Stream (Claude Code style) */}
      {(isGenerating || hasSubagentActivity || hasHostActivity) && (
        <div className="animate-fade-in">
          {/* Real-time browser task card */}
          {isGenerating && streamingBrowserToolCalls.length > 0 && (
            <div className="mb-4">
              <BrowserTaskCard
                browserToolCalls={streamingBrowserToolCalls}
                isActive={isThinking}
              />
            </div>
          )}

          {hasHostActivity && (
            <div className="mb-4 space-y-3">
              <DesktopResultCard steps={hostSteps} />
              {hostStatus && <HostStatusBanner status={hostStatus} steps={hostSteps} />}
              <HostActivityCard
                steps={hostSteps}
                isCollapsed={activityCollapsed}
                onToggle={onToggleActivity || (() => {})}
              />
            </div>
          )}

          {(isGenerating || hasSubagentActivity) && (
            <LinearStream
              thoughts={thoughts}
              streamingContent={streamingContent}
              textSegments={textSegments}
              lastSegmentIndex={lastSegmentIndex}
              isStreaming={isStreaming}
              isThinking={isThinking}
              sdkStatus={sdkStatus}
              taskProgressMap={taskProgressMap}
              subagentRunMap={subagentRunMap}
              onViewSubagentDetails={onViewSubagentDetails}
              onKillSubagent={onKillSubagent}
            />
          )}
        </div>
      )}

      {/* Error message */}
      {!isGenerating && error && (
        <div className="animate-fade-in py-1 px-3 flex items-start gap-2.5">
          <span className="text-destructive/70 text-base flex-shrink-0">✗</span>
          <div>
            <span className="text-sm font-medium text-destructive">{t('Something went wrong')}</span>
            <p className="mt-1 text-sm text-destructive/80">{error}</p>
          </div>
        </div>
      )}

      {/* Compact notice */}
      {compactInfo && (
        <CompactNotice trigger={compactInfo.trigger} preTokens={compactInfo.preTokens} />
      )}
    </div>
  )
}
