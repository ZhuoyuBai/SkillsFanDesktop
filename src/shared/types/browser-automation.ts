export type BrowserAutomationMode = 'ai-browser' | 'system-browser'

type BrowserAutomationCarrier = {
  browserAutomation?: {
    enabled?: boolean
    mode?: unknown
  } | null
}

export function resolveBrowserAutomationMode(mode?: unknown): BrowserAutomationMode {
  return mode === 'system-browser' ? 'system-browser' : 'ai-browser'
}

export function resolveBrowserAutomationConfig(config?: BrowserAutomationCarrier | null): {
  enabled: boolean
  mode: BrowserAutomationMode
} {
  const browserAutomation = config?.browserAutomation

  return {
    enabled: browserAutomation?.enabled === true,
    mode: resolveBrowserAutomationMode(browserAutomation?.mode)
  }
}

export function isBrowserAutomationEnabled(config?: BrowserAutomationCarrier | null): boolean {
  return resolveBrowserAutomationConfig(config).enabled
}

export function isAIBrowserMode(config?: BrowserAutomationCarrier | null): boolean {
  const browserAutomation = resolveBrowserAutomationConfig(config)
  return browserAutomation.enabled && browserAutomation.mode === 'ai-browser'
}

export function isSystemBrowserMode(config?: BrowserAutomationCarrier | null): boolean {
  const browserAutomation = resolveBrowserAutomationConfig(config)
  return browserAutomation.enabled && browserAutomation.mode === 'system-browser'
}
