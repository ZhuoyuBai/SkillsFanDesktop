import { useState } from 'react'
import { Activity, CheckCircle2, Cpu, Eye, ExternalLink, File, FileImage, FileText, Globe2, Monitor } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { api } from '../../api'
import { useCanvasStore } from '../../stores/canvas.store'
import { ImageViewer } from '../chat/ImageViewer'
import type { HostStep, ImageAttachment } from '../../types'
import { CollapsibleSection } from '../ui/CollapsibleSection'

interface HostActivityCardProps {
  steps: HostStep[]
  isCollapsed: boolean
  onToggle: () => void
}

const ACTION_LABEL_KEYS: Record<string, string> = {
  browser_list_pages: 'List pages',
  browser_select_page: 'Switch page',
  browser_new_page: 'Open page',
  browser_close_page: 'Close page',
  browser_navigate: 'Navigate page',
  browser_wait_for: 'Wait for content',
  browser_click: 'Click element',
  browser_hover: 'Hover element',
  browser_fill: 'Fill field',
  browser_fill_form: 'Fill form',
  browser_drag: 'Drag element',
  browser_press_key: 'Press key',
  browser_upload_file: 'Upload file',
  browser_handle_dialog: 'Handle dialog',
  browser_snapshot: 'Read page structure',
  browser_screenshot: 'Take page screenshot',
  browser_evaluate: 'Run page script',
  browser_network_requests: 'Inspect network',
  browser_network_request: 'Read network request',
  browser_console: 'Inspect console',
  browser_console_message: 'Read console message',
  browser_emulate: 'Change browser environment',
  browser_resize: 'Resize browser',
  browser_perf_start: 'Start performance trace',
  browser_perf_stop: 'Stop performance trace',
  browser_perf_insight: 'Read performance insight',
  open_application: 'Open app',
  run_applescript: 'Run desktop script',
  desktop_screenshot: 'Take desktop screenshot',
  desktop_ui_tree: 'Read desktop elements'
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function getStringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function truncate(value: string, maxLength = 96): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
}

