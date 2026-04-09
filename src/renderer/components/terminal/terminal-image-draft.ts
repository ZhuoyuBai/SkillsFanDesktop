export interface TerminalDraftImage {
  id: string
  token: string
  filePath: string
  name: string
  size: number
  mediaType: string
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function quoteFilePath(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`
}

function buildWhitespaceTolerantPattern(value: string): string {
  return Array.from(value)
    .map((char) => escapeRegExp(char))
    .join('[\\s\\r\\n]*')
}

function getMaskableFilePathVariants(filePath: string): string[] {
  const variants = [
    quoteFilePath(filePath),
    filePath,
  ]

  const dotSkillsfanDevIndex = filePath.indexOf('/.skillsfan-dev/')
  if (dotSkillsfanDevIndex >= 0) {
    variants.push(filePath.slice(dotSkillsfanDevIndex + 1))
  }

  const dotSkillsfanProdIndex = filePath.indexOf('/.skillsfan/')
  if (dotSkillsfanProdIndex >= 0 && !filePath.includes('/.skillsfan-dev/')) {
    variants.push(filePath.slice(dotSkillsfanProdIndex + 1))
  }

  const tempIndex = filePath.indexOf('/temp/')
  if (tempIndex >= 0) {
    variants.push(filePath.slice(tempIndex + 1))
  }

  return Array.from(new Set(variants)).sort((left, right) => right.length - left.length)
}

function buildImageSequencePattern(images: TerminalDraftImage[]): string {
  return images.length > 0
    ? images.map((image) => {
      const variants = [
        image.token,
        ...getMaskableFilePathVariants(image.filePath),
      ]
      return `(?:${variants.map((variant) => buildWhitespaceTolerantPattern(variant)).join('|')})`
    }).join('[\\s\\r\\n]*')
    : ''
}

export function createTerminalImageToken(index: number): string {
  return `[Image #${index}]`
}

export function stripTerminalImageTokens(text: string): string {
  return text
    .replace(/\[Image #\d+\]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export function relabelTerminalImages(images: Array<Omit<TerminalDraftImage, 'token'> | TerminalDraftImage>): TerminalDraftImage[] {
  return images.map((image, index) => ({
    ...image,
    token: createTerminalImageToken(index + 1),
  }))
}

export function formatTerminalImagePaths(images: TerminalDraftImage[]): string {
  return images.map((image) => quoteFilePath(image.filePath)).join(' ')
}

// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE_RE = /\x1b\[[?0-9;]*[a-zA-Z]/g

function stripAnsiCodes(text: string): string {
  return text.replace(ANSI_ESCAPE_RE, '')
}

/**
 * Build a mapping from each character index in the ANSI-stripped text back to
 * its original index in the source text. ANSI escape sequences are skipped so
 * they don't appear in the stripped text, but the map lets us translate a range
 * in the stripped text back to the corresponding range in the original.
 */
function buildStrippedToOriginalMap(text: string): number[] {
  const map: number[] = []
  const re = new RegExp(ANSI_ESCAPE_RE.source, 'g')
  let lastEnd = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    for (let i = lastEnd; i < m.index; i++) {
      map.push(i)
    }
    lastEnd = m.index + m[0].length
  }
  for (let i = lastEnd; i < text.length; i++) {
    map.push(i)
  }
  return map
}

export function maskTerminalImagePathsLightweight(text: string, images: TerminalDraftImage[]): string {
  if (images.length === 0) return text

  // Build filename → token lookup for matching
  const fileNameToToken = new Map<string, string>()
  for (const image of images) {
    const fn = image.filePath.split('/').pop()
    if (fn) fileNameToToken.set(fn, image.token)
  }

  // Quick relevance check on ANSI-stripped text
  const stripped = stripAnsiCodes(text)
  const hasTerminalImagesDir = /terminal-images\//.test(stripped)
  const hasKnownFileName = Array.from(fileNameToToken.keys()).some((fn) => stripped.includes(fn))
  if (!hasTerminalImagesDir && !hasKnownFileName) return text

  // Use position-mapped replacement: match paths on ANSI-stripped text, then
  // map matched ranges back to the original text.  This handles ANSI escape
  // codes within paths AND line-wrapped paths (\r\n at terminal width).
  const posMap = buildStrippedToOriginalMap(text)
  const defaultToken = images[0].token
  const replacements: Array<{ origStart: number; origEnd: number; token: string }> = []

  if (hasTerminalImagesDir) {
    // Match full terminal-images paths (handles quoted paths and line-wrapped paths)
    const pathRegex = /"[^"]*?terminal-images\/[^"]*?"|\S*terminal-images\/(?:\S|\r?\n\s*)*?\.\w{2,5}(?=["'\s\r\n]|$)/g
    let m: RegExpExecArray | null
    while ((m = pathRegex.exec(stripped)) !== null) {
      let token = defaultToken
      for (const [fn, t] of fileNameToToken) {
        if (m[0].includes(fn)) { token = t; break }
      }
      pushMappedReplacement(replacements, posMap, m.index, m.index + m[0].length, token, text.length)
    }
  }

  // Fallback: match standalone filename fragments (for wrapped-path remnants
  // that arrive in a separate PTY data chunk without the terminal-images/ prefix)
  if (replacements.length === 0 && hasKnownFileName) {
    for (const [fileName, token] of fileNameToToken) {
      const fnRegex = new RegExp(`\\S*${escapeRegExp(fileName)}`, 'g')
      let m: RegExpExecArray | null
      while ((m = fnRegex.exec(stripped)) !== null) {
        pushMappedReplacement(replacements, posMap, m.index, m.index + m[0].length, token, text.length)
      }
    }
  }

  // Apply replacements in reverse order to preserve positions
  let result = text
  for (let i = replacements.length - 1; i >= 0; i--) {
    const { origStart, origEnd, token } = replacements[i]
    result = result.slice(0, origStart) + token + result.slice(origEnd)
  }
  return result
}

function pushMappedReplacement(
  replacements: Array<{ origStart: number; origEnd: number; token: string }>,
  posMap: number[],
  sStart: number,
  sEnd: number,
  token: string,
  textLength: number,
): void {
  if (sStart >= posMap.length) return
  const origStart = posMap[sStart]
  const origEnd = sEnd < posMap.length
    ? posMap[sEnd]
    : (posMap.length > 0 ? posMap[posMap.length - 1] + 1 : textLength)
  replacements.push({ origStart, origEnd, token })
}

export function maskTerminalImagePaths(text: string, images: TerminalDraftImage[]): string {
  return images
    .slice()
    .sort((left, right) => right.filePath.length - left.filePath.length)
    .reduce((currentText, image) => {
      return getMaskableFilePathVariants(image.filePath).reduce((nextText, variant) => {
        return nextText.replace(new RegExp(buildWhitespaceTolerantPattern(variant), 'g'), image.token)
      }, currentText)
    }, text)
}

export function rewriteSubmittedTerminalInputEcho(
  text: string,
  visibleInput: string,
  cleanedInput: string,
  images: TerminalDraftImage[],
): { text: string; rewritten: boolean } {
  const escapedCleanedInput = cleanedInput
    ? buildWhitespaceTolerantPattern(cleanedInput)
    : ''
  const imageSequence = buildImageSequencePattern(images)

  let patternBody = ''
  if (escapedCleanedInput && imageSequence) {
    patternBody = `${escapedCleanedInput}[\\s\\r\\n]*${imageSequence}`
  } else if (escapedCleanedInput) {
    patternBody = escapedCleanedInput
  } else if (imageSequence) {
    patternBody = imageSequence
  }

  if (!patternBody) {
    return { text, rewritten: false }
  }

  let rewritten = false
  const withPrompt = new RegExp(`(?:\\r)?([›>])\\s*${patternBody}`, 'g')
  let nextText = text.replace(withPrompt, (_match, prompt: string) => {
    rewritten = true
    return `${prompt} ${visibleInput}`
  })

  if (rewritten) {
    return { text: nextText, rewritten: true }
  }

  const withoutPrompt = new RegExp(patternBody, 'g')
  nextText = nextText.replace(withoutPrompt, () => {
    rewritten = true
    return visibleInput
  })

  return { text: nextText, rewritten }
}

export function rewritePromptOnlySubmittedInputEcho(
  text: string,
  visibleInput: string,
  cleanedInput: string,
): { text: string; rewritten: boolean } {
  if (!cleanedInput) {
    return { text, rewritten: false }
  }

  const cleanedPattern = buildWhitespaceTolerantPattern(cleanedInput)
  let rewritten = false

  const withPrompt = new RegExp(`(?:\\r)?([›>])\\s*${cleanedPattern}`, 'g')
  let nextText = text.replace(withPrompt, (_match, prompt: string) => {
    rewritten = true
    return `${prompt} ${visibleInput}`
  })

  if (rewritten) {
    return { text: nextText, rewritten: true }
  }

  const withoutPrompt = new RegExp(cleanedPattern, 'g')
  nextText = nextText.replace(withoutPrompt, () => {
    rewritten = true
    return visibleInput
  })

  return { text: nextText, rewritten }
}

export function suppressStandaloneSubmittedImageEcho(
  text: string,
  images: TerminalDraftImage[],
): { text: string; suppressed: boolean } {
  const imageSequence = buildImageSequencePattern(images)
  if (!imageSequence) {
    return { text, suppressed: false }
  }

  const wholeChunkPattern = new RegExp(`^[\\s\\r\\n]*(?:${imageSequence})[\\s\\r\\n]*$`)
  if (wholeChunkPattern.test(text)) {
    return { text: '', suppressed: true }
  }

  let suppressed = false
  const linePattern = new RegExp(`(^|\\n)[\\t ]*(?:${imageSequence})[\\t ]*(?=\\n|$)`, 'g')
  const nextText = text.replace(linePattern, (match, prefix: string) => {
    suppressed = true
    return prefix
  })

  return { text: nextText, suppressed }
}
