import type { HaloConfig } from '../types'
import { DEFAULT_CONFIG } from '../types'

type TerminalConfig = NonNullable<HaloConfig['terminal']>

export function mergeTerminalConfig(
  current: Partial<TerminalConfig> | null | undefined,
  updates: Partial<TerminalConfig>
): TerminalConfig {
  return {
    ...DEFAULT_CONFIG.terminal!,
    ...current,
    ...updates,
  }
}
