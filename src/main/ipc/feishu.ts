/**
 * Feishu IPC Handlers - Settings Page Integration
 *
 * Provides IPC endpoints for the renderer to configure and control the Feishu bot.
 */

import { getConfig, saveConfig } from '../services/config.service'
import { getChannelManager } from '../services/channel'
import { FeishuBotService } from '../services/feishu'
import { FeishuAccessControl } from '../services/feishu/access-control'
import { ipcHandle } from './utils'
import type { FeishuConfig, FeishuStatus } from '@shared/types/feishu'
import type { FeishuChannel } from '../services/channel/adapters/feishu.channel'

function getFeishuChannel(): FeishuChannel | undefined {
  return getChannelManager().getChannel<FeishuChannel>('feishu')
}

function getFeishuConfig(): FeishuConfig | undefined {
  const config = getConfig()
  return (config as Record<string, unknown>).feishu as FeishuConfig | undefined
}

export function registerFeishuHandlers(): void {
  // Get current status
  ipcHandle('feishu:status', (): FeishuStatus => {
    const channel = getFeishuChannel()
    if (!channel) {
      return { enabled: false, connected: false, activeSessions: 0 }
    }
    const status = channel.getBotService().getStatus()
    status.activeSessions = channel.getSessionRouter().getSessionCount()
    return status
  })

  // Test connection with given credentials
  ipcHandle('feishu:test-connection', async (_e, appId: string, appSecret: string) => {
    const botService = new FeishuBotService()
    return await botService.testConnection(appId, appSecret)
  })

  // Set credentials and save to config
  ipcHandle('feishu:set-credentials', (_e, appId: string, appSecret: string) => {
    const existing = getFeishuConfig()
    const feishuConfig: FeishuConfig = {
      enabled: existing?.enabled ?? false,
      appId,
      appSecret,
      pairingCode: existing?.pairingCode || FeishuAccessControl.generatePairingCode(),
      allowedChatIds: existing?.allowedChatIds ?? [],
      defaultSpaceId: existing?.defaultSpaceId,
      groupPolicy: existing?.groupPolicy ?? 'mention'
    }
    saveConfig({ feishu: feishuConfig } as Record<string, unknown>)
    return feishuConfig
  })

  // Enable the bot
  ipcHandle('feishu:enable', async () => {
    const config = getFeishuConfig()
    if (!config?.appId || !config?.appSecret) {
      throw new Error('App ID and App Secret are required')
    }

    const updatedConfig = { ...config, enabled: true }
    saveConfig({ feishu: updatedConfig } as Record<string, unknown>)

    const channel = getFeishuChannel()
    if (channel) {
      await channel.enable(updatedConfig)
    }
  })

  // Disable the bot
  ipcHandle('feishu:disable', async () => {
    const config = getFeishuConfig()
    if (config) {
      saveConfig({ feishu: { ...config, enabled: false } } as Record<string, unknown>)
    }

    const channel = getFeishuChannel()
    if (channel) {
      await channel.disable()
    }
  })

  // Regenerate pairing code
  ipcHandle('feishu:regenerate-pairing-code', () => {
    const config = getFeishuConfig()
    if (!config) throw new Error('Feishu not configured')

    const newCode = FeishuAccessControl.generatePairingCode()
    saveConfig({ feishu: { ...config, pairingCode: newCode } } as Record<string, unknown>)
    return newCode
  })

  // Revoke a chat authorization
  ipcHandle('feishu:revoke-chat', (_e, chatId: string) => {
    const config = getFeishuConfig()
    if (!config) throw new Error('Feishu not configured')

    const newAllowed = config.allowedChatIds.filter(id => id !== chatId)
    saveConfig({ feishu: { ...config, allowedChatIds: newAllowed } } as Record<string, unknown>)

    // Also remove the session mapping
    const channel = getFeishuChannel()
    if (channel) {
      channel.getSessionRouter().removeSession(chatId)
    }
  })

  // Get authorized sessions list
  ipcHandle('feishu:get-sessions', () => {
    const channel = getFeishuChannel()
    return channel?.getSessionRouter().getAllSessions() ?? []
  })

  // Update group policy
  ipcHandle('feishu:set-group-policy', (_e, policy: 'mention' | 'all' | 'disabled') => {
    const config = getFeishuConfig()
    if (!config) throw new Error('Feishu not configured')
    saveConfig({ feishu: { ...config, groupPolicy: policy } } as Record<string, unknown>)
  })

  // Set default space
  ipcHandle('feishu:set-default-space', (_e, spaceId: string | null) => {
    const config = getFeishuConfig()
    if (!config) throw new Error('Feishu not configured')
    saveConfig({ feishu: { ...config, defaultSpaceId: spaceId ?? undefined } } as Record<string, unknown>)
  })
}
