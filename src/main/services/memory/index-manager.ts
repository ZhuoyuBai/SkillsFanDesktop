/**
 * Memory Index Manager - SQLite cross-conversation memory
 *
 * Indexes conversation messages and provides hybrid search
 * across conversations within the same space.
 *
 * Search strategy:
 * 1. Semantic search via sqlite-vec (vector similarity)
 * 2. LIKE-based substring matching (keyword fallback)
 *
 * Hybrid approach: vector search finds semantically related content
 * (e.g., "Python crawler" matches "requests web scraping"),
 * while LIKE search catches exact keyword matches.
 *
 * Uses better-sqlite3 with WAL journal mode for performance.
 */

import Database from 'better-sqlite3'
import { join } from 'path'
import { getHaloDir } from '../config.service'
import { extractSearchKeywords } from './query-builder'
import {
  generateEmbedding,
  embeddingToBuffer,
  getEmbeddingDim,
  isEmbeddingReady
} from './embedding'

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

// Embeddings stored in a regular table (fragment_id links to fragments.id)
const EMBEDDING_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS fragment_embeddings (
  fragment_id INTEGER PRIMARY KEY,
  space_id TEXT NOT NULL,
  embedding BLOB NOT NULL,
  FOREIGN KEY (fragment_id) REFERENCES fragments(id)
);

