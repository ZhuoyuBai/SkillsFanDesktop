import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  configureGatewaySnapshotStore,
  loadGatewaySnapshot,
  persistGatewaySnapshot,
  resetGatewaySnapshotStoreForTests
} from '../../../../src/gateway/server/snapshots'

describe('gateway snapshots', () => {
  const snapshotDir = join(tmpdir(), `skillsfan-gateway-snapshots-${process.pid}`)

  beforeEach(() => {
    rmSync(snapshotDir, { recursive: true, force: true })
    mkdirSync(snapshotDir, { recursive: true })
    resetGatewaySnapshotStoreForTests()
    configureGatewaySnapshotStore(snapshotDir)
  })

  afterEach(() => {
    resetGatewaySnapshotStoreForTests()
    rmSync(snapshotDir, { recursive: true, force: true })
  })

  it('persists and loads gateway health snapshots', () => {
    persistGatewaySnapshot('health', {
      checkedAt: '2026-03-12T08:00:00.000Z',
      services: []
    })

    expect(loadGatewaySnapshot('health')).toEqual({
      checkedAt: '2026-03-12T08:00:00.000Z',
      services: []
    })
  })

  it('returns null for stale snapshots when maxAgeMs is exceeded', () => {
    writeFileSync(join(snapshotDir, 'doctor.json'), JSON.stringify({
      version: 1,
      kind: 'doctor',
      generatedAt: '2020-01-01T00:00:00.000Z',
      payload: {
        generatedAt: '2020-01-01T00:00:00.000Z',
        overallState: 'ok',
        checks: []
      }
    }))

    expect(loadGatewaySnapshot('doctor', { maxAgeMs: 1000 })).toBeNull()
  })
})
