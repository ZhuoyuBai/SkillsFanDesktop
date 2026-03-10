/**
 * Suggestion Generator - AI-powered follow-up suggestions
 *
 * After an assistant response completes, generates contextual follow-up
 * suggestions using a lightweight model (Haiku). Falls back gracefully
 * to empty array on any failure.
 *
 * Uses the same API call pattern as image-preprocess.ts.
 */

import { getConfig } from '../config.service'
import { getAISourceManager } from '../ai-sources'
import type { AISourcesConfig, BackendRequestConfig, OAuthSourceConfig, CustomSourceConfig } from '../../../shared/types'

// ============================================
// Lightweight Model Discovery
// ============================================

const PREFERRED_LIGHTWEIGHT_MODELS = [
  'claude-haiku-4-5-20251001',
  'claude-3-5-haiku',
  'claude-3-haiku',
]

/**
 * Find a lightweight model for suggestion generation.
 * Priority: skillsfan-credits → custom API → other OAuth providers
 */
function findLightweightModel(): { backendConfig: BackendRequestConfig; model: string } | null {
  const config = getConfig() as any
  const aiSources: AISourcesConfig = config.aiSources || { current: 'custom' }
  const manager = getAISourceManager()

  // Helper to get backend config for a source
  function getBackendConfigForSource(sourceKey: string): BackendRequestConfig | null {
    const provider = manager.getProvider(sourceKey)
    if (provider && provider.isConfigured(aiSources)) {
      return provider.getBackendConfig(aiSources)
    }
    const sourceConfig = aiSources[sourceKey]
    if (sourceConfig && typeof sourceConfig === 'object' && 'apiKey' in sourceConfig && (sourceConfig as any).apiKey) {
      const apiUrl = ((sourceConfig as any).apiUrl || 'https://api.anthropic.com').replace(/\/$/, '')
      return { url: apiUrl, key: (sourceConfig as any).apiKey, model: (sourceConfig as any).model }
    }
    return null
  }

  // Helper to pick the lightest model from available list
  function pickLightModel(models: string[] | undefined, fallbackModel?: string): string {
    if (models && models.length > 0) {
      for (const preferred of PREFERRED_LIGHTWEIGHT_MODELS) {
        const match = models.find(m => m.toLowerCase().includes(preferred.toLowerCase()))
        if (match) return match
      }
      // Any haiku model
      const haiku = models.find(m => m.toLowerCase().includes('haiku'))
      if (haiku) return haiku
    }
    return fallbackModel || 'claude-haiku-4-5-20251001'
  }

  // 1. Try current source first (most likely to work)
  const currentSource = aiSources.current || 'custom'
  const currentBackend = getBackendConfigForSource(currentSource)
  if (currentBackend) {
    const sourceConfig = aiSources[currentSource]
    const availableModels = sourceConfig && typeof sourceConfig === 'object' && 'availableModels' in sourceConfig
      ? (sourceConfig as OAuthSourceConfig).availableModels
      : undefined
    const model = pickLightModel(availableModels, currentBackend.model)
    return { backendConfig: { ...currentBackend, model }, model }
  }

  // 2. Try skillsfan-credits
  const creditsConfig = aiSources['skillsfan-credits'] as OAuthSourceConfig | undefined
  if (creditsConfig?.loggedIn) {
    const backendConfig = getBackendConfigForSource('skillsfan-credits')
    if (backendConfig) {
      const model = pickLightModel(creditsConfig.availableModels)
      return { backendConfig: { ...backendConfig, model }, model }
    }
  }

  // 3. Try custom API
  const customConfig = aiSources.custom as CustomSourceConfig | undefined
  if (customConfig?.apiKey) {
    const backendConfig = getBackendConfigForSource('custom')
    if (backendConfig) {
      return { backendConfig, model: backendConfig.model || 'claude-haiku-4-5-20251001' }
    }
  }

  return null
}

// ============================================
// Suggestion Generation
// ============================================

