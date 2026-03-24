/**
 * WeChat Polling Engine
 *
 * Maintains a long-polling loop against the iLink Bot API to receive messages.
 * Manages the get_updates_buf cursor and persists it to disk.
 */

import fs from 'fs'
import path from 'path'
import { ILinkClient } from './ilink-client'
import type { ILinkMessage } from '@shared/types/wechat'
import { getHaloDir } from '../config.service'

type MessageCallback = (message: ILinkMessage, botToken: string) => void | Promise<void>

interface PollingState {
  cursor: string
  botToken: string
  baseUrl?: string
  running: boolean
}

/** Delay between poll failures (backoff) */
const ERROR_RETRY_DELAY_MS = 5000
/** Max consecutive errors before stopping */
const MAX_CONSECUTIVE_ERRORS = 10

export class WeChatPollingEngine {
  private client = new ILinkClient()
  private state: PollingState | null = null
  private messageCallback: MessageCallback | null = null
  private consecutiveErrors = 0
  private cursorFilePath: string | null = null

  /**
   * Register a callback for incoming messages.
   */
  onMessage(callback: MessageCallback): void {
    this.messageCallback = callback
  }

  /**
   * Start polling for a logged-in account.
   */
  start(botToken: string, baseUrl?: string): void {
    if (this.state?.running) {
      console.log('[WeChatPoll] Already running, stopping previous session')
      this.stop()
    }

    const cursor = this.loadCursor()
    this.state = { cursor, botToken, baseUrl, running: true }
    this.consecutiveErrors = 0

    console.log('[WeChatPoll] Starting message polling')
    this.pollLoop()
  }

  /**
   * Stop the polling loop.
   */
  stop(): void {
    if (this.state) {
      this.state.running = false
      this.state = null
    }
    this.consecutiveErrors = 0
    console.log('[WeChatPoll] Stopped')
  }

  /**
   * Check if the engine is currently polling.
   */
  isRunning(): boolean {
    return this.state?.running ?? false
  }

  /**
   * Get the current bot token.
   */
  getBotToken(): string | null {
    return this.state?.botToken ?? null
  }

  /**
   * Get the current account-specific base URL if present.
   */
  getBaseUrl(): string | undefined {
    return this.state?.baseUrl
  }

  // ============================================
  // Private
  // ============================================

  private async pollLoop(): Promise<void> {
    while (this.state?.running) {
      try {
        const response = await this.client.getUpdates(
          this.state.botToken,
          this.state.cursor,
          this.state.baseUrl
        )

        // Update cursor (critical: prevents duplicate messages)
        if (response.get_updates_buf) {
          this.state.cursor = response.get_updates_buf
          this.saveCursor(response.get_updates_buf)
        }

        // Process messages
        if (response.msgs && response.msgs.length > 0) {
          for (const msg of response.msgs) {
            try {
              await this.messageCallback?.(msg, this.state.botToken)
            } catch (err) {
              console.error('[WeChatPoll] Error in message callback:', err)
            }
          }
        }

        // Reset error counter on success
        this.consecutiveErrors = 0
      } catch (err) {
        if (!this.state?.running) break // Stopped during fetch

        this.consecutiveErrors++
        const errMsg = err instanceof Error ? err.message : String(err)

        if (errMsg.includes('aborted') || errMsg.includes('AbortError')) {
          // Long-poll timeout, just retry
          console.log('[WeChatPoll] Poll timeout, retrying...')
          continue
        }

        console.error(
          `[WeChatPoll] Error (${this.consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`,
          errMsg
        )

        if (this.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          console.error('[WeChatPoll] Too many consecutive errors, stopping')
          this.state.running = false
          break
        }

        // Backoff before retry
        await this.delay(ERROR_RETRY_DELAY_MS)
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  // ============================================
  // Cursor Persistence
  // ============================================

  private getCursorFilePath(): string {
    if (!this.cursorFilePath) {
      this.cursorFilePath = path.join(getHaloDir(), 'wechat-cursor.json')
    }
    return this.cursorFilePath
  }

  private loadCursor(): string {
    try {
      const filePath = this.getCursorFilePath()
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
        if (data?.cursor) {
          console.log('[WeChatPoll] Loaded persisted cursor')
          return data.cursor
        }
      }
    } catch (err) {
      console.warn('[WeChatPoll] Failed to load cursor:', err)
    }
    return '' // Empty string = start from beginning
  }

  private saveCursor(cursor: string): void {
    try {
      const filePath = this.getCursorFilePath()
      fs.writeFileSync(filePath, JSON.stringify({ cursor, savedAt: Date.now() }), 'utf-8')
    } catch (err) {
      console.warn('[WeChatPoll] Failed to save cursor:', err)
    }
  }
}