CREATE INDEX IF NOT EXISTS idx_embeddings_space ON fragment_embeddings(space_id);
`

export class MemoryIndexManager {
  private db: Database.Database | null = null
  private _enabled: boolean = true
  private _retentionDays: number = 0
  private _semanticSearchEnabled: boolean = true
  private vecExtensionLoaded: boolean = false

  /**
   * Update cached config values (called when config changes)
   */
  updateConfig(enabled: boolean, retentionDays: number, semanticSearch?: boolean): void {
    this._enabled = enabled
    this._retentionDays = retentionDays
    if (semanticSearch !== undefined) {
      this._semanticSearchEnabled = semanticSearch
    }
    console.log(`[Memory] Config updated: enabled=${enabled}, retentionDays=${retentionDays}, semantic=${this._semanticSearchEnabled}`)
  }

  get enabled(): boolean { return this._enabled }
  get retentionDays(): number { return this._retentionDays }
  get semanticSearchEnabled(): boolean { return this._semanticSearchEnabled }

  /**
   * Calculate the cutoff date based on retention setting.
   * Returns null if retention is "forever" (0).
   */
  private getRetentionCutoff(): string | null {
    if (this._retentionDays <= 0) return null
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - this._retentionDays)
    return cutoff.toISOString()
  }

  /**
   * Load sqlite-vec extension for vector search support
   */
  private loadVecExtension(): void {
    if (!this.db || this.vecExtensionLoaded) return

    try {
      const sqliteVec = require('sqlite-vec')
      sqliteVec.load(this.db)
      this.vecExtensionLoaded = true
      console.log('[Memory] sqlite-vec extension loaded')
    } catch (error) {
      console.warn('[Memory] sqlite-vec extension not available, falling back to keyword search:', error)
    }
  }

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

    // Load vector extension and create embedding table
    this.loadVecExtension()
    if (this.vecExtensionLoaded) {
      try {
        this.db.exec(EMBEDDING_SCHEMA_SQL)
        console.log('[Memory] Embedding schema ready')
      } catch (error) {
        console.warn('[Memory] Failed to create embedding schema:', error)
        this.vecExtensionLoaded = false
      }
    }

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
      const result = this.db.prepare(`
        INSERT INTO fragments (conversation_id, space_id, role, content, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(conversationId, spaceId, role, truncated, timestamp)

      // Async: generate and store embedding
      if (this._semanticSearchEnabled && this.vecExtensionLoaded) {
        const fragmentId = result.lastInsertRowid as number
        this.indexEmbeddingAsync(fragmentId, spaceId, truncated)
      }
    } catch (error) {
      console.error('[Memory] Failed to index message:', error)
    }
  }

  /**
   * Asynchronously generate and store embedding for a fragment
   */
  private indexEmbeddingAsync(fragmentId: number, spaceId: string, content: string): void {
    setImmediate(async () => {
      try {
        const embedding = await generateEmbedding(content)
        if (!embedding || !this.db) return

        const buffer = embeddingToBuffer(embedding)
        this.db.prepare(`
          INSERT OR REPLACE INTO fragment_embeddings (fragment_id, space_id, embedding)
          VALUES (?, ?, ?)
        `).run(fragmentId, spaceId, buffer)
      } catch (error) {
        // Non-critical: embedding index failure doesn't affect keyword search
        console.debug('[Memory] Embedding indexing failed for fragment', fragmentId)
      }
    })
  }

  /**
   * Hybrid search: combines vector similarity and keyword matching.
   *
   * Strategy:
   * 1. If semantic search available: vector search top-K
   * 2. LIKE keyword search
   * 3. Merge and deduplicate, prioritizing vector matches
   */
  searchRelevant(
    spaceId: string,
    query: string,
    excludeConversationId: string,
    limit: number = 5
  ): MemoryFragment[] {
    if (!this.db) return []

    // Try semantic search first
    let semanticResults: MemoryFragment[] = []
    if (this._semanticSearchEnabled && this.vecExtensionLoaded && isEmbeddingReady()) {
      semanticResults = this.searchSemanticSync(spaceId, query, excludeConversationId, limit)
    }

    // Always do keyword search as supplement
    const keywordResults = this.searchByKeywords(spaceId, query, excludeConversationId, limit)

    // Merge: semantic results first, then keyword results (deduplicated)
    const seen = new Set<number>()
    const merged: MemoryFragment[] = []

    for (const fragment of [...semanticResults, ...keywordResults]) {
      if (!seen.has(fragment.id)) {
        seen.add(fragment.id)
        merged.push(fragment)
      }
    }

    return merged.slice(0, limit)
  }

  /**
   * Synchronous wrapper for semantic search.
   * Starts async embedding generation but returns empty if not ready.
   * On subsequent calls (after embedding is generated), returns actual results.
   */
  private searchSemanticSync(
    spaceId: string,
    query: string,
    excludeConversationId: string,
    limit: number
  ): MemoryFragment[] {
    // We need the query embedding - kick off generation
    // For now, we'll use a cached approach
    return this.searchSemanticDirect(spaceId, query, excludeConversationId, limit)
  }

  /**
   * Search using vector similarity via manual cosine distance calculation.
   * Uses the fragment_embeddings table directly.
   */
  private searchSemanticDirect(
    spaceId: string,
    query: string,
    excludeConversationId: string,
    limit: number
  ): MemoryFragment[] {
    if (!this.db) return []

    // Generate query embedding synchronously is not possible with async transformers
    // So we use a fire-and-forget pattern: store the last query embedding
    // and use it for the NEXT search (or return empty on first call)
    const cachedEmbedding = this.getCachedQueryEmbedding(query)
    if (!cachedEmbedding) {
      // Fire off embedding generation for next time
      this.cacheQueryEmbedding(query)
      return []
    }

    const cutoff = this.getRetentionCutoff()

    try {
      // Get all embeddings for this space (excluding current conversation)
      let timeFilter = ''
      const params: unknown[] = [spaceId, excludeConversationId]
      if (cutoff) {
        timeFilter = 'AND f.created_at >= ?'
        params.push(cutoff)
      }

      const rows = this.db.prepare(`
        SELECT e.fragment_id, e.embedding, f.id, f.conversation_id, f.space_id,
               f.role, f.content, f.created_at, c.title as conversation_title
        FROM fragment_embeddings e
        JOIN fragments f ON e.fragment_id = f.id
        JOIN conversations c ON f.conversation_id = c.id
        WHERE e.space_id = ?
          AND f.conversation_id != ?
          ${timeFilter}
      `).all(...params) as any[]

      if (rows.length === 0) return []

      // Calculate cosine similarity for each row
      const scored = rows.map(row => {
        const embedding = new Float32Array(
          row.embedding.buffer,
          row.embedding.byteOffset,
          row.embedding.byteLength / 4
        )
        const similarity = cosineSimilarity(cachedEmbedding, embedding)
        return { ...row, similarity }
      })

      // Sort by similarity (descending) and take top results
      scored.sort((a, b) => b.similarity - a.similarity)

      return scored.slice(0, limit).filter(r => r.similarity > 0.3).map(row => ({
        id: row.id,
        conversation_id: row.conversation_id,
        space_id: row.space_id,
        role: row.role,
        content: row.content,
        created_at: row.created_at,
        conversation_title: row.conversation_title
      }))
    } catch (error) {
      console.error('[Memory] Semantic search failed:', error)
      return []
    }
  }

  // Query embedding cache (small, keyed by query text)
  private queryEmbeddingCache = new Map<string, Float32Array>()

  private getCachedQueryEmbedding(query: string): Float32Array | null {
    // Use first 200 chars as cache key
    const key = query.slice(0, 200)
    return this.queryEmbeddingCache.get(key) || null
  }

  private cacheQueryEmbedding(query: string): void {
    const key = query.slice(0, 200)
    generateEmbedding(query).then(embedding => {
      if (embedding) {
        this.queryEmbeddingCache.set(key, embedding)
        // Keep cache small
        if (this.queryEmbeddingCache.size > 50) {
          const firstKey = this.queryEmbeddingCache.keys().next().value
          if (firstKey) this.queryEmbeddingCache.delete(firstKey)
        }
      }
    }).catch(() => {})
  }

  /**
   * Pre-warm the query embedding cache for a query.
   * Call this before searchRelevant() to ensure semantic results are available.
   */
  async warmQueryEmbedding(query: string): Promise<void> {
    const key = query.slice(0, 200)
    if (this.queryEmbeddingCache.has(key)) return

    const embedding = await generateEmbedding(query)
    if (embedding) {
      this.queryEmbeddingCache.set(key, embedding)
      if (this.queryEmbeddingCache.size > 50) {
        const firstKey = this.queryEmbeddingCache.keys().next().value
        if (firstKey) this.queryEmbeddingCache.delete(firstKey)
      }
    }
  }

  /**
   * Search using LIKE substring matching (original keyword-based search).
   */
  searchByKeywords(
    spaceId: string,
    query: string,
    excludeConversationId: string,
    limit: number = 5
  ): MemoryFragment[] {
    if (!this.db) return []

    const keywords = extractSearchKeywords(query)
    if (keywords.length === 0) return []

    const cutoff = this.getRetentionCutoff()

    // Build LIKE conditions: match against both content AND conversation title
    const contentConditions = keywords.map(() => 'f.content LIKE ?').join(' OR ')
    const titleConditions = keywords.map(() => 'c.title LIKE ?').join(' OR ')
    const params: unknown[] = [
      ...keywords.map(kw => `%${kw}%`),  // for content conditions
      ...keywords.map(kw => `%${kw}%`)   // for title conditions
    ]

    let timeFilter = ''
    if (cutoff) {
      timeFilter = 'AND f.created_at >= ?'
      params.push(cutoff)
    }

    try {
      return this.db.prepare(`
        SELECT f.id, f.conversation_id, f.space_id, f.role, f.content, f.created_at,
               c.title as conversation_title
        FROM fragments f
        JOIN conversations c ON f.conversation_id = c.id
        WHERE ((${contentConditions}) OR (${titleConditions}))
          AND f.space_id = ?
          AND f.conversation_id != ?
          ${timeFilter}
        ORDER BY f.created_at DESC
        LIMIT ?
      `).all(...params, spaceId, excludeConversationId, limit) as MemoryFragment[]
    } catch (error) {
      console.error('[Memory] Keyword search failed:', error)
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

    const cutoff = this.getRetentionCutoff()
    const params: unknown[] = [spaceId, excludeConversationId]
    let timeFilter = ''
    if (cutoff) {
      timeFilter = 'AND f.created_at >= ?'
      params.push(cutoff)
    }

    try {
      return this.db.prepare(`
        SELECT f.id, f.conversation_id, f.space_id, f.role, f.content, f.created_at,
               c.title as conversation_title
        FROM fragments f
        JOIN conversations c ON f.conversation_id = c.id
        WHERE f.space_id = ?
          AND f.conversation_id != ?
          AND f.role = 'user'
          ${timeFilter}
        ORDER BY f.created_at DESC
        LIMIT ?
      `).all(...params, limit) as MemoryFragment[]
    } catch (error) {
      console.error('[Memory] getRecentFragments failed:', error)
      return []
    }
  }

  /**
   * Reindex all existing fragments with embeddings (background task).
   * Call this once after enabling semantic search on existing data.
   */
  async reindexEmbeddings(onProgress?: (done: number, total: number) => void): Promise<void> {
    if (!this.db || !this.vecExtensionLoaded) return

    const rows = this.db.prepare(`
      SELECT f.id, f.space_id, f.content
      FROM fragments f
      LEFT JOIN fragment_embeddings e ON f.id = e.fragment_id
      WHERE e.fragment_id IS NULL
    `).all() as { id: number; space_id: string; content: string }[]

    console.log(`[Memory] Reindexing ${rows.length} fragments with embeddings`)

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      try {
        const embedding = await generateEmbedding(row.content)
        if (embedding && this.db) {
          const buffer = embeddingToBuffer(embedding)
          this.db.prepare(`
            INSERT OR REPLACE INTO fragment_embeddings (fragment_id, space_id, embedding)
            VALUES (?, ?, ?)
          `).run(row.id, row.space_id, buffer)
        }
      } catch {
        // Skip failed items
      }

      if (onProgress && (i + 1) % 10 === 0) {
        onProgress(i + 1, rows.length)
      }
    }

    console.log(`[Memory] Reindexing complete: ${rows.length} fragments processed`)
  }

  /**
   * Remove all indexed data for a conversation
   */
  removeConversation(conversationId: string): void {
    if (!this.db) return

    try {
      // Remove embeddings for this conversation's fragments
      if (this.vecExtensionLoaded) {
        this.db.prepare(`
          DELETE FROM fragment_embeddings
          WHERE fragment_id IN (SELECT id FROM fragments WHERE conversation_id = ?)
        `).run(conversationId)
      }

      this.db.prepare('DELETE FROM fragments WHERE conversation_id = ?').run(conversationId)
      this.db.prepare('DELETE FROM conversations WHERE id = ?').run(conversationId)
    } catch (error) {
      console.error('[Memory] Failed to remove conversation:', error)
    }
  }

  /**
   * Clear all memory fragments for a specific space.
   */
  clearBySpace(spaceId: string): { deletedFragments: number; deletedConversations: number } {
    if (!this.db) return { deletedFragments: 0, deletedConversations: 0 }

    try {
      // Clear embeddings for this space
      if (this.vecExtensionLoaded) {
        this.db.prepare('DELETE FROM fragment_embeddings WHERE space_id = ?').run(spaceId)
      }

      const fragResult = this.db.prepare('DELETE FROM fragments WHERE space_id = ?').run(spaceId)
      const convResult = this.db.prepare('DELETE FROM conversations WHERE space_id = ?').run(spaceId)
      console.log(`[Memory] Cleared space ${spaceId}: ${fragResult.changes} fragments, ${convResult.changes} conversations`)
      return {
        deletedFragments: fragResult.changes,
        deletedConversations: convResult.changes
      }
    } catch (error) {
      console.error('[Memory] Failed to clear space:', error)
      return { deletedFragments: 0, deletedConversations: 0 }
    }
  }

  /**
   * Clear ALL memory fragments and conversations across all spaces.
   */
  clearAll(): { deletedFragments: number; deletedConversations: number } {
    if (!this.db) return { deletedFragments: 0, deletedConversations: 0 }

    try {
      // Clear all embeddings
      if (this.vecExtensionLoaded) {
        this.db.prepare('DELETE FROM fragment_embeddings').run()
      }

      const fragResult = this.db.prepare('DELETE FROM fragments').run()
      const convResult = this.db.prepare('DELETE FROM conversations').run()
      console.log(`[Memory] Cleared all: ${fragResult.changes} fragments, ${convResult.changes} conversations`)
      return {
        deletedFragments: fragResult.changes,
        deletedConversations: convResult.changes
      }
    } catch (error) {
      console.error('[Memory] Failed to clear all:', error)
      return { deletedFragments: 0, deletedConversations: 0 }
    }
  }

  /**
   * Get memory stats for a specific space
   */
  getSpaceStats(spaceId: string): { fragmentCount: number; conversationCount: number; embeddingCount: number } {
    if (!this.db) return { fragmentCount: 0, conversationCount: 0, embeddingCount: 0 }

    try {
      const fragRow = this.db.prepare(
        'SELECT COUNT(*) as count FROM fragments WHERE space_id = ?'
      ).get(spaceId) as { count: number }
      const convRow = this.db.prepare(
        'SELECT COUNT(*) as count FROM conversations WHERE space_id = ?'
      ).get(spaceId) as { count: number }

      let embeddingCount = 0
      if (this.vecExtensionLoaded) {
        const embRow = this.db.prepare(
          'SELECT COUNT(*) as count FROM fragment_embeddings WHERE space_id = ?'
        ).get(spaceId) as { count: number }
        embeddingCount = embRow.count
      }

      return {
        fragmentCount: fragRow.count,
        conversationCount: convRow.count,
        embeddingCount
      }
    } catch (error) {
      console.error('[Memory] Failed to get stats:', error)
      return { fragmentCount: 0, conversationCount: 0, embeddingCount: 0 }
    }
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
      this.queryEmbeddingCache.clear()
      console.log('[Memory] Database closed')
    }
  }
}

/**
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0

  let dot = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}
