import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../../../../src/renderer/types'
import { useAppStore } from '../../../../src/renderer/stores/app.store'
import { syncAIBrowserStoreWithConfig, useAIBrowserStore } from '../../../../src/renderer/stores/ai-browser.store'

function resetAIBrowserStore(): void {
  useAIBrowserStore.setState({
    enabled: false,
    defaultEnabled: false,
    activeViewId: 'view-1',
    activeUrl: 'https://example.com',
    isOperating: true,
    lastError: 'stale error'
  })
}

describe('ai-browser store browser mode sync', () => {
  beforeEach(() => {
    resetAIBrowserStore()
    useAppStore.setState({ config: null })
  })

  it('enables AI Browser by default when config mode is ai-browser', () => {
    syncAIBrowserStoreWithConfig({
      browserAutomation: { enabled: true, mode: 'ai-browser' }
    })

    const state = useAIBrowserStore.getState()
    expect(state.enabled).toBe(true)
    expect(state.defaultEnabled).toBe(true)
    expect(state.activeViewId).toBe('view-1')
  })

  it('disables AI Browser state when config mode is system-browser', () => {
    syncAIBrowserStoreWithConfig({
      browserAutomation: { enabled: true, mode: 'system-browser' }
    })

    const state = useAIBrowserStore.getState()
    expect(state.enabled).toBe(false)
    expect(state.defaultEnabled).toBe(false)
    expect(state.activeViewId).toBeNull()
    expect(state.activeUrl).toBeNull()
    expect(state.isOperating).toBe(false)
    expect(state.lastError).toBeNull()
  })

  it('keeps the AI Browser store in sync when app config changes', () => {
    useAppStore.getState().setConfig({
      ...DEFAULT_CONFIG,
      browserAutomation: { enabled: true, mode: 'ai-browser' }
    })

    expect(useAIBrowserStore.getState().enabled).toBe(true)
    expect(useAIBrowserStore.getState().defaultEnabled).toBe(true)

    useAppStore.getState().setConfig({
      ...DEFAULT_CONFIG,
      browserAutomation: { enabled: true, mode: 'system-browser' }
    })

    expect(useAIBrowserStore.getState().enabled).toBe(false)
    expect(useAIBrowserStore.getState().defaultEnabled).toBe(false)
  })

  it('keeps AI Browser disabled when browser tools are turned off', () => {
    syncAIBrowserStoreWithConfig({
      browserAutomation: { enabled: false, mode: 'ai-browser' }
    })

    const state = useAIBrowserStore.getState()
    expect(state.enabled).toBe(false)
    expect(state.defaultEnabled).toBe(false)
  })
})
