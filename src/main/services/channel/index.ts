/**
 * Channel Module - Message Normalization Layer
 *
 * Provides a channel abstraction for multi-transport communication.
 * Each channel adapter normalizes messages to a standard format,
 * enabling the agent service to remain transport-agnostic.
 */

export type { Channel } from './channel.interface'
export { ChannelManager, getChannelManager, createOutboundEvent } from './channel-manager'
export { ElectronChannel } from './adapters/electron.channel'
export { RemoteWebChannel } from './adapters/remote-web.channel'
export { FeishuChannel } from './adapters/feishu.channel'
