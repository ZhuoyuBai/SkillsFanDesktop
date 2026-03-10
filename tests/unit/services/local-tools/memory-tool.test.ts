import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSpace: vi.fn(),
  getMemoryIndexManager: vi.fn()
}))

vi.mock('../../../../src/main/services/space.service', () => ({
  getSpace: mocks.getSpace
}))

vi.mock('../../../../src/main/services/memory', () => ({
  getMemoryIndexManager: mocks.getMemoryIndexManager
}))

import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { executeMemoryCommand } from '../../../../src/main/services/local-tools/memory-tool'

describe('local memory tool', () => {
  let workspaceRoot = ''

  beforeEach(() => {
    vi.clearAllMocks()
    workspaceRoot = mkdtempSync(join(tmpdir(), 'skillsfan-memory-tool-'))
    mocks.getSpace.mockReturnValue({
      id: 'space-1',
      path: workspaceRoot,
      isTemp: false
    })
    mocks.getMemoryIndexManager.mockReturnValue({
      searchRelevant: vi.fn(() => [
        {
          id: 1,
          conversation_id: 'conv-a',
          conversation_title: 'Architecture notes',
          role: 'user',
          created_at: '2026-03-08T00:00:00.000Z',
          content: 'We decided to cache search results.'
        }
      ]),
      getRecentFragments: vi.fn(() => []),
      warmQueryEmbedding: vi.fn(async () => {})
    })
  })

  it('searches indexed cross-conversation memory', async () => {
    const result = await executeMemoryCommand({
      workDir: workspaceRoot,
      spaceId: 'space-1',
      conversationId: 'conv-current',
      command: 'search',
      query: 'search cache'
    })

    expect(result).toMatchObject({
      command: 'search',
      query: 'search cache',
      total: 1
    })
    expect((result.results as Array<Record<string, unknown>>)[0]?.conversationTitle).toBe('Architecture notes')
  })

  it('creates and updates MEMORY.md', async () => {
    const created = await executeMemoryCommand({
      workDir: workspaceRoot,
      spaceId: 'space-1',
      conversationId: 'conv-current',
      command: 'create',
      path: 'MEMORY.md',
      file_text: '# Project Memory\n- Keep tests fast'
    })

    expect(created).toMatchObject({
      command: 'create',
      path: 'MEMORY.md',
      isFileUpdate: false
    })

    const updated = await executeMemoryCommand({
      workDir: workspaceRoot,
      spaceId: 'space-1',
      conversationId: 'conv-current',
      command: 'insert',
      path: 'MEMORY.md',
      insert_line: 3,
      insert_text: '- Prefer MCP tools over hosted tools'
    })

    expect(updated).toMatchObject({
      command: 'insert',
      path: 'MEMORY.md',
      insertLine: 3
    })
    expect(readFileSync(join(workspaceRoot, 'MEMORY.md'), 'utf-8')).toContain('Prefer MCP tools over hosted tools')
  })

  it('rejects paths outside memory locations', async () => {
    await expect(executeMemoryCommand({
      workDir: workspaceRoot,
      spaceId: 'space-1',
      conversationId: 'conv-current',
      command: 'create',
      path: 'src/app.ts',
      file_text: 'console.log("no")'
    })).rejects.toThrow('Memory tool paths must stay inside MEMORY.md or memory/.')
  })

  it('cleans up workspace after each test', () => {
    expect(workspaceRoot).toBeTruthy()
  })

  afterEach(() => {
    if (workspaceRoot) {
      rmSync(workspaceRoot, { recursive: true, force: true })
      workspaceRoot = ''
    }
  })
})
