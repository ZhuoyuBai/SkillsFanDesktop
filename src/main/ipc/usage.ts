/**
 * Usage Statistics IPC Handlers
 */

import { ipcHandle } from './utils'
import { getUsageHistory, getUsageRealtime } from '../services/usage.service'
import type { UsageHistoryQuery } from '../../shared/types/usage'

export function registerUsageHandlers(): void {
  ipcHandle('usage:get-history', (_e, query: UsageHistoryQuery) =>
    getUsageHistory(query)
  )

  ipcHandle('usage:get-realtime', () =>
    getUsageRealtime()
  )
}
