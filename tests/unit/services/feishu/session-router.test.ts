/**
 * FeishuSessionRouter Unit Tests
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { getHaloDir } from '@main/services/config.service'
import {
  FeishuSessionRouter,
  hasFeishuConversationTarget,
  removePersistedFeishuSessionsByConversation,
  removePersistedFeishuSessionsBySpace
} from '@main/services/feishu/session-router'
import type { FeishuSessionMapping } from '@shared/types/feishu'

function getSessionsFilePath(): string {
  return path.join(getHaloDir(), 'feishu-sessions.json')
}

function writeConversation(spaceId: string, conversationId: string): void {
  const conversationsDir = spaceId === 'skillsfan-temp'
    ? path.join(getHaloDir(), 'temp', 'conversations')
    : path.join(getHaloDir(), 'spaces', spaceId, '.skillsfan', 'conversations')
  fs.mkdirSync(conversationsDir, { recursive: true })
  fs.writeFileSync(
    path.join(conversationsDir, `${conversationId}.json`),
    JSON.stringify({
      id: conversationId,
      spaceId,
      title: 'Feishu Test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
      messages: []
    }, null, 2),
    'utf-8'
  )
}

function writeSessions(sessions: FeishuSessionMapping[]): void {
  const filePath = getSessionsFilePath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(sessions, null, 2), 'utf-8')
}

function readSessions(): FeishuSessionMapping[] {
  const filePath = getSessionsFilePath()
  if (!fs.existsSync(filePath)) return []
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as FeishuSessionMapping[]
}

describe('FeishuSessionRouter', () => {
  it('should detect existing conversation target in temp space', () => {
    const conversationId = 'conv-existing'
    writeConversation('skillsfan-temp', conversationId)

    expect(hasFeishuConversationTarget('skillsfan-temp', conversationId)).toBe(true)
    expect(hasFeishuConversationTarget('skillsfan-temp', 'missing-conv-id')).toBe(false)
  })

  it('should prune stale session mappings on initialize', () => {
    const conversationId = 'conv-valid'
    writeConversation('skillsfan-temp', conversationId)
    const sessions: FeishuSessionMapping[] = [
      {
        chatId: 'chat-valid',
        chatType: 'p2p',
        chatName: 'Valid Chat',
        spaceId: 'skillsfan-temp',
        conversationId,
        pairedAt: Date.now(),
        lastMessageAt: Date.now()
      },
      {
        chatId: 'chat-stale',
        chatType: 'p2p',
        chatName: 'Stale Chat',
        spaceId: 'skillsfan-temp',
        conversationId: 'missing-conversation-id',
        pairedAt: Date.now(),
        lastMessageAt: Date.now()
      }
    ]
    writeSessions(sessions)

    const router = new FeishuSessionRouter()
    router.initialize()

    expect(router.getSession('chat-valid')?.conversationId).toBe(conversationId)
    expect(router.getSession('chat-stale')).toBeNull()

    const persisted = readSessions()
    expect(persisted).toHaveLength(1)
    expect(persisted[0].chatId).toBe('chat-valid')
  })

  it('should remove persisted sessions by conversation id', () => {
    const sessions: FeishuSessionMapping[] = [
      {
        chatId: 'chat-a',
        chatType: 'p2p',
        chatName: 'A',
        spaceId: 'skillsfan-temp',
        conversationId: 'conv-a',
        pairedAt: Date.now(),
        lastMessageAt: Date.now()
      },
      {
        chatId: 'chat-b',
        chatType: 'p2p',
        chatName: 'B',
        spaceId: 'skillsfan-temp',
        conversationId: 'conv-b',
        pairedAt: Date.now(),
        lastMessageAt: Date.now()
      }
    ]
    writeSessions(sessions)

    const removed = removePersistedFeishuSessionsByConversation('conv-a')
    expect(removed).toBe(1)

    const persisted = readSessions()
    expect(persisted).toHaveLength(1)
    expect(persisted[0].conversationId).toBe('conv-b')
  })

  it('should remove persisted sessions by space id', () => {
    const sessions: FeishuSessionMapping[] = [
      {
        chatId: 'chat-a',
        chatType: 'p2p',
        chatName: 'A',
        spaceId: 'skillsfan-temp',
        conversationId: 'conv-a',
        pairedAt: Date.now(),
        lastMessageAt: Date.now()
      },
      {
        chatId: 'chat-b',
        chatType: 'p2p',
        chatName: 'B',
        spaceId: 'custom-space',
        conversationId: 'conv-b',
        pairedAt: Date.now(),
        lastMessageAt: Date.now()
      }
    ]
    writeSessions(sessions)

    const removed = removePersistedFeishuSessionsBySpace('skillsfan-temp')
    expect(removed).toBe(1)

    const persisted = readSessions()
    expect(persisted).toHaveLength(1)
    expect(persisted[0].spaceId).toBe('custom-space')
  })
})
