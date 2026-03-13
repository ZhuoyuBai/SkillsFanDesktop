import type { GatewayDoctorReport } from '../doctor'
import { collectLocalGatewayDoctorReport } from '../doctor'
import type { GatewayHealthStatus } from './health'
import { collectLocalGatewayHealth } from './health'
import { persistGatewaySnapshot } from './snapshots'

const SNAPSHOT_SYNC_INTERVAL_MS = 5000

let syncTimer: NodeJS.Timeout | null = null

export async function syncGatewaySnapshotsNow(
  options?: { processRole?: 'desktop-app' | 'external-gateway' }
): Promise<void> {
  if ((options?.processRole || 'desktop-app') !== 'external-gateway') {
    return
  }

  const health: GatewayHealthStatus = await collectLocalGatewayHealth()
  const doctor: GatewayDoctorReport = await collectLocalGatewayDoctorReport({ health })

  persistGatewaySnapshot('health', health)
  persistGatewaySnapshot('doctor', doctor)
}

export function initializeGatewaySnapshotSync(
  options?: { processRole?: 'desktop-app' | 'external-gateway' }
): void {
  if ((options?.processRole || 'desktop-app') !== 'external-gateway') {
    return
  }

  shutdownGatewaySnapshotSync()

  void syncGatewaySnapshotsNow(options)

  syncTimer = setInterval(() => {
    void syncGatewaySnapshotsNow(options)
  }, SNAPSHOT_SYNC_INTERVAL_MS)
  syncTimer.unref?.()
}

export function shutdownGatewaySnapshotSync(): void {
  if (!syncTimer) {
    return
  }

  clearInterval(syncTimer)
  syncTimer = null
}

export function resetGatewaySnapshotSyncForTests(): void {
  shutdownGatewaySnapshotSync()
}
