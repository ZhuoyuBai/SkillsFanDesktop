/**
 * Feishu Session Router - Chat to Space/Conversation Mapping
 *
 * Maps Feishu chat_ids to SkillsFan Space + Conversation pairs.
 * Persists mappings to feishu-sessions.json for cross-restart recovery.
 */

import fs from 'fs'
import path from 'path'
import type { FeishuSessionMapping } from '@shared/types/feishu'
import { getHaloDir } from '../config.service'
import { getSpace, getSpaceMetaDir } from '../space.service'

function getSessionsFilePath(): string {
  return path.join(getHaloDir(), 'feishu-sessions.json')
}

function getConversationFilePath(spaceId: string, conversationId: string): string | null {
  const space = getSpace(spaceId)
  if (!space) return null

  const conversationsDir = space.isTemp
    ? path.join(space.path, 'conversations')
    : path.join(getSpaceMetaDir(space.path), 'conversations')

  return path.join(conversationsDir, `${conversationId}.json`)
}

export function hasFeishuConversationTarget(spaceId: string, conversationId: string): boolean {
  const conversationPath = getConversationFilePath(spaceId, conversationId)
  return !!conversationPath && fs.existsSync(conversationPath)
}

function loadPersistedSessions(): FeishuSessionMapping[] {
  const filePath = getSessionsFilePath()
  if (!fs.existsSync(filePath)) return []

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    if (!Array.isArray(parsed)) return []
    return parsed as FeishuSessionMapping[]
  } catch (err) {
    console.error('[FeishuRouter] Failed to read persisted sessions:', err)
    return []
  }
}

function savePersistedSessions(sessions: FeishuSessionMapping[]): void {
  const filePath = getSessionsFilePath()
  try {
    fs.writeFileSync(filePath, JSON.stringify(sessions, null, 2), 'utf-8')
  } catch (err) {
    console.error('[FeishuRouter] Failed to save persisted sessions:', err)
  }
}

function removePersistedSessions(
  predicate: (session: FeishuSessionMapping) => boolean
): number {
  const sessions = loadPersistedSessions()
  if (sessions.length === 0) return 0

  const filtered = sessions.filter((session) => !predicate(session))
  const removed = sessions.length - filtered.length
  if (removed > 0) {
    savePersistedSessions(filtered)
  }
  return removed
}

export function removePersistedFeishuSessionsByConversation(conversationId: string): number {
  return removePersistedSessions((session) => session.conversationId === conversationId)
}

export function removePersistedFeishuSessionsBySpace(spaceId: string): number {
  return removePersistedSessions((session) => session.spaceId === spaceId)
}

export class FeishuSessionRouter {
  private sessions = new Map<string, FeishuSessionMapping>()
  private filePath: string | null = null

  /**
   * Initialize the router, loading persisted sessions.
   */
  initialize(): void {
    const dataDir = getHaloDir()
    this.filePath = path.join(dataDir, 'feishu-sessions.json')
    this.loadSessions()
  }

  /**
   * Get the session mapping for a chat, or null if not mapped.
   */
  getSession(chatId: string): FeishuSessionMapping | null {
    return this.sessions.get(chatId) || null
  }

  /**
   * Create or update a session mapping.
   */
  setSession(mapping: FeishuSessionMapping): void {
    this.sessions.set(mapping.chatId, mapping)
    this.saveSessions()
  }

  /**
   * Update the lastMessageAt timestamp for a session.
   */
  touchSession(chatId: string): void {
    const session = this.sessions.get(chatId)
    if (session) {
      session.lastMessageAt = Date.now()
      this.saveSessions()
    }
  }

  /**
   * Remove a session mapping.
   */
  removeSession(chatId: string): void {
    this.sessions.delete(chatId)
    this.saveSessions()
  }

  /**
   * Get all active sessions.
   */
  getAllSessions(): FeishuSessionMapping[] {
    return Array.from(this.sessions.values())
  }

  /**
   * Get total number of active sessions.
   */
  getSessionCount(): number {
    return this.sessions.size
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
          for (const session of data as FeishuSessionMapping[]) {
            if (!session?.chatId || !session?.spaceId || !session?.conversationId) {
              staleCount++
              continue
            }
            if (!hasFeishuConversationTarget(session.spaceId, session.conversationId)) {
              staleCount++
              continue
            }
            this.sessions.set(session.chatId, session)
          }
        }
        if (staleCount > 0) {
          this.saveSessions()
          console.log(`[FeishuRouter] Pruned ${staleCount} stale session mapping(s)`)
        }
        console.log(`[FeishuRouter] Loaded ${this.sessions.size} session(s)`)
      }
    } catch (err) {
      console.error('[FeishuRouter] Failed to load sessions:', err)
    }
  }

  private saveSessions(): void {
    if (!this.filePath) return

    try {
      const data = Array.from(this.sessions.values())
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8')
    } catch (err) {
      console.error('[FeishuRouter] Failed to save sessions:', err)
    }
  }
}
