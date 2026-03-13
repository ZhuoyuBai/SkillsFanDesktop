import {
  getGatewaySubagentRuntimeStatus,
  initializeGatewaySubagentRuntime,
  shutdownGatewaySubagentRuntime,
  type HostedSubagentRuntimeStatus
} from './subagents'
import { getGatewayRalphStatus, type GatewayRalphStatus } from './ralph'
import {
  listAllScheduledTasks,
  recoverInterruptedTasks,
  syncAllGatewayLoopTaskSessions
} from './loop-task'
import { getActiveJobCount, shutdownScheduler } from './scheduler'
import {
  cancelAllRetries,
  getPendingRetryCount
} from '../../main/services/retry-handler'

export interface GatewayAutomationRecoveryStatus {
  attemptedAt: string | null
  recoveredCount: number
  recoveredTaskIds: string[]
}

export interface GatewayAutomationStatus {
  initialized: boolean
  subagents: HostedSubagentRuntimeStatus
  ralph: GatewayRalphStatus
  loopTasks: {
    scheduledTaskCount: number
    activeJobCount: number
    pendingRetryCount: number
    recovery: GatewayAutomationRecoveryStatus
  }
}

const EMPTY_RECOVERY_STATUS: GatewayAutomationRecoveryStatus = {
  attemptedAt: null,
  recoveredCount: 0,
  recoveredTaskIds: []
}

let initialized = false
let lastRecovery = { ...EMPTY_RECOVERY_STATUS }

export function initializeGatewayAutomation(): GatewayAutomationStatus {
  if (initialized) {
    return getGatewayAutomationStatus()
  }

  initializeGatewaySubagentRuntime()

  const recovery = recoverInterruptedTasks()
  const hydrated = syncAllGatewayLoopTaskSessions()
  lastRecovery = {
    attemptedAt: new Date().toISOString(),
    recoveredCount: recovery.recoveredCount,
    recoveredTaskIds: recovery.recoveredTaskIds
  }

  initialized = true

  if (recovery.recoveredCount > 0) {
    console.log(
      `[Gateway][Automation] Recovered ${recovery.recoveredCount} interrupted loop task(s): ${recovery.recoveredTaskIds.join(', ')}`
    )
  }

  if (hydrated.syncedCount > 0) {
    console.log(
      `[Gateway][Automation] Synced ${hydrated.syncedCount} loop task session(s): ${hydrated.syncedTaskIds.join(', ')}`
    )
  }

  return getGatewayAutomationStatus()
}

export function shutdownGatewayAutomation(): void {
  shutdownGatewaySubagentRuntime()
  shutdownScheduler()
  cancelAllRetries()
  initialized = false
}

export function getGatewayAutomationStatus(): GatewayAutomationStatus {
  return {
    initialized,
    subagents: getGatewaySubagentRuntimeStatus(),
    ralph: getGatewayRalphStatus(),
    loopTasks: {
      scheduledTaskCount: listAllScheduledTasks().length,
      activeJobCount: getActiveJobCount(),
      pendingRetryCount: getPendingRetryCount(),
      recovery: { ...lastRecovery, recoveredTaskIds: [...lastRecovery.recoveredTaskIds] }
    }
  }
}

export function resetGatewayAutomationForTests(): void {
  initialized = false
  lastRecovery = { ...EMPTY_RECOVERY_STATUS }
}
