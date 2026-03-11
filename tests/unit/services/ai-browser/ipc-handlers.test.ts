import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  initializeBrowser: vi.fn(),
  cleanupBrowser: vi.fn(),
  getToolNames: vi.fn(() => [
    'browser_list_pages',
    'browser_snapshot',
    'browser_screenshot'
  ]),
  captureBrowserSnapshot: vi.fn(async () => ({
    backend: 'connected',
    title: 'Example Page',
    url: 'https://example.com',
    text: 'snapshot text',
    elementCount: 2
  })),
  captureBrowserScreenshot: vi.fn(async () => ({
    backend: 'connected',
    mimeType: 'image/png',
    data: 'image-data'
  })),
  getToolDefinitions: vi.fn(() => []),
  executeTool: vi.fn(async () => ({
    content: 'done',
    images: [],
    isError: false
  })),
  isBrowserTool: vi.fn(() => true),
  setActiveView: vi.fn()
}))

vi.mock('../../../../src/gateway/host-runtime', () => ({
  hostRuntime: {
    browser: {
      initialize: mocks.initializeBrowser,
      cleanup: mocks.cleanupBrowser,
      getToolNames: mocks.getToolNames
    },
    perception: {
      captureBrowserSnapshot: mocks.captureBrowserSnapshot,
      captureBrowserScreenshot: mocks.captureBrowserScreenshot
    }
  }
}))

vi.mock('../../../../src/main/services/ai-browser', () => ({
  getAIBrowserToolDefinitions: mocks.getToolDefinitions,
  executeAIBrowserTool: mocks.executeTool,
  isAIBrowserTool: mocks.isBrowserTool,
  setActiveBrowserView: mocks.setActiveView,
  AI_BROWSER_SYSTEM_PROMPT: 'browser prompt'
}))

const handlers = new Map<string, (...args: any[]) => Promise<unknown>>()

async function loadModule() {
  vi.resetModules()
  handlers.clear()

  const { ipcMain } = await import('electron')
  vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
    handlers.set(channel, handler as (...args: any[]) => Promise<unknown>)
    return ipcMain
  })

  return await import('../../../../src/main/ipc/ai-browser')
}

describe('AI Browser IPC handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    handlers.clear()
  })

  it('routes get-tool-names through HostRuntime browser and initializes lazily', async () => {
    const { registerAIBrowserHandlers } = await loadModule()
    const mainWindow = { webContents: { send: vi.fn() } } as any

    registerAIBrowserHandlers(mainWindow)

    const handler = handlers.get('ai-browser:get-tool-names')
    const result = await handler?.({} as any) as {
      success: boolean
      data: string[]
    }

    expect(mocks.initializeBrowser).toHaveBeenCalledTimes(1)
    expect(mocks.initializeBrowser).toHaveBeenCalledWith(mainWindow)
    expect(mocks.getToolNames).toHaveBeenCalledWith('connected')
    expect(result).toEqual({
      success: true,
      data: ['browser_list_pages', 'browser_snapshot', 'browser_screenshot']
    })
  })

  it('reuses HostRuntime initialization for execute-tool and cleanup', async () => {
    const {
      registerAIBrowserHandlers,
      cleanupAIBrowserHandlers
    } = await loadModule()
    const mainWindow = { webContents: { send: vi.fn() } } as any

    registerAIBrowserHandlers(mainWindow)

    const getToolNames = handlers.get('ai-browser:get-tool-names')
    await getToolNames?.({} as any)

    const executeTool = handlers.get('ai-browser:execute-tool')
    const result = await executeTool?.(
      {} as any,
      { toolName: 'browser_click', params: { uid: 'u1' } }
    ) as {
      success: boolean
      data: {
        content: string
        images: unknown[]
        isError: boolean
      }
    }

    cleanupAIBrowserHandlers()

    expect(mocks.initializeBrowser).toHaveBeenCalledTimes(1)
    expect(mocks.executeTool).toHaveBeenCalledWith('browser_click', { uid: 'u1' })
    expect(mocks.cleanupBrowser).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      success: true,
      data: {
        content: 'done',
        images: [],
        isError: false
      }
    })
  })

  it('routes browser_snapshot through HostRuntime perception', async () => {
    const { registerAIBrowserHandlers } = await loadModule()

    registerAIBrowserHandlers({ webContents: { send: vi.fn() } } as any)

    const executeTool = handlers.get('ai-browser:execute-tool')
    const result = await executeTool?.(
      {} as any,
      { toolName: 'browser_snapshot', params: { verbose: true } }
    ) as {
      success: boolean
      data: {
        content: string
        images?: unknown[]
        isError?: boolean
      }
    }

    expect(mocks.captureBrowserSnapshot).toHaveBeenCalledWith({
      backend: 'connected',
      verbose: true,
      filePath: undefined,
      taskId: 'ai-browser-ipc'
    })
    expect(mocks.executeTool).not.toHaveBeenCalled()
    expect(result).toEqual({
      success: true,
      data: {
        content: 'snapshot text',
        images: undefined,
        isError: undefined
      }
    })
  })

  it('does not cleanup browser runtime if the module was never initialized', async () => {
    const {
      registerAIBrowserHandlers,
      cleanupAIBrowserHandlers
    } = await loadModule()

    registerAIBrowserHandlers({ webContents: { send: vi.fn() } } as any)
    cleanupAIBrowserHandlers()

    expect(mocks.cleanupBrowser).not.toHaveBeenCalled()
  })
})
