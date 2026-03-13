import type { WebSocketClient, SendStrategy } from '../../main/http/websocket'
import {
  broadcastToAll as legacyBroadcastToAll,
  broadcastToWebSocket as legacyBroadcastToWebSocket,
  checkSlowConsumer as legacyCheckSlowConsumer,
  flushThrottled as legacyFlushThrottled,
  getClientCount as legacyGetClientCount,
  getSendStrategy as legacyGetSendStrategy,
  initWebSocket as legacyInitWebSocket,
  sendThrottled as legacySendThrottled,
  sendToClientEnhanced as legacySendToClientEnhanced,
  shutdownWebSocket as legacyShutdownWebSocket
} from '../../main/http/websocket'

export type { WebSocketClient, SendStrategy }

export function initWebSocket(server: Parameters<typeof legacyInitWebSocket>[0]): void {
  legacyInitWebSocket(server)
}

export function shutdownWebSocket(): void {
  legacyShutdownWebSocket()
}

export function broadcastToWebSocket(channel: string, data: Record<string, unknown>): void {
  legacyBroadcastToWebSocket(channel, data)
}

export function broadcastToAll(message: object): void {
  legacyBroadcastToAll(message)
}

export function getClientCount(): number {
  return legacyGetClientCount()
}

export function getSendStrategy(channel: string): SendStrategy {
  return legacyGetSendStrategy(channel)
}

export function checkSlowConsumer(client: WebSocketClient): ReturnType<typeof legacyCheckSlowConsumer> {
  return legacyCheckSlowConsumer(client)
}

export function sendToClientEnhanced(
  client: WebSocketClient,
  message: object,
  strategy: SendStrategy
): boolean {
  return legacySendToClientEnhanced(client, message, strategy)
}

export function sendThrottled(
  client: WebSocketClient,
  conversationId: string,
  channel: string,
  data: Record<string, unknown>
): void {
  legacySendThrottled(client, conversationId, channel, data)
}

export function flushThrottled(
  client: WebSocketClient,
  conversationId: string,
  channel: string
): void {
  legacyFlushThrottled(client, conversationId, channel)
}
