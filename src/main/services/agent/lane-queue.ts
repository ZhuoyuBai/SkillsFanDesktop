/**
 * Lane Queue - Per-conversation serial execution queue
 *
 * Ensures that messages to the same conversation are processed serially,
 * preventing race conditions when users send messages rapidly.
 *
 * Each conversationId maps to an independent "lane" with maxConcurrent=1.
 * Uses a pump-drain algorithm: when a task completes, the next queued task
 * is automatically dequeued and executed.
 *
 * Inspired by OpenClaw's command-queue.ts lane queue pattern.
 */

interface QueuedTask<T> {
  task: () => Promise<T>
  resolve: (value: T) => void
  reject: (reason: any) => void
  enqueuedAt: number
}

interface Lane<T> {
  queue: QueuedTask<T>[]
  running: boolean
}

export type OverflowStrategy = 'queue' | 'reject' | 'replace'

export interface EnqueueOptions {
  /** Behavior when queue is full: 'queue' (default) | 'reject' | 'replace' */
  overflow?: OverflowStrategy
  /** Max queue length (default 5) */
  maxQueueLength?: number
}

export class LaneQueue {
  private lanes = new Map<string, Lane<any>>()

  /**
   * Enqueue a task into the specified lane.
   * If the lane is idle, the task executes immediately.
   * Otherwise it waits in queue until preceding tasks complete.
   */
  async enqueue<T>(
    laneKey: string,
    task: () => Promise<T>,
    options?: EnqueueOptions
  ): Promise<T> {
    const { overflow = 'queue', maxQueueLength = 5 } = options || {}

    let lane = this.lanes.get(laneKey)
    if (!lane) {
      lane = { queue: [], running: false }
      this.lanes.set(laneKey, lane)
    }

    // Check overflow policy
    if (lane.running && lane.queue.length >= maxQueueLength) {
      if (overflow === 'reject') {
        throw new Error(`Lane "${laneKey}" queue is full (${maxQueueLength})`)
      }
      if (overflow === 'replace') {
        // Replace the last queued task (reject it)
        const replaced = lane.queue.pop()
        if (replaced) {
          replaced.reject(new Error(`Replaced by newer task in lane "${laneKey}"`))
        }
      }
      // 'queue' overflow: just allow it to grow beyond maxQueueLength
    }

    return new Promise<T>((resolve, reject) => {
      lane!.queue.push({ task, resolve, reject, enqueuedAt: Date.now() })
      this.pump(laneKey)
    })
  }

  /**
   * Get the current status of a lane
   */
  getStatus(laneKey: string): { running: boolean; queued: number } {
    const lane = this.lanes.get(laneKey)
    if (!lane) return { running: false, queued: 0 }
    return { running: lane.running, queued: lane.queue.length }
  }

  /**
   * Clear all waiting tasks in a lane (does not affect the currently running task).
   * Returns the number of cleared tasks.
   */
  clearQueue(laneKey: string): number {
    const lane = this.lanes.get(laneKey)
    if (!lane) return 0

    const cleared = lane.queue.length
    for (const item of lane.queue) {
      item.reject(new Error(`Queue cleared for lane "${laneKey}"`))
    }
    lane.queue = []
    return cleared
  }

  /**
   * Pump-drain: execute the next task in a lane if it's not already running.
   */
  private async pump(laneKey: string): Promise<void> {
    const lane = this.lanes.get(laneKey)
    if (!lane || lane.running || lane.queue.length === 0) return

    lane.running = true
    const { task, resolve, reject, enqueuedAt } = lane.queue.shift()!

    const waitTime = Date.now() - enqueuedAt
    if (waitTime > 100) {
      console.log(`[LaneQueue] Lane "${laneKey}" task waited ${waitTime}ms in queue`)
    }

    try {
      const result = await task()
      resolve(result)
    } catch (error) {
      reject(error)
    } finally {
      lane.running = false
      if (lane.queue.length === 0) {
        this.lanes.delete(laneKey) // Clean up empty lane
      } else {
        this.pump(laneKey) // Drain next
      }
    }
  }
}

/** Global agent queue singleton */
export const agentQueue = new LaneQueue()
