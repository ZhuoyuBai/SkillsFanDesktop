/**
 * Gateway Automation Diagnostics
 *
 * Aggregated query entry point that reads gateway session store,
 * agent control state, subagent runs, and loop task status by sessionKey.
 */

import { getGatewaySessionStorePersistenceStatus } from '../sessions'
import { getGatewaySession, listGatewaySessions } from '../sessions/store'
import type { GatewaySessionState } from '../sessions/types'
import {
  getGatewaySessionStepJournal,
  type GatewaySessionStepJournal
} from '../host-runtime/step-reporter/query'
import { getLoopTasksBySessionKey, type LoopTaskDiagnosticEntry } from './loop-task'

export interface AutomationDiagnosticsRecovery {
  sessionStoreHydrated: boolean
  stepJournalEnabled: boolean
  matchedTaskCount: number
  persistedTaskCount: number
  source: 'none' | 'session-store' | 'step-journal' | 'session-store+step-journal'
}

export interface AutomationDiagnostics {
  sessionKey: string
  session: GatewaySessionState | null
  relatedSessions: GatewaySessionState[]
  loopTasks: LoopTaskDiagnosticEntry[]
  subagentSessions: GatewaySessionState[]
  stepJournal: GatewaySessionStepJournal
  recovery: AutomationDiagnosticsRecovery
}

/**
 * Get aggregated automation diagnostics for a given sessionKey.
 *
 * Returns the session itself, related sessions under the same mainSessionKey,
 * loop task diagnostics, and subagent sessions.
 */
export function getAutomationDiagnostics(sessionKey: string): AutomationDiagnostics {
  const session = getGatewaySession(sessionKey)
  const mainSessionKey = session?.mainSessionKey || sessionKey
  const sessionStore = getGatewaySessionStorePersistenceStatus()
  const stepJournal = getGatewaySessionStepJournal(sessionKey, {
    includeRelatedSessions: true
  })

  const relatedSessions = listGatewaySessions({ mainSessionKey })
    .filter((s) => s.sessionKey !== sessionKey)

  const loopTasks = getLoopTasksBySessionKey(sessionKey)

  const allSessions = listGatewaySessions({})
  const subagentSessions = allSessions
    .filter((s) => {
      if (s.metadata?.automationKind !== 'subagent') return false
      return (
        s.metadata?.parentSessionKey === sessionKey
        || s.metadata?.parentMainSessionKey === sessionKey
        || s.mainSessionKey === mainSessionKey
      )
    })

  const hasSessionStoreRecovery = Boolean(session && sessionStore.enabled && sessionStore.hydrated)
  const hasStepJournalRecovery = stepJournal.totalStepCount > 0
  const recovery: AutomationDiagnosticsRecovery = {
    sessionStoreHydrated: sessionStore.enabled && sessionStore.hydrated,
    stepJournalEnabled: stepJournal.recoverySource !== 'none',
    matchedTaskCount: stepJournal.tasks.length,
    persistedTaskCount: stepJournal.tasks.filter((task) => (
      task.source === 'persisted' || task.source === 'mixed'
    )).length,
    source: hasSessionStoreRecovery && hasStepJournalRecovery
      ? 'session-store+step-journal'
      : hasSessionStoreRecovery
        ? 'session-store'
        : hasStepJournalRecovery
          ? 'step-journal'
          : 'none'
  }

  return {
    sessionKey,
    session,
    relatedSessions,
    loopTasks,
    subagentSessions,
    stepJournal,
    recovery
  }
}
