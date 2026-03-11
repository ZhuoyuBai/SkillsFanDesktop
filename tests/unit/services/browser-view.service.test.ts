import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const attachedViews: any[] = []
  const createdViews: any[] = []
  const captureWindows: any[] = []

  const BrowserView = vi.fn(() => {
    const view = {
      webContents: {
        setUserAgent: vi.fn(),
        capturePage: vi.fn(async () => ({
          toDataURL: () => 'data:image/png;base64,valid-image-data'
        })),
        executeJavaScript: vi.fn(),
        setZoomFactor: vi.fn(),
        isDevToolsOpened: vi.fn(() => false),
        closeDevTools: vi.fn(),
        openDevTools: vi.fn(),
        destroy: vi.fn(),
        loadURL: vi.fn(async () => undefined),
        on: vi.fn(),
        canGoBack: vi.fn(() => false),
        canGoForward: vi.fn(() => false),
        setWindowOpenHandler: vi.fn()
      },
      setBackgroundColor: vi.fn(),
      setBounds: vi.fn(),
      setAutoResize: vi.fn()
    }

    createdViews.push(view)
    return view
  })

  const BrowserWindow = vi.fn((options?: { width?: number; height?: number }) => {
    let visible = false
    let destroyed = false
    let bounds = {
      x: 0,
      y: 0,
      width: options?.width || 1280,
      height: options?.height || 720
    }

    const browserViews: any[] = []
    const eventHandlers = new Map<string, () => void>()

    const window = {
      on: vi.fn((event: string, handler: () => void) => {
        eventHandlers.set(event, handler)
      }),
      addBrowserView: vi.fn((view: any) => {
        if (!browserViews.includes(view)) {
          browserViews.push(view)
        }
      }),
      removeBrowserView: vi.fn((view: any) => {
        const index = browserViews.indexOf(view)
        if (index >= 0) {
          browserViews.splice(index, 1)
        }
      }),
      getBrowserViews: vi.fn(() => browserViews),
      getContentSize: vi.fn(() => [bounds.width, bounds.height]),
      getContentBounds: vi.fn(() => bounds),
      setBounds: vi.fn((nextBounds: typeof bounds) => {
        bounds = nextBounds
      }),
      loadURL: vi.fn(async () => undefined),
      isVisible: vi.fn(() => visible),
      showInactive: vi.fn(() => {
        visible = true
      }),
      hide: vi.fn(() => {
        visible = false
      }),
      close: vi.fn(() => {
        destroyed = true
        eventHandlers.get('closed')?.()
      }),
      isDestroyed: vi.fn(() => destroyed)
    }

    captureWindows.push(window)
    return window
  })

  const mainWindow = {
    on: vi.fn(),
    addBrowserView: vi.fn((view: any) => {
      if (!attachedViews.includes(view)) {
        attachedViews.push(view)
      }
    }),
    removeBrowserView: vi.fn((view: any) => {
      const index = attachedViews.indexOf(view)
      if (index >= 0) {
        attachedViews.splice(index, 1)
      }
    }),
    getBrowserViews: vi.fn(() => attachedViews),
    getContentSize: vi.fn(() => [900, 600]),
    isDestroyed: vi.fn(() => false),
    webContents: {
      send: vi.fn()
    }
  }

  return {
    attachedViews,
    createdViews,
    captureWindows,
    BrowserView,
    BrowserWindow,
    mainWindow
  }
})

vi.mock('electron', () => ({
  BrowserView: mocks.BrowserView,
  BrowserWindow: mocks.BrowserWindow
}))

import { browserViewManager } from '../../../src/main/services/browser-view.service'

describe('browserViewManager.capture', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.attachedViews.length = 0
    mocks.createdViews.length = 0
    mocks.captureWindows.length = 0
    browserViewManager.destroyAll()
    browserViewManager.initialize(mocks.mainWindow as any)
  })

  it('temporarily attaches hidden browser views before capturing screenshots', async () => {
    await browserViewManager.create('view-1', 'https://example.com')
    const view = mocks.createdViews[0]

    const result = await browserViewManager.capture('view-1')
    const captureWindow = mocks.captureWindows[0]

    expect(result).toBe('data:image/png;base64,valid-image-data')
    expect(mocks.BrowserWindow).toHaveBeenCalledTimes(1)
    expect(captureWindow.showInactive).toHaveBeenCalledTimes(1)
    expect(captureWindow.addBrowserView).toHaveBeenCalledWith(view)
    expect(view.setBounds).toHaveBeenCalledWith({
      x: 0,
      y: 0,
      width: 1280,
      height: 720
    })
    expect(captureWindow.removeBrowserView).toHaveBeenCalledWith(view)
    expect(captureWindow.hide).toHaveBeenCalledTimes(1)
    expect(view.webContents.capturePage).toHaveBeenCalledTimes(1)
  })

  it('retries once when the first capture returns empty image data', async () => {
    await browserViewManager.create('view-2', 'https://example.com')
    const view = mocks.createdViews[0]

    view.webContents.capturePage
      .mockResolvedValueOnce({
        toDataURL: () => 'data:image/png;base64,'
      })
      .mockResolvedValueOnce({
        toDataURL: () => 'data:image/png;base64,second-pass-image'
      })

    const result = await browserViewManager.capture('view-2')

    expect(result).toBe('data:image/png;base64,second-pass-image')
    expect(view.webContents.capturePage).toHaveBeenCalledTimes(2)
  })
})
