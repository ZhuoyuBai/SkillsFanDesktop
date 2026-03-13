import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  collectLocalGatewayHealth: vi.fn(async () => ({
    checkedAt: '2026-03-12T08:00:00.000Z'
  })),
  collectLocalGatewayDoctorReport: vi.fn(async () => ({
    generatedAt: '2026-03-12T08:00:01.000Z',
    overallState: 'ok',
    checks: []
  })),
  persistGatewaySnapshot: vi.fn(() => {})
}))

vi.mock('../../../../src/gateway/server/health', () => ({
  collectLocalGatewayHealth: mocks.collectLocalGatewayHealth
}))

vi.mock('../../../../src/gateway/doctor', () => ({
  collectLocalGatewayDoctorReport: mocks.collectLocalGatewayDoctorReport
}))

vi.mock('../../../../src/gateway/server/snapshots', () => ({
  persistGatewaySnapshot: mocks.persistGatewaySnapshot
}))

import {
  initializeGatewaySnapshotSync,
  resetGatewaySnapshotSyncForTests,
  shutdownGatewaySnapshotSync,
  syncGatewaySnapshotsNow
} from '../../../../src/gateway/server/snapshot-sync'

describe('gateway snapshot sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetGatewaySnapshotSyncForTests()
  })

  it('persists health and doctor snapshots for the external gateway process', async () => {
    await syncGatewaySnapshotsNow({
      processRole: 'external-gateway'
    })

    expect(mocks.collectLocalGatewayHealth).toHaveBeenCalledTimes(1)
    expect(mocks.collectLocalGatewayDoctorReport).toHaveBeenCalledWith({
      health: {
        checkedAt: '2026-03-12T08:00:00.000Z'
      }
    })
    expect(mocks.persistGatewaySnapshot).toHaveBeenNthCalledWith(1, 'health', {
      checkedAt: '2026-03-12T08:00:00.000Z'
    })
    expect(mocks.persistGatewaySnapshot).toHaveBeenNthCalledWith(2, 'doctor', {
      generatedAt: '2026-03-12T08:00:01.000Z',
      overallState: 'ok',
      checks: []
    })
  })

  it('skips snapshot sync outside the external gateway process role', async () => {
    await syncGatewaySnapshotsNow({
      processRole: 'desktop-app'
    })

    expect(mocks.collectLocalGatewayHealth).not.toHaveBeenCalled()
    expect(mocks.persistGatewaySnapshot).not.toHaveBeenCalled()
  })

  it('starts interval sync only for the external gateway process role', async () => {
    vi.useFakeTimers()

    initializeGatewaySnapshotSync({
      processRole: 'external-gateway'
    })
    await vi.runOnlyPendingTimersAsync()

    expect(mocks.collectLocalGatewayHealth).toHaveBeenCalled()

    shutdownGatewaySnapshotSync()
    vi.useRealTimers()
  })
})
