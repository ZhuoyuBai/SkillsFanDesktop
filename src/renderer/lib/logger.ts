/**
 * Renderer logger utility.
 * - debug/info logs are development-only by default
 * - warn/error logs are always emitted
 */

const DEBUG_ENABLED = import.meta.env.DEV && import.meta.env.VITE_DEBUG_LOGS !== 'false'
const INFO_ENABLED = import.meta.env.DEV

function withPrefix(prefix: string | undefined, args: unknown[]): unknown[] {
  if (!prefix) {
    return args
  }
  return [`[${prefix}]`, ...args]
}

export function createLogger(prefix?: string) {
  return {
    debug: (...args: unknown[]): void => {
      if (!DEBUG_ENABLED) return
      console.log(...withPrefix(prefix, args))
    },
    info: (...args: unknown[]): void => {
      if (!INFO_ENABLED) return
      console.info(...withPrefix(prefix, args))
    },
    warn: (...args: unknown[]): void => {
      console.warn(...withPrefix(prefix, args))
    },
    error: (...args: unknown[]): void => {
      console.error(...withPrefix(prefix, args))
    }
  }
}

export const logger = createLogger()
