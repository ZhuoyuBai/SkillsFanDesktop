/**
 * Memory Index Manager - SQLite cross-conversation memory
 *
 * Indexes conversation messages and provides keyword search
 * across conversations within the same space.
 *
 * Search strategy: LIKE-based substring matching.
 * FTS5 unicode61 treats entire CJK runs as single tokens (no word segmentation),
 * making it unusable for Chinese search. LIKE works correctly for both
 * Chinese and English, and is fast enough for our dataset size (< 10k fragments).
 *
 * Uses better-sqlite3 with WAL journal mode for performance.
 */

import Database from 'better-sqlite3'
import { join } from 'path'
import { getHaloDir } from '../config.service'
import { extractSearchKeywords } from './query-builder'

export interface MemoryFragment {
  id: number
  conversation_id: string
  space_id: string
  role: string
  content: string
  created_at: string
  conversation_title: string
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  message_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS fragments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL,
  space_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE INDEX IF NOT EXISTS idx_fragments_conv ON fragments(conversation_id);
CREATE INDEX IF NOT EXISTS idx_fragments_space ON fragments(space_id);
`

export class MemoryIndexManager {
  private db: Database.Database | null = null

  /**
   * Initialize the database connection and create tables
   */
  initialize(): void {
    if (this.db) return

    const dbPath = join(getHaloDir(), 'memory.db')
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.exec(SCHEMA_SQL)

    // Drop legacy FTS5 table if it exists (no longer used)
    try {
      this.db.exec('DROP TABLE IF EXISTS fragments_fts')
    } catch { /* ignore if not exists */ }

    // Drop legacy triggers
    try {
      this.db.exec('DROP TRIGGER IF EXISTS fragments_ai')
      this.db.exec('DROP TRIGGER IF EXISTS fragments_ad')
    } catch { /* ignore */ }

    console.log(`[Memory] Database initialized at ${dbPath}`)
  }

  /**
   * Index a single message
   */
  indexMessage(
    spaceId: string,
    conversationId: string,
    conversationTitle: string,
    role: string,
    content: string,
    timestamp: string
  ): void {
    if (!this.db) return
    if (!content || content.trim().length < 10) return

    // Truncate very long messages
    const truncated = content.slice(0, 5000)

    try {
      // Upsert conversation metadata
      this.db.prepare(`
        INSERT INTO conversations (id, space_id, title, created_at, updated_at, message_count)
        VALUES (?, ?, ?, ?, ?, 1)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          updated_at = excluded.updated_at,
          message_count = message_count + 1
      `).run(conversationId, spaceId, conversationTitle, timestamp, timestamp)

      // Insert fragment
      this.db.prepare(`
        INSERT INTO fragments (conversation_id, space_id, role, content, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(conversationId, spaceId, role, truncated, timestamp)
    } catch (error) {
      console.error('[Memory] Failed to index message:', error)
    }
  }

  /**
   * Search for relevant history fragments using LIKE substring matching.
   *
   * Builds OR conditions from extracted keywords. Each keyword is matched
   * as a substring via LIKE against both content and conversation title.
   * Results are ordered by recency.
   */
  searchRelevant(
    spaceId: string,
    query: string,
    excludeConversationId: string,
    limit: number = 5
  ): MemoryFragment[] {
    if (!this.db) return []

    const keywords = extractSearchKeywords(query)
    if (keywords.length === 0) return []

    // Build LIKE conditions: match against both content AND conversation title
    // This helps bridge semantic gaps (e.g., searching "职业" matches title "我是一名产品经理")
    const contentConditions = keywords.map(() => 'f.content LIKE ?').join(' OR ')
    const titleConditions = keywords.map(() => 'c.title LIKE ?').join(' OR ')
    const params = [
      ...keywords.map(kw => `%${kw}%`),  // for content conditions
      ...keywords.map(kw => `%${kw}%`)   // for title conditions
    ]

    try {
      return this.db.prepare(`
        SELECT f.id, f.conversation_id, f.space_id, f.role, f.content, f.created_at,
               c.title as conversation_title
        FROM fragments f
        JOIN conversations c ON f.conversation_id = c.id
        WHERE ((${contentConditions}) OR (${titleConditions}))
          AND f.space_id = ?
          AND f.conversation_id != ?
        ORDER BY f.created_at DESC
        LIMIT ?
      `).all(...params, spaceId, excludeConversationId, limit) as MemoryFragment[]
    } catch (error) {
      console.error('[Memory] Search failed:', error)
      return []
    }
  }

  /**
   * Get recent fragments from other conversations (fallback for keyword search).
   *
   * Returns the most recent user messages from other conversations,
   * ensuring some cross-conversation context is always available
   * even when keyword matching fails (e.g., semantic gaps like "职业" vs "产品经理").
   */
  getRecentFragments(
    spaceId: string,
    excludeConversationId: string,
    limit: number = 3
  ): MemoryFragment[] {
    if (!this.db) return []

    try {
      return this.db.prepare(`
        SELECT f.id, f.conversation_id, f.space_id, f.role, f.content, f.created_at,
               c.title as conversation_title
        FROM fragments f
        JOIN conversations c ON f.conversation_id = c.id
        WHERE f.space_id = ?
          AND f.conversation_id != ?
          AND f.role = 'user'
        ORDER BY f.created_at DESC
        LIMIT ?
      `).all(spaceId, excludeConversationId, limit) as MemoryFragment[]
    } catch (error) {
      console.error('[Memory] getRecentFragments failed:', error)
      return []
    }
  }

  /**
   * Remove all indexed data for a conversation
   */
  removeConversation(conversationId: string): void {
    if (!this.db) return

    try {
      this.db.prepare('DELETE FROM fragments WHERE conversation_id = ?').run(conversationId)
      this.db.prepare('DELETE FROM conversations WHERE id = ?').run(conversationId)
    } catch (error) {
      console.error('[Memory] Failed to remove conversation:', error)
    }
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
      console.log('[Memory] Database closed')
    }
  }
}
