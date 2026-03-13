import { createOutboundEvent, getChannelManager } from '../../main/services/channel/channel-manager'

export function getGatewayChannelManager(): ReturnType<typeof getChannelManager> {
  return getChannelManager()
}

export function createGatewayOutboundEvent(
  channel: Parameters<typeof createOutboundEvent>[0],
  spaceId: Parameters<typeof createOutboundEvent>[1],
  conversationId: Parameters<typeof createOutboundEvent>[2],
  payload: Parameters<typeof createOutboundEvent>[3]
): ReturnType<typeof createOutboundEvent> {
  return createOutboundEvent(channel, spaceId, conversationId, payload)
}
