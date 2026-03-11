import type { HostStep } from '../../types'

export interface DesktopResultField {
  label: string
  value: string
}

export interface DesktopResultElement {
  level: number
  role: string
  name?: string
  details?: string
}

export interface DesktopResultModel {
  screenshot?: NonNullable<HostStep['artifacts']>[number]
  fields: DesktopResultField[]
  elements: DesktopResultElement[]
  bulletItems: string[]
  rawText?: string
}

function isDesktopStep(step: HostStep): boolean {
  return step.category === 'desktop'
    || step.action === 'run_applescript'
    || step.action.startsWith('desktop_')
    || (step.category === 'perception' && step.action.startsWith('desktop_'))
}

function cleanDesktopText(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)

  const filtered = lines.filter((line) => {
    const trimmed = line.trim()
    if (/^applescript completed:?$/i.test(trimmed)) {
      return false
    }

    return !(
      /^(saved screenshot to|screenshot saved to)/i.test(trimmed)
      || /^(截图已保存到|截图已保存至|畫面已儲存至|截圖已保存到|截圖已儲存至)/.test(trimmed)
    )
  })

  return filtered.join('\n').trim()
}

function scoreTextCandidate(step: HostStep, text: string): number {
  let score = Math.min(text.length, 400)

  if (step.action === 'desktop_ui_tree') score += 300
  if (step.action === 'run_applescript') score += 120
  if (/^application[:：]/im.test(text)) score += 120
  if (/^window[:：]/im.test(text)) score += 80
  if (/role=/i.test(text)) score += 120
  if (text.split(/\r?\n/).length >= 4) score += 60

  return score
}

function pickBestText(steps: HostStep[]): string | undefined {
  const candidates: Array<{ text: string; score: number }> = []

  for (const step of steps) {
    for (const artifact of step.artifacts || []) {
      if (!artifact.previewText) continue

      const cleaned = cleanDesktopText(artifact.previewText)
      if (!cleaned) continue

      candidates.push({
        text: cleaned,
        score: scoreTextCandidate(step, cleaned)
      })
    }
  }

  candidates.sort((left, right) => right.score - left.score)
  return candidates[0]?.text
}

function parseFields(lines: string[]): DesktopResultField[] {
  const fields: DesktopResultField[] = []
  const seen = new Set<string>()

  for (const line of lines) {
    const match = line.match(/^([A-Za-z\u4e00-\u9fff][^:：]{0,36})[:：]\s*(.+)$/)
    if (!match) continue

    const label = match[1].trim()
    const value = match[2].trim()
    const key = `${label}:${value}`
    if (!value || seen.has(key)) continue

    seen.add(key)
    fields.push({ label, value })
  }

  return fields.slice(0, 8)
}

function parseElements(lines: string[]): DesktopResultElement[] {
  const elements: DesktopResultElement[] = []

  for (const line of lines) {
    const match = line.match(/^(\s*)-\s+(.+)$/)
    if (!match) continue

    const payload = match[2].trim()
    if (!payload.includes('role=')) continue

    const attributes = Object.fromEntries(
      payload
        .split(/,\s*/)
        .map((segment) => {
          const separatorIndex = segment.indexOf('=')
          if (separatorIndex === -1) return null

          const key = segment.slice(0, separatorIndex).trim()
          const value = segment.slice(separatorIndex + 1).trim()
          return key ? [key, value] : null
        })
        .filter((entry): entry is [string, string] => Array.isArray(entry))
    )

    if (!attributes.role) continue

    const details = [
      attributes.value ? `value: ${attributes.value}` : null,
      attributes.description ? `description: ${attributes.description}` : null,
      attributes.children ? `children: ${attributes.children}` : null
    ].filter((item): item is string => Boolean(item)).join(' · ')

    elements.push({
      level: Math.floor(match[1].length / 2),
      role: attributes.role,
      name: attributes.name || undefined,
      details: details || undefined
    })
  }

  return elements.slice(0, 12)
}

function parseBullets(lines: string[]): string[] {
  const bullets = lines
    .map((line) => {
      const text = line.match(/^[•·*-]\s+(.+)$/)?.[1]?.trim()
      return text && !text.includes('role=') ? text : undefined
    })
    .filter((item): item is string => Boolean(item))

  return bullets.slice(0, 8)
}

export function buildDesktopResultModel(steps: HostStep[]): DesktopResultModel | null {
  const desktopSteps = steps.filter(isDesktopStep)
  if (desktopSteps.length === 0) {
    return null
  }

  const screenshot = [...desktopSteps]
    .reverse()
    .flatMap((step) => step.artifacts || [])
    .find((artifact) => artifact.kind === 'screenshot' && Boolean(artifact.previewImageData || artifact.path))

  const bestText = pickBestText([...desktopSteps].reverse())
  const lines = bestText ? bestText.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean) : []
  const fields = parseFields(lines)
  const elements = parseElements(lines)
  const bulletItems = parseBullets(lines)

  const rawText = bestText && fields.length === 0 && elements.length === 0 && bulletItems.length === 0
    ? bestText
    : undefined

  if (!screenshot && !bestText) {
    return null
  }

  return {
    screenshot,
    fields,
    elements,
    bulletItems,
    rawText
  }
}
