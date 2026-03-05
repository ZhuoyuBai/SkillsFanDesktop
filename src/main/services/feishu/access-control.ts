/**
 * Feishu Access Control - Pairing Code & Whitelist
 *
 * Ensures only authorized users can interact with the bot.
 * First-time users must enter a 6-digit pairing code.
 */

import crypto from 'crypto'
import type { FeishuConfig } from '@shared/types/feishu'

interface PairingAttempt {
  count: number
  firstAttemptAt: number
}

const MAX_ATTEMPTS_PER_HOUR = 5
const ONE_HOUR_MS = 60 * 60 * 1000

export class FeishuAccessControl {
  private pairingAttempts = new Map<string, PairingAttempt>()

  /**
   * Check if a chat ID is authorized.
   */
  isAllowed(chatId: string, config: FeishuConfig): boolean {
    return config.allowedChatIds.includes(chatId)
  }

  /**
   * Verify a pairing code attempt.
   * Returns true if the code matches and the chat is now authorized.
   */
  verifyPairingCode(
    chatId: string,
    code: string,
    config: FeishuConfig
  ): { success: boolean; rateLimited?: boolean } {
    // Check rate limit
    if (this.isRateLimited(chatId)) {
      return { success: false, rateLimited: true }
    }

    this.recordAttempt(chatId)

    // Trim and compare
    const inputCode = code.trim()
    if (inputCode === config.pairingCode) {
      // Clear attempts on success
      this.pairingAttempts.delete(chatId)
      return { success: true }
    }

    return { success: false }
  }

  /**
   * Generate a random 6-digit pairing code.
   */
  static generatePairingCode(): string {
    return crypto.randomInt(100000, 999999).toString()
  }

  /**
   * Clean up expired rate limit entries.
   */
  cleanup(): void {
    const now = Date.now()
    for (const [chatId, attempt] of this.pairingAttempts) {
      if (now - attempt.firstAttemptAt > ONE_HOUR_MS) {
        this.pairingAttempts.delete(chatId)
      }
    }
  }

  private isRateLimited(chatId: string): boolean {
    const attempt = this.pairingAttempts.get(chatId)
    if (!attempt) return false

    // Reset if window expired
    if (Date.now() - attempt.firstAttemptAt > ONE_HOUR_MS) {
      this.pairingAttempts.delete(chatId)
      return false
    }

    return attempt.count >= MAX_ATTEMPTS_PER_HOUR
  }

  private recordAttempt(chatId: string): void {
    const existing = this.pairingAttempts.get(chatId)
    const now = Date.now()

    if (!existing || now - existing.firstAttemptAt > ONE_HOUR_MS) {
      this.pairingAttempts.set(chatId, { count: 1, firstAttemptAt: now })
    } else {
      existing.count++
    }
  }
}