const SYSTEM_PROMPT = `You generate follow-up suggestions for a conversation between a user and an AI coding assistant.
Based on the conversation context, suggest 2-3 short follow-up messages the user might want to send next.

Rules:
- Each suggestion must be 3-20 words, written from the user's perspective as if they are typing
- Suggestions should be actionable: questions, requests, or commands
- They should be natural continuations of the conversation, not generic
- Match the language of the conversation (if Chinese, write suggestions in Chinese)
- Return ONLY a JSON array of strings, nothing else

Example output: ["Add unit tests for this function", "Explain how the error handling works"]`

/**
 * Generate contextual follow-up suggestions using a lightweight AI model.
 * Returns empty array on any failure (silent degradation).
 */
export async function generateSuggestions(
  userMessage: string,
  assistantContent: string,
  toolsUsed: string[]
): Promise<string[]> {
  try {
    const modelInfo = findLightweightModel()
    if (!modelInfo) {
      console.log('[SuggestionGen] No lightweight model available, skipping')
      return []
    }

    const { backendConfig } = modelInfo
    const apiUrl = backendConfig.url.replace(/\/$/, '')
    const isAnthropic = apiUrl.includes('anthropic') || apiUrl.includes('skillsfan')

    // Build concise context
    const truncatedUser = userMessage.slice(0, 500)
    const truncatedAssistant = assistantContent.slice(0, 1500)
    const toolsInfo = toolsUsed.length > 0 ? `\nTools used: ${toolsUsed.join(', ')}` : ''

    const userPrompt = `User message: ${truncatedUser}\n\nAssistant response: ${truncatedAssistant}${toolsInfo}`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

    try {
      let response: Response

      if (isAnthropic) {
        response = await fetch(`${apiUrl}/v1/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': backendConfig.key,
            'anthropic-version': '2023-06-01',
            ...(backendConfig.headers || {})
          },
          body: JSON.stringify({
            model: backendConfig.model || 'claude-haiku-4-5-20251001',
            max_tokens: 200,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userPrompt }]
          }),
          signal: controller.signal
        })
      } else {
        response = await fetch(`${apiUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${backendConfig.key}`,
            ...(backendConfig.headers || {})
          },
          body: JSON.stringify({
            model: backendConfig.model,
            max_tokens: 200,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: userPrompt }
            ]
          }),
          signal: controller.signal
        })
      }

      if (!response.ok) {
        console.warn(`[SuggestionGen] API error ${response.status}`)
        return []
      }

      const data = await response.json()

      // Extract text from response
      let text: string
      if (isAnthropic) {
        const textBlock = data.content?.find((b: any) => b.type === 'text')
        text = textBlock?.text || ''
      } else {
        text = data.choices?.[0]?.message?.content || ''
      }

      return parseSuggestions(text)
    } finally {
      clearTimeout(timeout)
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.warn('[SuggestionGen] Request timed out')
    } else {
      console.warn('[SuggestionGen] Failed:', error.message)
    }
    return []
  }
}

/**
 * Parse AI response into suggestion strings.
 * Handles JSON arrays, and falls back to line-by-line extraction.
 */
function parseSuggestions(text: string): string[] {
  const trimmed = text.trim()

  // Try JSON parse first
  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) {
      return parsed
        .filter((s): s is string => typeof s === 'string')
        .map(s => s.trim())
        .filter(s => s.length >= 3 && s.length <= 80)
        .slice(0, 3)
    }
  } catch {
    // Not valid JSON, try extraction
  }

  // Try to find JSON array in the text
  const jsonMatch = trimmed.match(/\[[\s\S]*\]/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      if (Array.isArray(parsed)) {
        return parsed
          .filter((s): s is string => typeof s === 'string')
          .map(s => s.trim())
          .filter(s => s.length >= 3 && s.length <= 80)
          .slice(0, 3)
      }
    } catch {
      // ignore
    }
  }

  // Fallback: extract quoted strings
  const quotes = [...trimmed.matchAll(/"([^"]{3,80})"/g)]
  if (quotes.length >= 2) {
    return quotes.map(m => m[1].trim()).slice(0, 3)
  }

  return []
}
