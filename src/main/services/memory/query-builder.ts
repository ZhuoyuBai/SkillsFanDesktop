/**
 * Memory Query Builder - Keyword extraction for LIKE-based search
 *
 * Extracts meaningful keywords from user messages for substring matching.
 * Supports both English words and Chinese bigram sliding window.
 */

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'this', 'that', 'with',
  'from', 'have', 'will', 'how', 'use', 'please', 'help', 'want', 'need',
  'can', 'what', 'when', 'where', 'which', 'who', 'why', 'does', 'did',
  'was', 'were', 'been', 'being', 'has', 'had', 'would', 'could', 'should',
  'may', 'might', 'shall', 'must', 'its', 'let', 'get', 'got', 'just',
  'also', 'than', 'then', 'now', 'here', 'there', 'about', 'into', 'more',
  'some', 'any', 'each', 'every', 'all', 'most', 'other', 'only', 'very',
  'too', 'out', 'over', 'such', 'own', 'same'
])

/**
 * Chinese function words / particles.
 * Bigrams where BOTH characters are in this set are filtered out.
 */
const CHINESE_STOP_CHARS = new Set([
  '我', '你', '他', '她', '它', '们', '的', '了', '着', '过',
  '是', '在', '和', '与', '或', '但', '这', '那', '吗', '呢',
  '吧', '啊', '么', '什', '一', '个', '不', '也', '就', '都',
  '来', '去', '会', '能', '要', '把', '被', '给', '让', '从'
])

/**
 * Extract meaningful keywords for LIKE-based search.
 *
 * English: extract words (skip stop words, min 3 chars)
 * Chinese: 2-char bigram sliding window, filter stop-only pairs
 */
export function extractSearchKeywords(text: string): string[] {
  const keywords: string[] = []

  // English: extract words (skip stop words, min 3 chars)
  const englishWords = text.match(/[a-zA-Z_][a-zA-Z0-9_]{2,}/g) || []
  for (const word of englishWords) {
    if (!STOP_WORDS.has(word.toLowerCase())) {
      keywords.push(word.toLowerCase())
    }
  }

  // Chinese: bigram sliding window
  const chineseSegments = text.match(/[\u4e00-\u9fff]{2,}/g) || []
  for (const segment of chineseSegments) {
    if (segment.length <= 4) {
      // Short segments: use as-is (e.g. "项目", "脚本")
      keywords.push(segment)
    } else {
      // Long segments: generate 2-char bigrams, filter stop-only pairs
      for (let i = 0; i < segment.length - 1; i++) {
        const bigram = segment.slice(i, i + 2)
        // Keep bigram if at least one char is NOT a stop word
        if (!CHINESE_STOP_CHARS.has(bigram[0]) || !CHINESE_STOP_CHARS.has(bigram[1])) {
          keywords.push(bigram)
        }
      }
    }
  }

  // Deduplicate and limit
  return Array.from(new Set(keywords)).slice(0, 15)
}
