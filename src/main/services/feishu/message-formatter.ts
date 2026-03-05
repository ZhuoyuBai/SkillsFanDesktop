/**
 * Feishu Message Formatter
 *
 * Converts Markdown text to Feishu post (rich text) format and handles
 * message chunking within the 30KB card/post size limit.
 */

const MAX_POST_SIZE_BYTES = 28000 // Leave room for envelope (~30KB limit)

/**
 * Convert Markdown text to Feishu post format (zh_cn).
 * Returns a Feishu post content object ready for sending.
 */
export function markdownToPost(markdown: string, title?: string): Record<string, unknown> {
  const lines = markdown.split('\n')
  const content: unknown[][] = []
  let currentParagraph: unknown[] = []
  let inCodeBlock = false
  let codeBlockContent = ''
  let codeBlockLang = ''

  for (const line of lines) {
    // Code block start/end
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        // End code block - emit as code_block tag
        currentParagraph.push({
          tag: 'code_block',
          language: codeBlockLang || 'plain_text',
          text: codeBlockContent
        })
        content.push(currentParagraph)
        currentParagraph = []
        inCodeBlock = false
        codeBlockContent = ''
        codeBlockLang = ''
      } else {
        // Start code block
        if (currentParagraph.length > 0) {
          content.push(currentParagraph)
          currentParagraph = []
        }
        inCodeBlock = true
        codeBlockLang = line.slice(3).trim()
      }
      continue
    }

    if (inCodeBlock) {
      codeBlockContent += (codeBlockContent ? '\n' : '') + line
      continue
    }

    // Empty line = paragraph break
    if (line.trim() === '') {
      if (currentParagraph.length > 0) {
        content.push(currentParagraph)
        currentParagraph = []
      }
      continue
    }

    // Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/)
    if (headingMatch) {
      if (currentParagraph.length > 0) {
        content.push(currentParagraph)
        currentParagraph = []
      }
      content.push([{ tag: 'text', text: headingMatch[2], style: ['bold'] }])
      continue
    }

    // Regular text - parse inline formatting
    const inlineElements = parseInlineFormatting(line)
    if (currentParagraph.length > 0) {
      currentParagraph.push({ tag: 'text', text: '\n' })
    }
    currentParagraph.push(...inlineElements)
  }

  // Flush remaining
  if (inCodeBlock && codeBlockContent) {
    currentParagraph.push({
      tag: 'code_block',
      language: codeBlockLang || 'plain_text',
      text: codeBlockContent
    })
  }
  if (currentParagraph.length > 0) {
    content.push(currentParagraph)
  }

  return {
    zh_cn: {
      title: title || '',
      content
    }
  }
}

/**
 * Parse inline Markdown formatting into Feishu tags.
 */
function parseInlineFormatting(text: string): unknown[] {
  const elements: unknown[] = []
  // Simple approach: handle **bold**, *italic*, `code`, [link](url)
  let remaining = text

  while (remaining.length > 0) {
    // Inline code
    const codeMatch = remaining.match(/^`([^`]+)`/)
    if (codeMatch) {
      elements.push({ tag: 'text', text: codeMatch[1], style: ['code'] })
      remaining = remaining.slice(codeMatch[0].length)
      continue
    }

    // Bold
    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/)
    if (boldMatch) {
      elements.push({ tag: 'text', text: boldMatch[1], style: ['bold'] })
      remaining = remaining.slice(boldMatch[0].length)
      continue
    }

    // Link
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/)
    if (linkMatch) {
      elements.push({ tag: 'a', text: linkMatch[1], href: linkMatch[2] })
      remaining = remaining.slice(linkMatch[0].length)
      continue
    }

    // Plain text up to next special char
    const nextSpecial = remaining.search(/[`*[]/)
    if (nextSpecial > 0) {
      elements.push({ tag: 'text', text: remaining.slice(0, nextSpecial) })
      remaining = remaining.slice(nextSpecial)
    } else if (nextSpecial === 0) {
      // Single special char that didn't match any pattern
      elements.push({ tag: 'text', text: remaining[0] })
      remaining = remaining.slice(1)
    } else {
      // No more special chars
      elements.push({ tag: 'text', text: remaining })
      remaining = ''
    }
  }

  return elements
}

/**
 * Split a long message into chunks that fit within Feishu's size limit.
 * Tries to split at paragraph boundaries and avoids breaking code blocks.
 */
export function chunkMessage(text: string): string[] {
  const encoded = Buffer.byteLength(text, 'utf-8')
  if (encoded <= MAX_POST_SIZE_BYTES) {
    return [text]
  }

  const chunks: string[] = []
  const paragraphs = text.split('\n\n')
  let currentChunk = ''

  for (const paragraph of paragraphs) {
    const candidate = currentChunk ? currentChunk + '\n\n' + paragraph : paragraph
    if (Buffer.byteLength(candidate, 'utf-8') > MAX_POST_SIZE_BYTES) {
      if (currentChunk) {
        chunks.push(currentChunk)
        currentChunk = paragraph
      } else {
        // Single paragraph exceeds limit, force split by lines
        const lines = paragraph.split('\n')
        for (const line of lines) {
          const lineCandidate = currentChunk ? currentChunk + '\n' + line : line
          if (Buffer.byteLength(lineCandidate, 'utf-8') > MAX_POST_SIZE_BYTES) {
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
