/**
 * WeChat Access Control - Pairing Code & Whitelist
 *
 * Ensures only authorized WeChat users can interact with the bot.
 * First-time users must send the 6-digit pairing code.
 */

import crypto from 'crypto'
import type { WeChatConfig } from '@shared/types/wechat'

interface PairingAttempt {
  count: number
  firstAttemptAt: number
}

const MAX_ATTEMPTS_PER_HOUR = 5
const ONE_HOUR_MS = 60 * 60 * 1000

export class WeChatAccessControl {
  private pairingAttempts = new Map<string, PairingAttempt>()

  /**
   * Check if a user ID is authorized.
   */
  isAllowed(fromUserId: string, config: WeChatConfig): boolean {
    return config.allowedUserIds.includes(fromUserId)
  }

  /**
   * Verify a pairing code attempt.
   * Returns true if the code matches and the user is now authorized.
   */
  verifyPairingCode(
    fromUserId: string,
    code: string,
    config: WeChatConfig
  ): { success: boolean; rateLimited?: boolean } {
    if (this.isRateLimited(fromUserId)) {
      return { success: false, rateLimited: true }
    }

    this.recordAttempt(fromUserId)

    const inputCode = code.trim()
    if (inputCode === config.pairingCode) {
      this.pairingAttempts.delete(fromUserId)
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
    for (const [userId, attempt] of this.pairingAttempts) {
      if (now - attempt.firstAttemptAt > ONE_HOUR_MS) {
        this.pairingAttempts.delete(userId)
      }
    }
  }

  private isRateLimited(userId: string): boolean {
    const attempt = this.pairingAttempts.get(userId)
    if (!attempt) return false

    if (Date.now() - attempt.firstAttemptAt > ONE_HOUR_MS) {
      this.pairingAttempts.delete(userId)
      return false
    }

    return attempt.count >= MAX_ATTEMPTS_PER_HOUR
  }

  private recordAttempt(userId: string): void {
    const existing = this.pairingAttempts.get(userId)
    const now = Date.now()

    if (!existing || now - existing.firstAttemptAt > ONE_HOUR_MS) {
      this.pairingAttempts.set(userId, { count: 1, firstAttemptAt: now })
    } else {
      existing.count++
    }
  }
}
