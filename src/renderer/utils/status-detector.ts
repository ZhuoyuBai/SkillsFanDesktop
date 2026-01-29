/**
 * Status Detector - Heuristic detection for status-like text
 * Used to identify text that represents task progress updates
 * and associate them with the current in-progress task
 */

export interface StatusDetectionResult {
  isStatus: boolean
  text: string
  confidence: 'high' | 'medium' | 'low'
}

/**
 * Detect if text looks like a status/progress update
 * Status updates are typically short transitional phrases
 * like "Now let me...", "接下来...", etc.
 */
export function detectStatusUpdate(text: string): StatusDetectionResult {
  const trimmed = text.trim()

  // Empty or too long - not a status update
  if (!trimmed || trimmed.length > 150) {
    return { isStatus: false, text: '', confidence: 'high' }
  }

  // High confidence patterns - English
  const highConfidenceEnglish = [
    /^Now\s+(let me|I'll|I will|I'm going to)/i,
    /^(Let me|I'll|I will|I'm going to)\s+/i,
    /^(First|Next|Then|Finally|After that),?\s+/i,
    /^(Starting|Beginning|Checking|Reading|Writing|Creating|Updating)\s+/i,
  ]

  // High confidence patterns - Chinese
  const highConfidenceChinese = [
    /^(现在|接下来|首先|然后|最后|之后)/,
    /^(让我|我来|我会|我将|我要|我先)/,
    /^(开始|正在|准备|检查|读取|写入|创建|更新)/,
  ]

  // Medium confidence patterns
  const mediumConfidencePatterns = [
    /\.{3}$/, // Ends with ...
    /…$/,     // Ends with ellipsis
    /^(I need to|We need to|Let's)\s+/i,
    /^(需要|我们|一起)/,
  ]

  // Check high confidence patterns
  for (const pattern of [...highConfidenceEnglish, ...highConfidenceChinese]) {
    if (pattern.test(trimmed)) {
      return { isStatus: true, text: trimmed, confidence: 'high' }
    }
  }

  // Check medium confidence patterns
  for (const pattern of mediumConfidencePatterns) {
    if (pattern.test(trimmed)) {
      return { isStatus: true, text: trimmed, confidence: 'medium' }
    }
  }

  // Very short text (under 50 chars) that doesn't end with punctuation
  // might be a status update (low confidence)
  if (trimmed.length < 50 && !/[.!?。！？]$/.test(trimmed)) {
    return { isStatus: true, text: trimmed, confidence: 'low' }
  }

  return { isStatus: false, text: '', confidence: 'high' }
}

/**
 * Extract new text from cumulative content
 * Used to get the delta between previous and current streaming content
 */
export function extractNewText(currentContent: string, previousLength: number): string {
  if (currentContent.length <= previousLength) {
    return ''
  }
  return currentContent.slice(previousLength)
}
