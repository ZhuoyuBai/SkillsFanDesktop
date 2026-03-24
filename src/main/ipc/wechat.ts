/**
 * WeChat IPC Handlers - Settings Page Integration
 *
 * Provides IPC endpoints for the renderer to configure and control WeChat integration.
 */

import { getConfig, saveConfig } from '../services/config.service'
import { getChannelManager } from '../services/channel'
import { WeChatAccessControl } from '../services/wechat/access-control'
import { ipcHandle } from './utils'
import type { WeChatConfig, WeChatStatus } from '@shared/types/wechat'
import type { WeChatChannel } from '../services/channel/adapters/wechat.channel'

function getWeChatChannel(): WeChatChannel | undefined {
  return getChannelManager().getChannel<WeChatChannel>('wechat')
}

function getWeChatConfig(): WeChatConfig | undefined {
  const config = getConfig()
  return (config as Record<string, unknown>).wechat as WeChatConfig | undefined
}

export function registerWeChatHandlers(): void {
  // Get current status
  ipcHandle('wechat:status', (): WeChatStatus => {
    const channel = getWeChatChannel()
    if (!channel) {
      return { enabled: false, connected: false, activeSessions: 0 }
    }
    return channel.getStatus()
  })

  // Request QR code for login
  ipcHandle('wechat:get-qrcode', async () => {
    const channel = getWeChatChannel()
    if (!channel) throw new Error('WeChat channel not initialized')
    return await channel.getQRCode()
  })

  // Check QR code scan status
  ipcHandle('wechat:check-qrcode-status', async (_e, qrcode: string) => {
    const channel = getWeChatChannel()
    if (!channel) throw new Error('WeChat channel not initialized')
    return await channel.checkQRCodeStatus(qrcode)
  })

  // Logout
  ipcHandle('wechat:logout', async () => {
    const channel = getWeChatChannel()
    if (channel) {
      await channel.logout()
    }
  })

  // Regenerate pairing code
  ipcHandle('wechat:regenerate-pairing-code', () => {
    const config = getWeChatConfig()
    if (!config) throw new Error('WeChat not configured')

    const newCode = WeChatAccessControl.generatePairingCode()
    saveConfig({ wechat: { ...config, pairingCode: newCode } } as Record<string, unknown>)
    return newCode
  })

  // Revoke a user authorization
  ipcHandle('wechat:revoke-user', (_e, userId: string) => {
    const config = getWeChatConfig()
    if (!config) throw new Error('WeChat not configured')

    const newAllowed = config.allowedUserIds.filter(id => id !== userId)
    saveConfig({ wechat: { ...config, allowedUserIds: newAllowed } } as Record<string, unknown>)

    // Also remove the session mapping
    const channel = getWeChatChannel()
    if (channel) {
      channel.getSessionRouter().removeSession(userId)
    }
  })

  // Get authorized sessions list
  ipcHandle('wechat:get-sessions', () => {
    const channel = getWeChatChannel()
    return channel?.getSessionRouter().getAllSessions() ?? []
  })

  // Remove a session
  ipcHandle('wechat:remove-session', (_e, fromUserId: string) => {
    const channel = getWeChatChannel()
    if (channel) {
      channel.getSessionRouter().removeSession(fromUserId)
    }
  })

  // Set default space
  ipcHandle('wechat:set-default-space', (_e, spaceId: string | null) => {
    const config = getWeChatConfig()
    if (!config) throw new Error('WeChat not configured')
    saveConfig({ wechat: { ...config, defaultSpaceId: spaceId ?? undefined } } as Record<string, unknown>)
  })
}
