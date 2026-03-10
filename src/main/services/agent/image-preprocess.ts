/**
 * Image Preprocessing Service
 *
 * When the primary model does not support vision/image input,
 * this service automatically finds a vision-capable model to describe
 * the images, then injects the descriptions as text into the message.
 *
 * Fallback chain for finding a vision model:
 * 1. User-configured imageModel in config
 * 2. skillsfan-credits (if logged in)
 * 3. custom API source
 * 4. Other configured OAuth providers
 */

import { getConfig } from '../config.service'
import { getAISourceManager } from '../ai-sources'
import { isNoVisionModel } from '../../../shared/utils/vision-models'
import type { ImageAttachment, Attachment } from './types'
import type { AISourcesConfig, BackendRequestConfig, OAuthSourceConfig, CustomSourceConfig } from '../../../shared/types'

// ============================================
// Types
// ============================================

interface VisionModelInfo {
  backendConfig: BackendRequestConfig
  sourceKey: string
  modelId: string
}

interface PreprocessResult {
  /** Updated message text with image descriptions prepended */
  enhancedMessage: string
  /** Attachments with image types removed */
  filteredAttachments: Attachment[]
  /** Filtered legacy images (empty array) */
  filteredImages: ImageAttachment[]
  /** Whether preprocessing was performed */
  preprocessed: boolean
  /** Error message if vision model not found */
  error?: string
}

// ============================================
// Vision Model Discovery
// ============================================

/**
 * Find a vision-capable model from configured AI sources.
 *
 * Priority:
 * 1. config.imageModel (explicit user config)
 * 2. skillsfan-credits (most users have this)
 * 3. custom API source (Claude/GPT usually support vision)
 * 4. Other logged-in OAuth providers (not in NO_VISION list)
 */
function findVisionModel(): VisionModelInfo | null {
  const config = getConfig() as any
  const aiSources: AISourcesConfig = config.aiSources || { current: 'custom' }

  // 1. Check explicit imageModel config
  if (config.imageModel?.source && config.imageModel?.model) {
    const backendConfig = getBackendConfigForSource(aiSources, config.imageModel.source)
    if (backendConfig) {
      return {
        backendConfig: { ...backendConfig, model: config.imageModel.model },
        sourceKey: config.imageModel.source,
        modelId: config.imageModel.model
      }
    }
  }

  // 2. Check skillsfan-credits
  const creditsConfig = aiSources['skillsfan-credits'] as OAuthSourceConfig | undefined
  if (creditsConfig && typeof creditsConfig === 'object' && creditsConfig.loggedIn) {
    const visionModel = findVisionModelInList(creditsConfig.availableModels)
    if (visionModel) {
      const backendConfig = getBackendConfigForSource(aiSources, 'skillsfan-credits')
      if (backendConfig) {
        return {
          backendConfig: { ...backendConfig, model: visionModel },
          sourceKey: 'skillsfan-credits',
          modelId: visionModel
        }
      }
    }
  }

  // 3. Check custom API source
  const customConfig = aiSources.custom as CustomSourceConfig | undefined
  if (customConfig && customConfig.apiKey) {
    // Custom API with Claude/GPT usually supports vision
    const model = customConfig.model || ''
    if (!isNoVisionModel(model)) {
      const backendConfig = getBackendConfigForSource(aiSources, 'custom')
      if (backendConfig) {
        return {
          backendConfig,
          sourceKey: 'custom',
          modelId: model
        }
      }
    }
  }

  // 4. Check other configured OAuth providers
  for (const key of Object.keys(aiSources)) {
    if (key === 'current' || key === 'custom' || key === 'skillsfan-credits') continue
    const sourceConfig = aiSources[key]
    if (!sourceConfig || typeof sourceConfig !== 'object') continue

    // OAuth provider with available models
    if ('loggedIn' in sourceConfig && (sourceConfig as OAuthSourceConfig).loggedIn) {
      const oauthConfig = sourceConfig as OAuthSourceConfig
      const visionModel = findVisionModelInList(oauthConfig.availableModels)
      if (visionModel) {
        const backendConfig = getBackendConfigForSource(aiSources, key)
        if (backendConfig) {
          return {
            backendConfig: { ...backendConfig, model: visionModel },
            sourceKey: key,
            modelId: visionModel
          }
        }
      }
    }

    // Custom API provider (dynamic, like 'zhipu', 'deepseek')
    if ('apiKey' in sourceConfig && (sourceConfig as CustomSourceConfig).apiKey) {
      const customSrc = sourceConfig as CustomSourceConfig
      if (!isNoVisionModel(customSrc.model || '')) {
        const backendConfig = getBackendConfigForSource(aiSources, key)
        if (backendConfig) {
          return {
            backendConfig,
            sourceKey: key,
            modelId: customSrc.model || ''
          }
        }
      }
    }
  }

  return null
}

/**
 * Find the first vision-capable model from a list
 */
function findVisionModelInList(models: string[] | undefined): string | null {
  if (!models || models.length === 0) return null
  // Prefer Claude models for vision (best quality)
  const claudeModel = models.find(m => m.toLowerCase().includes('claude') && !isNoVisionModel(m))
  if (claudeModel) return claudeModel
  // Then any model that supports vision
  const visionModel = models.find(m => !isNoVisionModel(m))
  return visionModel || null
}

