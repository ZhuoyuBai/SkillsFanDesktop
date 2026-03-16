/**
 * Request Queue
 *
 * Limits concurrent requests to the same upstream provider.
 * A small amount of parallelism is necessary for multi-task agent flows,
 * especially when multiple conversations or tool follow-up turns overlap.
 */

interface RequestQueueState {
  active: number
  waiters: Array<() => void>
}

const requestQueues = new Map<string, RequestQueueState>()

function getMaxConcurrentRequests(): number {
  const raw = Number.parseInt(process.env.HALO_OPENAI_MAX_CONCURRENT_REQUESTS || '', 10)
  if (Number.isFinite(raw)) {
    return Math.max(1, Math.min(8, raw))
  }
  return 4
}

/**
 * Execute a function with request queue protection
 *
 * Allows a bounded number of in-flight requests per key.
 * Additional requests wait until a slot is available.
 */
export async function withRequestQueue<T>(key: string, fn: () => Promise<T>): Promise<T> {
  let queue = requestQueues.get(key)
  if (!queue) {
    queue = { active: 0, waiters: [] }
    requestQueues.set(key, queue)
  }

  const maxConcurrent = getMaxConcurrentRequests()

  if (queue.active >= maxConcurrent) {
    await new Promise<void>((resolve) => {
      queue!.waiters.push(resolve)
    })
  } else {
    queue.active += 1
  }

  try {
    return await fn()
  } finally {
    const current = requestQueues.get(key)
    if (current) {
      const next = current.waiters.shift()
      if (next) {
        next()
      } else {
        current.active = Math.max(0, current.active - 1)
        if (current.active === 0) {
          requestQueues.delete(key)
        }
      }
    }
  }
}

/**
 * Generate a queue key from backend URL and API key
 */
export function generateQueueKey(backendUrl: string, apiKey: string): string {
  return `${backendUrl}:${apiKey.slice(0, 16)}`
}

/**
 * Clear all pending requests (for testing)
 */
export function clearRequestQueues(): void {
  requestQueues.clear()
}

/**
 * Get the number of pending requests (for monitoring)
 */
export function getPendingRequestCount(): number {
  return requestQueues.size
}
