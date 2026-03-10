/**
 * Embedding Service - Local vector embedding generation
 *
 * Uses @huggingface/transformers to run a small embedding model locally.
 * Lazy-loads on first use (~2s initial load). Model is cached to disk
 * so subsequent loads are faster.
 *
 * Model: Xenova/all-MiniLM-L6-v2 (~23MB, 384-dimensional embeddings)
 * Works well for both English and Chinese text similarity.
 */

import { join } from 'path'
import { getHaloDir } from '../config.service'

// Dynamic import type - loaded lazily to avoid startup cost
let pipeline: any = null
let extractor: any = null
let initPromise: Promise<void> | null = null
let initError: Error | null = null

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2'
const EMBEDDING_DIM = 384

/**
 * Initialize the embedding pipeline (lazy, only called on first use)
 */
async function ensureInitialized(): Promise<boolean> {
  if (extractor) return true
  if (initError) return false

  if (!initPromise) {
    initPromise = (async () => {
      try {
        // Dynamic import to avoid loading at startup
        const transformers = await import('@huggingface/transformers')

        // Configure model cache directory
        const cacheDir = join(getHaloDir(), 'models')
        transformers.env.cacheDir = cacheDir

        // Disable remote model downloads after first successful load
        // (model will be cached locally)
        transformers.env.allowLocalModels = true

        extractor = await transformers.pipeline(
          'feature-extraction',
          MODEL_NAME,
          { dtype: 'fp32' }
        )

        console.log(`[Embedding] Model loaded: ${MODEL_NAME} (${EMBEDDING_DIM}d)`)
      } catch (error) {
        initError = error as Error
        console.error('[Embedding] Failed to initialize:', error)
        throw error
      }
    })()
  }

  try {
    await initPromise
    return true
  } catch {
    return false
  }
}

/**
 * Generate embedding for a single text.
 * Returns a Float32Array of EMBEDDING_DIM dimensions, or null if service unavailable.
 */
export async function generateEmbedding(text: string): Promise<Float32Array | null> {
  const ready = await ensureInitialized()
  if (!ready || !extractor) return null

  try {
    // Truncate long text (model max is ~512 tokens, ~2000 chars is safe)
    const truncated = text.slice(0, 2000)
    const output = await extractor(truncated, { pooling: 'mean', normalize: true })
    return new Float32Array(output.data)
  } catch (error) {
    console.error('[Embedding] Generation failed:', error)
    return null
  }
}

/**
 * Generate embeddings for multiple texts in batch.
 * Returns array of Float32Array, with null for any failed items.
 */
export async function generateEmbeddings(texts: string[]): Promise<(Float32Array | null)[]> {
  const ready = await ensureInitialized()
  if (!ready || !extractor) return texts.map(() => null)

  const results: (Float32Array | null)[] = []

  // Process in small batches to avoid memory pressure
  const BATCH_SIZE = 16
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE).map(t => t.slice(0, 2000))

    try {
      const outputs = await extractor(batch, { pooling: 'mean', normalize: true })

      for (let j = 0; j < batch.length; j++) {
        const start = j * EMBEDDING_DIM
        const embedding = new Float32Array(EMBEDDING_DIM)
        for (let k = 0; k < EMBEDDING_DIM; k++) {
          embedding[k] = outputs.data[start + k]
        }
        results.push(embedding)
      }
    } catch (error) {
      console.error(`[Embedding] Batch ${i}-${i + batch.length} failed:`, error)
      for (let j = 0; j < batch.length; j++) {
        results.push(null)
      }
    }
  }

  return results
}

/**
 * Check if the embedding service is ready (model loaded)
 */
export function isEmbeddingReady(): boolean {
  return extractor !== null
}

/**
 * Get the embedding dimension
 */
export function getEmbeddingDim(): number {
  return EMBEDDING_DIM
}

/**
 * Serialize a Float32Array to a Buffer for SQLite storage
 */
export function embeddingToBuffer(embedding: Float32Array): Buffer {
  return Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength)
}

/**
 * Deserialize a Buffer back to Float32Array
 */
export function bufferToEmbedding(buffer: Buffer): Float32Array {
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4)
}

/**
 * Shutdown the embedding service and release resources
 */
export async function shutdownEmbedding(): Promise<void> {
  extractor = null
  pipeline = null
  initPromise = null
  initError = null
  console.log('[Embedding] Service shut down')
}
