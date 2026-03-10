/**
 * Vision Model Detection
 *
 * Shared utility for detecting models that do not support image/vision input.
 * Used by both renderer (InputArea) and main process (image-preprocess).
 */

// Model patterns that do not support image/vision input (matched case-insensitively via includes)
export const NO_VISION_PATTERNS = ['glm-5', 'glm-4', 'minimax-m2.1', 'minimax-m2.5']

/**
 * Check if a model does NOT support vision/image input
 */
export function isNoVisionModel(modelId: string): boolean {
  if (!modelId) return false
  const lower = modelId.toLowerCase()
  return NO_VISION_PATTERNS.some(p => lower.includes(p))
}