/**
 * Get BackendRequestConfig for a specific source (not necessarily the current one)
 */
function getBackendConfigForSource(aiSources: AISourcesConfig, sourceKey: string): BackendRequestConfig | null {
  const manager = getAISourceManager()
  const provider = manager.getProvider(sourceKey)

  if (provider && provider.isConfigured(aiSources)) {
    return provider.getBackendConfig(aiSources)
  }

  // Dynamic custom API provider
  const config = aiSources[sourceKey]
  if (config && typeof config === 'object' && 'apiKey' in config && (config as any).apiKey) {
    const apiUrl = ((config as any).apiUrl || 'https://api.anthropic.com').replace(/\/$/, '')
    return {
      url: apiUrl,
      key: (config as any).apiKey,
      model: (config as any).model
    }
  }

  return null
}

// ============================================
// Image Description API Call
// ============================================

/**
 * Call a vision model to describe an image
 */
async function describeImage(
  image: ImageAttachment,
  backendConfig: BackendRequestConfig
): Promise<string> {
  const apiUrl = backendConfig.url.replace(/\/$/, '')
  const isAnthropic = apiUrl.includes('anthropic') || apiUrl.includes('skillsfan')

  const prompt = 'Please describe this image in detail, including any text, layout, colors, charts, and key visual elements. Respond in the same language as any text found in the image. If there is no text, respond in Chinese.'

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  try {
    let response: Response

    if (isAnthropic) {
      // Anthropic Messages API format
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
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: image.mediaType,
                  data: image.data
                }
              }
            ]
          }]
        }),
        signal: controller.signal
      })
    } else {
      // OpenAI-compatible API format
      response = await fetch(`${apiUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${backendConfig.key}`,
          ...(backendConfig.headers || {})
        },
        body: JSON.stringify({
          model: backendConfig.model,
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${image.mediaType};base64,${image.data}`
                }
              }
            ]
          }]
        }),
        signal: controller.signal
      })
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(`Vision API error ${response.status}: ${errorText.slice(0, 200)}`)
    }

    const data = await response.json()

    // Extract text from response
    if (isAnthropic) {
      // Anthropic format: { content: [{ type: 'text', text: '...' }] }
      const textBlock = data.content?.find((b: any) => b.type === 'text')
      return textBlock?.text || '[No description returned]'
    } else {
      // OpenAI format: { choices: [{ message: { content: '...' } }] }
      return data.choices?.[0]?.message?.content || '[No description returned]'
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return '[Image description timed out]'
    }
    console.error('[ImagePreprocess] Failed to describe image:', error.message)
    return `[Image description failed: ${error.message}]`
  } finally {
    clearTimeout(timeout)
  }
}

// ============================================
// Main Entry Point
// ============================================

/**
 * Preprocess images for models that don't support vision.
 *
 * If the primary model supports vision, returns the data unchanged.
 * Otherwise, finds a vision model, describes each image, and injects
 * the descriptions as text into the message.
 */
export async function preprocessImages(
  message: string,
  modelId: string,
  images?: ImageAttachment[],
  attachments?: Attachment[]
): Promise<PreprocessResult> {
  // If model supports vision, no preprocessing needed
  if (!isNoVisionModel(modelId)) {
    return {
      enhancedMessage: message,
      filteredAttachments: attachments || [],
      filteredImages: images || [],
      preprocessed: false
    }
  }

  // Collect all image attachments
  const imageAtts = (attachments || []).filter(a => a.type === 'image') as ImageAttachment[]
  const legacyImages = images || []
  const allImages = [
    ...legacyImages,
    ...imageAtts.filter(a => !legacyImages.some(li => li.id === a.id))
  ]

  // No images to process
  if (allImages.length === 0) {
    return {
      enhancedMessage: message,
      filteredAttachments: attachments || [],
      filteredImages: images || [],
      preprocessed: false
    }
  }

  console.log(`[ImagePreprocess] Model ${modelId} does not support vision, preprocessing ${allImages.length} image(s)`)

  // Find a vision model
  const visionModel = findVisionModel()
  if (!visionModel) {
    console.warn('[ImagePreprocess] No vision model available for image preprocessing')
    return {
      enhancedMessage: message,
      filteredAttachments: (attachments || []).filter(a => a.type !== 'image'),
      filteredImages: [],
      preprocessed: true,
      error: 'No vision model available. Please configure a vision-capable AI source.'
    }
  }

  console.log(`[ImagePreprocess] Using vision model: ${visionModel.sourceKey}/${visionModel.modelId}`)

  // Describe each image
  const descriptions: string[] = []
  for (const img of allImages) {
    const name = img.name || `image-${img.id}`
    console.log(`[ImagePreprocess] Describing image: ${name}`)
    const description = await describeImage(img, visionModel.backendConfig)
    descriptions.push(`<image name="${name}">\n${description}\n</image>`)
  }

  // Build enhanced message with descriptions prepended
  const descriptionsBlock = `<image_descriptions>\n${descriptions.join('\n\n')}\n</image_descriptions>`
  const enhancedMessage = `${descriptionsBlock}\n\n${message}`

  // Filter out image attachments (they've been converted to text)
  const filteredAttachments = (attachments || []).filter(a => a.type !== 'image')

  return {
    enhancedMessage,
    filteredAttachments,
    filteredImages: [], // Remove legacy images too
    preprocessed: true
  }
}
