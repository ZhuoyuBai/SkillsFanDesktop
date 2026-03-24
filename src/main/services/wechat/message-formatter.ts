/**
 * WeChat Message Formatter
 *
 * Converts Markdown text to plain text suitable for WeChat personal messages.
 * WeChat personal messages don't support rich text formatting, so we strip
 * Markdown syntax while preserving readability.
 */

/** WeChat text message size limit in bytes */
const MAX_MESSAGE_BYTES = 4096

/**
 * Convert Markdown to plain text for WeChat.
 * Strips formatting syntax while keeping content readable.
 */
export function markdownToPlainText(markdown: string): string {
  let text = markdown

  // Remove code block markers but keep content
  text = text.replace(/```[\w]*\n?/g, '')

  // Bold: **text** or __text__ → text
  text = text.replace(/\*\*(.+?)\*\*/g, '$1')
  text = text.replace(/__(.+?)__/g, '$1')

  // Italic: *text* or _text_ → text
  text = text.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1')

  // Inline code: `code` → code
  text = text.replace(/`([^`]+)`/g, '$1')

  // Links: [text](url) → text (url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')

  // Images: ![alt](url) → [Image: alt]
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '[Image: $1]')

  // Headings: # text → text
  text = text.replace(/^#{1,6}\s+/gm, '')

  // Horizontal rules
  text = text.replace(/^---+$/gm, '────────')

  // Blockquotes: > text → text
  text = text.replace(/^>\s?/gm, '│ ')

  // Lists: - item or * item → • item
  text = text.replace(/^[\s]*[-*]\s+/gm, '• ')

  // Numbered lists: keep as-is

  // Collapse multiple blank lines into one
  text = text.replace(/\n{3,}/g, '\n\n')

  return text.trim()
}

/**
 * Split a long message into chunks that fit within WeChat's size limit.
 * Tries to split at paragraph boundaries.
 */
export function chunkMessage(text: string): string[] {
  const encoded = Buffer.byteLength(text, 'utf-8')
  if (encoded <= MAX_MESSAGE_BYTES) {
    return [text]
  }

  const chunks: string[] = []
  const paragraphs = text.split('\n\n')
  let currentChunk = ''

  for (const paragraph of paragraphs) {
    const candidate = currentChunk ? currentChunk + '\n\n' + paragraph : paragraph
    if (Buffer.byteLength(candidate, 'utf-8') > MAX_MESSAGE_BYTES) {
      if (currentChunk) {
        chunks.push(currentChunk)
        currentChunk = paragraph
      } else {
        // Single paragraph exceeds limit, force split by lines
        const lines = paragraph.split('\n')
        for (const line of lines) {
          const lineCandidate = currentChunk ? currentChunk + '\n' + line : line
          if (Buffer.byteLength(lineCandidate, 'utf-8') > MAX_MESSAGE_BYTES) {
            if (currentChunk) chunks.push(currentChunk)
            currentChunk = line
          } else {
            currentChunk = lineCandidate
          }
        }
      }
    } else {
      currentChunk = candidate
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk)
  }

  return chunks
}
