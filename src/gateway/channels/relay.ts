import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { NormalizedOutboundEvent } from '../../shared/types/channel'
import { atomicWriteJsonSync, safeReadJsonSync } from '../../main/utils/atomic-write'
import { getChannelManager } from '../../main/services/channel/channel-manager'
import { getGatewayProcessStatus } from '../process'

export type GatewayChannelRelayMode = 'inactive' | 'publishing' | 'consuming'

export interface GatewayChannelRelayStatus {
  enabled: boolean
  dir: string | null
  mode: GatewayChannelRelayMode
  consumerActive: boolean
  queuedEventCount: number
  lastPublishedAt: string | null
  lastConsumedAt: string | null
  lastError: string | null
}

interface GatewayConversationRelayEnvelope {
  version: 1
  id: string
  kind: 'conversation'
  createdAt: string
  event: NormalizedOutboundEvent
}

interface GatewayGlobalRelayEnvelope {
  version: 1
  id: string
  kind: 'global'
  createdAt: string
  channel: string
  data: Record<string, unknown>
}

type GatewayRelayEnvelope = GatewayConversationRelayEnvelope | GatewayGlobalRelayEnvelope

const RELAY_POLL_INTERVAL_MS = 100

let relayDir: string | null = null
let relayConsumerTimer: NodeJS.Timeout | null = null
let lastPublishedAt: string | null = null
let lastConsumedAt: string | null = null
let lastError: string | null = null

function getRelayQueueDir(): string | null {
  return relayDir ? join(relayDir, 'events') : null
}

function getRelayEnvelopePath(id: string): string | null {
  const dir = getRelayQueueDir()
  return dir ? join(dir, `${id}.json`) : null
}

function listRelayEnvelopePaths(): string[] {
  const dir = getRelayQueueDir()
  if (!dir || !existsSync(dir)) {
    return []
  }

  return readdirSync(dir)
    .filter((fileName) => fileName.endsWith('.json'))
    .map((fileName) => join(dir, fileName))
}

function listRelayEnvelopes(): GatewayRelayEnvelope[] {
  return listRelayEnvelopePaths()
    .map((filePath) => normalizeRelayEnvelope(
      safeReadJsonSync<GatewayRelayEnvelope | null>(filePath, null)
    ))
    .filter((envelope): envelope is GatewayRelayEnvelope => Boolean(envelope))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
}

function clearRelayConsumerTimer(): void {
  if (!relayConsumerTimer) {
    return
  }

  clearInterval(relayConsumerTimer)
  relayConsumerTimer = null
}

function normalizeRelayEnvelope(value: GatewayRelayEnvelope | null): GatewayRelayEnvelope | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  if (
    value.version !== 1
    || typeof value.id !== 'string'
    || typeof value.createdAt !== 'string'
    || (value.kind !== 'conversation' && value.kind !== 'global')
  ) {
    return null
  }

  if (value.kind === 'conversation') {
    const event = value.event
    if (
      !event
      || typeof event !== 'object'
      || typeof event.type !== 'string'
      || typeof event.spaceId !== 'string'
      || typeof event.conversationId !== 'string'
      || !event.payload
      || typeof event.payload !== 'object'
      || typeof event.timestamp !== 'number'
    ) {
      return null
    }
  } else if (
    typeof value.channel !== 'string'
    || !value.data
    || typeof value.data !== 'object'
  ) {
    return null
  }

  return value
}

function removeRelayEnvelope(id: string): void {
  const filePath = getRelayEnvelopePath(id)
  if (!filePath) {
    return
  }

  rmSync(filePath, { force: true })
  rmSync(filePath + '.bak', { force: true })
  rmSync(filePath + '.tmp', { force: true })
}

function getRelayMode(): GatewayChannelRelayMode {
  const processStatus = getGatewayProcessStatus()
  if (processStatus.configuredMode !== 'external') {
    return 'inactive'
  }

  if (processStatus.managedByCurrentProcess) {
    return 'publishing'
  }

  return relayConsumerTimer ? 'consuming' : 'inactive'
}

function writeRelayEnvelope(envelope: GatewayRelayEnvelope): void {
  const filePath = getRelayEnvelopePath(envelope.id)
  if (!filePath) {
    return
  }

  atomicWriteJsonSync(filePath, envelope, { backup: true })
  lastPublishedAt = envelope.createdAt
  lastError = null
}

export function configureGatewayChannelRelay(dir: string): void {
  relayDir = dir
  mkdirSync(join(dir, 'events'), { recursive: true })
}

export function shouldRelayGatewayChannelEvents(): boolean {
  return getRelayMode() === 'publishing'
}

export function relayGatewayConversationEvent(event: NormalizedOutboundEvent): void {
  if (!shouldRelayGatewayChannelEvents()) {
    return
  }

  writeRelayEnvelope({
    version: 1,
    id: randomUUID(),
    kind: 'conversation',
    createdAt: new Date().toISOString(),
    event
  })
}

export function relayGatewayGlobalEvent(
  channel: string,
  data: Record<string, unknown>
): void {
  if (!shouldRelayGatewayChannelEvents()) {
    return
  }

  writeRelayEnvelope({
    version: 1,
    id: randomUUID(),
    kind: 'global',
    createdAt: new Date().toISOString(),
    channel,
    data
  })
}

export function getGatewayChannelRelayStatus(): GatewayChannelRelayStatus {
  return {
    enabled: Boolean(relayDir),
    dir: relayDir,
    mode: getRelayMode(),
    consumerActive: Boolean(relayConsumerTimer),
    queuedEventCount: listRelayEnvelopePaths().length,
    lastPublishedAt,
    lastConsumedAt,
    lastError
  }
}

export async function processGatewayChannelRelayNow(
  options?: { processRole?: 'desktop-app' | 'external-gateway' }
): Promise<void> {
  if ((options?.processRole || 'desktop-app') !== 'desktop-app') {
    return
  }

  if (getGatewayProcessStatus().configuredMode !== 'external') {
    return
  }

  for (const envelope of listRelayEnvelopes()) {
    try {
      if (envelope.kind === 'conversation') {
        getChannelManager().dispatchEvent(envelope.event)
      } else {
        getChannelManager().dispatchGlobal(envelope.channel, envelope.data)
      }

      lastConsumedAt = new Date().toISOString()
      lastError = null
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    } finally {
      removeRelayEnvelope(envelope.id)
    }
  }
}

export function initializeGatewayChannelRelayRuntime(
  options?: { processRole?: 'desktop-app' | 'external-gateway' }
): void {
  if ((options?.processRole || 'desktop-app') !== 'desktop-app') {
    return
  }

  if (getGatewayProcessStatus().configuredMode !== 'external') {
    return
  }

  clearRelayConsumerTimer()
  void processGatewayChannelRelayNow(options)

  relayConsumerTimer = setInterval(() => {
    void processGatewayChannelRelayNow(options)
  }, RELAY_POLL_INTERVAL_MS)
  relayConsumerTimer.unref?.()
}

export function shutdownGatewayChannelRelayRuntime(): void {
  clearRelayConsumerTimer()
}

export function resetGatewayChannelRelayForTests(): void {
  clearRelayConsumerTimer()
  relayDir = null
  lastPublishedAt = null
  lastConsumedAt = null
  lastError = null
}
