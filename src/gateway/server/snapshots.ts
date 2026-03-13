import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { atomicWriteJsonSync, safeReadJsonSync } from '../../main/utils/atomic-write'

export type GatewaySnapshotKind = 'health' | 'doctor'

interface GatewaySnapshotEnvelope<T> {
  version: 1
  kind: GatewaySnapshotKind
  generatedAt: string
  payload: T
}

let snapshotDir: string | null = null

function getSnapshotPath(kind: GatewaySnapshotKind): string | null {
  if (!snapshotDir) {
    return null
  }

  return join(snapshotDir, `${kind}.json`)
}

export function configureGatewaySnapshotStore(dir: string): void {
  snapshotDir = dir
  mkdirSync(dir, { recursive: true })
}

export function persistGatewaySnapshot<T>(kind: GatewaySnapshotKind, payload: T): void {
  const filePath = getSnapshotPath(kind)
  if (!filePath) {
    return
  }

  const envelope: GatewaySnapshotEnvelope<T> = {
    version: 1,
    kind,
    generatedAt: new Date().toISOString(),
    payload
  }

  atomicWriteJsonSync(filePath, envelope, { backup: true })
}

export function loadGatewaySnapshot<T>(
  kind: GatewaySnapshotKind,
  options?: { maxAgeMs?: number }
): T | null {
  const filePath = getSnapshotPath(kind)
  if (!filePath || !existsSync(filePath)) {
    return null
  }

  const envelope = safeReadJsonSync<GatewaySnapshotEnvelope<T> | null>(filePath, null)
  if (
    !envelope
    || typeof envelope !== 'object'
    || envelope.version !== 1
    || envelope.kind !== kind
    || typeof envelope.generatedAt !== 'string'
  ) {
    return null
  }

  const maxAgeMs = options?.maxAgeMs
  if (typeof maxAgeMs === 'number') {
    const ageMs = Date.now() - Date.parse(envelope.generatedAt)
    if (!Number.isFinite(ageMs) || ageMs > maxAgeMs) {
      return null
    }
  }

  return envelope.payload
}

export function getGatewaySnapshotStoreDir(): string | null {
  return snapshotDir
}

export function resetGatewaySnapshotStoreForTests(): void {
  snapshotDir = null
}
