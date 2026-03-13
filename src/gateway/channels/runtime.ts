import type { BrowserWindow } from 'electron'
import type { FeishuStatus } from '../../shared/types/feishu'
import {
  getGatewayChannelRelayStatus,
  type GatewayChannelRelayStatus
} from './relay'
import {
  ElectronChannel,
  FeishuChannel,
  RemoteWebChannel,
  getChannelManager
} from '../../main/services/channel'

export interface GatewayFeishuChannelStatus extends FeishuStatus {
  registered: boolean
}

export interface GatewayChannelStatus {
  coreInitialized: boolean
  optionalInitialized: boolean
  registeredChannelIds: string[]
  feishu: GatewayFeishuChannelStatus
  relay: GatewayChannelRelayStatus
}

let coreInitialized = false
let optionalInitialized = false

function getFeishuChannelStatus(channel?: FeishuChannel): GatewayFeishuChannelStatus {
  if (!channel) {
    return {
      registered: false,
      enabled: false,
      connected: false,
      activeSessions: 0
    }
  }

  const status = channel.getBotService().getStatus()
  status.activeSessions = channel.getSessionRouter().getSessionCount()

  return {
    registered: true,
    ...status
  }
}

async function ensureElectronChannel(mainWindow: BrowserWindow | null): Promise<void> {
  if (!mainWindow) {
    return
  }

  const manager = getChannelManager()
  let electronChannel = manager.getChannel<ElectronChannel>('electron')

  if (!electronChannel) {
    electronChannel = new ElectronChannel()
    manager.registerChannel(electronChannel)
    await electronChannel.initialize()
  }

  electronChannel.setMainWindow(mainWindow)
}

async function ensureRemoteWebChannel(): Promise<void> {
  const manager = getChannelManager()
  let remoteWebChannel = manager.getChannel<RemoteWebChannel>('remote-web')

  if (!remoteWebChannel) {
    remoteWebChannel = new RemoteWebChannel()
    manager.registerChannel(remoteWebChannel)
    await remoteWebChannel.initialize()
  }
}

export function getGatewayFeishuChannel(): FeishuChannel | undefined {
  return getChannelManager().getChannel<FeishuChannel>('feishu')
}

export async function initializeGatewayCoreChannels(mainWindow: BrowserWindow | null): Promise<GatewayChannelStatus> {
  await ensureElectronChannel(mainWindow)
  await ensureRemoteWebChannel()
  coreInitialized = true

  return getGatewayChannelStatus()
}

export async function initializeGatewayOptionalChannels(): Promise<GatewayChannelStatus> {
  const manager = getChannelManager()
  let feishuChannel = manager.getChannel<FeishuChannel>('feishu')

  if (!feishuChannel) {
    feishuChannel = new FeishuChannel()
    manager.registerChannel(feishuChannel)
  }

  if (!optionalInitialized) {
    await feishuChannel.initialize()
    optionalInitialized = true
  }

  return getGatewayChannelStatus()
}

export async function shutdownGatewayOptionalChannels(): Promise<void> {
  const feishuChannel = getGatewayFeishuChannel()
  if (feishuChannel && optionalInitialized) {
    await feishuChannel.shutdown()
  }

  optionalInitialized = false
}

export function getGatewayChannelStatus(): GatewayChannelStatus {
  const manager = getChannelManager()
  const feishuChannel = getGatewayFeishuChannel()

  return {
    coreInitialized,
    optionalInitialized,
    registeredChannelIds: manager.getChannelIds(),
    feishu: getFeishuChannelStatus(feishuChannel),
    relay: getGatewayChannelRelayStatus()
  }
}

export function resetGatewayChannelsForTests(): void {
  coreInitialized = false
  optionalInitialized = false
}
