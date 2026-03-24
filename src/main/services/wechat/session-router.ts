/**
 * WeChat Session Router - User to Space/Conversation Mapping
 *
 * Maps WeChat user IDs (from_user_id) to SkillsFan Space + Conversation pairs.
 * Persists mappings to wechat-sessions.json for cross-restart recovery.
 */

import fs from 'fs'
import path from 'path'
import type { WeChatSessionMapping } from '@shared/types/wechat'
import { getHaloDir } from '../config.service'
import { getSpace, getSpaceMetaDir } from '../space.service'

function getConversationFilePath(spaceId: string, conversationId: string): string | null {
  const space = getSpace(spaceId)
  if (!space) return null

  const conversationsDir = space.isTemp
    ? path.join(space.path, 'conversations')
    : path.join(getSpaceMetaDir(space.path), 'conversations')

  return path.join(conversationsDir, `${conversationId}.json`)
}

function hasConversationTarget(spaceId: string, conversationId: string): boolean {
  const conversationPath = getConversationFilePath(spaceId, conversationId)
  return !!conversationPath && fs.existsSync(conversationPath)
}

export class WeChatSessionRouter {
  private sessions = new Map<string, WeChatSessionMapping>()
  private filePath: string | null = null

  /**
   * Initialize the router, loading persisted sessions.
   */
  initialize(): void {
    const dataDir = getHaloDir()
    this.filePath = path.join(dataDir, 'wechat-sessions.json')
    this.loadSessions()
  }

  /**
   * Get the session mapping for a user, or null if not mapped.
   */
  getSession(fromUserId: string): WeChatSessionMapping | null {
    return this.sessions.get(fromUserId) || null
  }

  /**
   * Create or update a session mapping.
   */
  setSession(mapping: WeChatSessionMapping): void {
    this.sessions.set(mapping.fromUserId, mapping)
    this.saveSessions()
  }

  /**
   * Update the lastMessageAt timestamp and context_token for a session.
   */
  touchSession(fromUserId: string, contextToken: string): void {
    const session = this.sessions.get(fromUserId)
    if (session) {
      session.lastMessageAt = Date.now()
      session.contextToken = contextToken
      this.saveSessions()
    }
  }

  /**
   * Remove a session mapping.
   */
  removeSession(fromUserId: string): void {
    this.sessions.delete(fromUserId)
    this.saveSessions()
  }

  /**
   * Get all active sessions.
   */
  getAllSessions(): WeChatSessionMapping[] {
    return Array.from(this.sessions.values())
  }

  /**
   * Get total number of active sessions.
   */
  getSessionCount(): number {
    return this.sessions.size
  }

  /**
   * Find session by conversation ID.
   */
  getSessionByConversation(conversationId: string): WeChatSessionMapping | null {
    for (const session of this.sessions.values()) {
      if (session.conversationId === conversationId) {
        return session
      }
    }
    return null
  }

  /**
   * Remove sessions associated with a conversation.
   */
  removeSessionsByConversation(conversationId: string): number {
    let removed = 0
    for (const [userId, session] of this.sessions) {
      if (session.conversationId === conversationId) {
        this.sessions.delete(userId)
        removed++
      }
    }
    if (removed > 0) this.saveSessions()
    return removed
  }

  /**
   * Remove sessions associated with a space.
   */
  removeSessionsBySpace(spaceId: string): number {
    let removed = 0
    for (const [userId, session] of this.sessions) {
      if (session.spaceId === spaceId) {
        this.sessions.delete(userId)
        removed++
      }
    }
    if (removed > 0) this.saveSessions()
    return removed
  }

  // ============================================
  // Persistence
  // ============================================

  private loadSessions(): void {
    if (!this.filePath) return

    try {
      if (fs.existsSync(this.filePath)) {
        const data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'))
        let staleCount = 0
        if (Array.isArray(data)) {
          for (const session of data as WeChatSessionMapping[]) {
            if (!session?.fromUserId || !session?.spaceId || !session?.conversationId) {
              staleCount++
              continue
            }
            if (!hasConversationTarget(session.spaceId, session.conversationId)) {
              staleCount++
              continue
            }
            this.sessions.set(session.fromUserId, session)
          }
        }
        if (staleCount > 0) {
          this.saveSessions()
          console.log(`[WeChatRouter] Pruned ${staleCount} stale session mapping(s)`)
        }
        console.log(`[WeChatRouter] Loaded ${this.sessions.size} session(s)`)
      }
    } catch (err) {
      console.error('[WeChatRouter] Failed to load sessions:', err)
    }
  }

  private saveSessions(): void {
    if (!this.filePath) return

    try {
      const data = Array.from(this.sessions.values())
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8')
    } catch (err) {
      console.error('[WeChatRouter] Failed to save sessions:', err)
    }
  }
}
