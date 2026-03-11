import type { BrowserWindow } from 'electron'
import {
  cleanupAIBrowser,
  createAIBrowserMcpServer,
  getAIBrowserSdkToolNames,
  initializeAIBrowser
} from '../../../main/services/ai-browser'
import {
  createAutomatedBrowserMcpServer,
  getAutomatedBrowserToolNames
} from '../../../main/services/automated-browser/sdk-mcp-server'
import type {
  BrowserAutomationBackend,
  BrowserMcpServerContext,
  BrowserHostCapabilities,
  BrowserHostRuntime
} from '../types'

function resolveBackend(backend?: BrowserAutomationBackend): BrowserAutomationBackend {
  return backend || 'connected'
}

function getBackendToolNames(backend: BrowserAutomationBackend): string[] {
  return backend === 'automated'
    ? getAutomatedBrowserToolNames()
    : getAIBrowserSdkToolNames()
}

export class BrowserHostRuntimeAdapter implements BrowserHostRuntime {
  initialize(mainWindow: BrowserWindow): void {
    initializeAIBrowser(mainWindow)
  }

  cleanup(): void {
    cleanupAIBrowser()
  }

  createMcpServer(backend?: BrowserAutomationBackend, context?: BrowserMcpServerContext): unknown {
    return resolveBackend(backend) === 'automated'
      ? createAutomatedBrowserMcpServer(context)
      : createAIBrowserMcpServer(context)
  }

  getToolNames(backend?: BrowserAutomationBackend): string[] {
    return getBackendToolNames(resolveBackend(backend))
  }

  getCapabilities(backend?: BrowserAutomationBackend): BrowserHostCapabilities {
    const resolvedBackend = resolveBackend(backend)
    const toolNames = this.getToolNames(resolvedBackend)

    return {
      backend: resolvedBackend,
      toolNames,
      supportsStructuredSnapshot: toolNames.includes('browser_snapshot'),
      supportsScreenshots: toolNames.includes('browser_screenshot'),
      supportsMultiPage: toolNames.includes('browser_list_pages')
    }
  }
}

export const browserHostRuntime = new BrowserHostRuntimeAdapter()