function humanizeAction(action: string): string {
  return action
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatRelativeTime(timestamp: number, t: (key: string, options?: any) => string): string {
  const diffMs = Date.now() - timestamp
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return t('Just now')
  if (diffMins < 60) return t('{{count}} minutes ago', { count: diffMins })
  if (diffHours < 24) return t('{{count}} hours ago', { count: diffHours })
  if (diffDays < 7) return t('{{count}} days ago', { count: diffDays })

  return new Date(timestamp).toLocaleString()
}

function getArtifactLabel(kind: string, t: (key: string) => string): string {
  switch (kind) {
    case 'screenshot':
      return t('Screenshot')
    case 'snapshot':
      return t('Snapshot')
    case 'log':
      return t('Log')
    default:
      return t('File')
  }
}

function getBaseName(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/')
  return parts[parts.length - 1] || path
}

function getStepTitle(step: HostStep, t: (key: string) => string): string {
  const labelKey = ACTION_LABEL_KEYS[step.action]
  return labelKey ? t(labelKey) : humanizeAction(step.action)
}

function isInlineImageArtifact(artifact: NonNullable<HostStep['artifacts']>[number]): boolean {
  return Boolean(artifact.previewImageData && artifact.mimeType?.startsWith('image/'))
}

function getStepDetail(step: HostStep): string | undefined {
  const metadata = getRecord(step.metadata)
  const args = getRecord(metadata?.args)
  const artifactPath = step.artifacts?.find((artifact) => getStringValue(artifact.path))?.path

  switch (step.action) {
    case 'open_application': {
      const application = getStringValue(metadata?.application)
      const target = getStringValue(metadata?.target)
      return [application, target].filter(Boolean).join(' · ') || step.summary
    }
    case 'browser_new_page':
    case 'browser_navigate':
      return getStringValue(args?.url) || getStringValue(metadata?.url) || step.summary
    case 'browser_wait_for':
      return getStringValue(args?.text) || step.summary
    case 'browser_click':
    case 'browser_hover':
    case 'browser_fill':
    case 'browser_fill_form':
    case 'browser_drag':
      return getStringValue(args?.uid)
        || getStringValue(args?.from_uid)
        || getStringValue(args?.to_uid)
        || step.summary
    case 'browser_press_key':
      return getStringValue(args?.key) || step.summary
    case 'browser_snapshot':
    case 'browser_screenshot':
      return getStringValue(metadata?.url)
        || (artifactPath ? getBaseName(artifactPath) : undefined)
        || step.summary
    case 'desktop_screenshot':
    case 'desktop_ui_tree':
      return artifactPath ? getBaseName(artifactPath) : step.summary
    default:
      return step.summary
  }
}

function getStepIcon(step: HostStep) {
  switch (step.category) {
    case 'browser':
      return Globe2
    case 'desktop':
      return Monitor
    case 'perception':
      return Eye
    default:
      return Cpu
  }
}

function getStepIconClasses(step: HostStep, isError: boolean): string {
  if (isError) {
    return 'bg-destructive/10 text-destructive'
  }

  switch (step.category) {
    case 'browser':
      return 'bg-sky-500/10 text-sky-600'
    case 'desktop':
      return 'bg-emerald-500/10 text-emerald-600'
    case 'perception':
      return 'bg-amber-500/10 text-amber-600'
    default:
      return 'bg-primary/10 text-primary'
  }
}

export function HostActivityCard({ steps, isCollapsed, onToggle }: HostActivityCardProps) {
  const { t } = useTranslation()
  const openFile = useCanvasStore((state) => state.openFile)
  const openContent = useCanvasStore((state) => state.openContent)
  const [selectedImages, setSelectedImages] = useState<ImageAttachment[] | null>(null)

  function getArtifactDisplayLabel(artifact: NonNullable<HostStep['artifacts']>[number]): string {
    return artifact.path
      ? `${getArtifactLabel(artifact.kind, t)} · ${getBaseName(artifact.path)}`
      : getArtifactLabel(artifact.kind, t)
  }

  async function handlePreviewArtifact(step: HostStep, artifact: NonNullable<HostStep['artifacts']>[number]): Promise<void> {
    const title = artifact.path
      ? getBaseName(artifact.path)
      : `${getStepTitle(step, t)}.${artifact.kind === 'screenshot' ? 'png' : 'txt'}`

    if (artifact.previewImageData && artifact.mimeType) {
      setSelectedImages([{
        id: `${step.stepId}-${artifact.kind}`,
        type: 'image',
        mediaType: artifact.mimeType as ImageAttachment['mediaType'],
        data: artifact.previewImageData,
        name: title
      }])
      return
    }

    if (artifact.path) {
      await openFile(artifact.path, title)
      return
    }

    if (artifact.previewText) {
      await openContent(artifact.previewText, title, 'text')
    }
  }

  return (
    <>
      <CollapsibleSection
        title={t('Agent activity')}
        icon={Activity}
        isCollapsed={isCollapsed}
        onToggle={onToggle}
        badge={(
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            {steps.length}
          </span>
        )}
        className="border-border/60 bg-card/70"
      >
        <div className="max-h-[420px] overflow-y-auto px-3 py-3">
          <div className="space-y-2">
            {steps.map((step) => {
              const isError = step.metadata?.isError === true
              const Icon = getStepIcon(step)
              const detail = getStepDetail(step)
              const previewArtifact = step.artifacts?.find((artifact) => isInlineImageArtifact(artifact))
                || step.artifacts?.find((artifact) => Boolean(artifact.previewText))
                || step.artifacts?.find((artifact) => Boolean(artifact.path))

              return (
                <div
                  key={step.stepId}
                  className={`
                    rounded-xl border px-3 py-3 transition-colors
                    ${isError ? 'border-destructive/20 bg-destructive/5' : 'border-border/40 bg-background/70'}
                  `}
                >
                  <div className="flex items-start gap-3">
                    <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${getStepIconClasses(step, isError)}`}>
                      <Icon size={16} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {getStepTitle(step, t)}
                            </span>
                            {isError ? (
                              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                                {t('Failed')}
                              </span>
                            ) : (
                              <CheckCircle2 size={14} className="text-emerald-500" />
                            )}
                          </div>
                          {detail && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {truncate(detail)}
                            </p>
                          )}
                        </div>

                        <span className="flex-shrink-0 text-[11px] text-muted-foreground">
                          {formatRelativeTime(step.timestamp, t)}
                        </span>
                      </div>

                      {previewArtifact && (
                        <div className="mt-3 rounded-lg border border-border/40 bg-card/70 p-2.5">
                          {isInlineImageArtifact(previewArtifact) ? (
                            <button
                              type="button"
                              onClick={() => { void handlePreviewArtifact(step, previewArtifact) }}
                              className="group block w-full text-left"
                            >
                              <div className="overflow-hidden rounded-md border border-border/40 bg-muted/20 p-2">
                                <img
                                  src={`data:${previewArtifact.mimeType};base64,${previewArtifact.previewImageData}`}
                                  alt={getArtifactDisplayLabel(previewArtifact)}
                                  className="max-h-[26rem] w-full rounded-md object-contain transition-transform duration-200 group-hover:scale-[1.005]"
                                />
                              </div>
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <span className="text-xs text-muted-foreground">
                                  {getArtifactDisplayLabel(previewArtifact)}
                                </span>
                                <span className="text-xs font-medium text-primary">{t('View')}</span>
                              </div>
                            </button>
                          ) : previewArtifact.previewText ? (
                            <button
                              type="button"
                              onClick={() => { void handlePreviewArtifact(step, previewArtifact) }}
                              className="block w-full text-left"
                            >
                              <div className="rounded-md border border-border/30 bg-background/70 p-2 font-mono text-[11px] leading-5 text-muted-foreground">
                                <div className="max-h-28 overflow-hidden whitespace-pre-wrap">
                                  {previewArtifact.previewText}
                                </div>
                              </div>
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <span className="text-xs text-muted-foreground">
                                  {getArtifactDisplayLabel(previewArtifact)}
                                </span>
                                <span className="text-xs font-medium text-primary">{t('View')}</span>
                              </div>
                            </button>
                          ) : previewArtifact.path ? (
                            <div className="flex items-center justify-between gap-3 rounded-md border border-border/30 bg-background/70 px-3 py-2">
                              <span className="min-w-0 truncate text-xs text-muted-foreground">
                                {getArtifactDisplayLabel(previewArtifact)}
                              </span>
                              <button
                                type="button"
                                onClick={() => { void handlePreviewArtifact(step, previewArtifact) }}
                                className="text-xs font-medium text-primary"
                              >
                                {t('View')}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      )}

                      {step.artifacts && step.artifacts.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {step.artifacts.map((artifact, index) => {
                            const label = getArtifactDisplayLabel(artifact)

                            if (artifact.path) {
                              return (
                                <button
                                  key={`${step.stepId}-artifact-${index}`}
                                  type="button"
                                  onClick={() => { void api.openArtifact(artifact.path!) }}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-background px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                                >
                                  <ExternalLink size={12} />
                                  <span>{label}</span>
                                </button>
                              )
                            }

                            const ArtifactIcon = artifact.kind === 'screenshot'
                              ? FileImage
                              : artifact.kind === 'snapshot' || artifact.kind === 'log'
                                ? FileText
                                : File

                            return (
                              <span
                                key={`${step.stepId}-artifact-${index}`}
                                className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-secondary/30 px-2.5 py-1 text-[11px] text-muted-foreground"
                              >
                                <ArtifactIcon size={12} />
                                <span>{label}</span>
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </CollapsibleSection>

      {selectedImages && (
        <ImageViewer
          images={selectedImages}
          onClose={() => setSelectedImages(null)}
        />
      )}
    </>
  )
}
