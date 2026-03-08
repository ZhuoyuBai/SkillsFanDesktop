/**
 * Browser Context - Core context manager for AI Browser
 *
 * The BrowserContext is the central manager for AI Browser operations.
 * It connects to the user's real Chrome browser via CDP WebSocket,
 * providing full automation without being detected as a bot.
 *
 * All AI Browser tools operate through this context.
 */

import { BrowserWindow } from 'electron'
import { chromeConnection, type CDPClient, type ChromePage } from './chrome-connection'
import {
  createAccessibilitySnapshot,
  getElementBoundingBox,
  scrollIntoView,
  focusElement
} from './snapshot'
import type {
  BrowserContextInterface,
  AccessibilitySnapshot,
  AccessibilityNode,
  NetworkRequest,
  ConsoleMessage,
  DialogInfo
} from './types'

/**
 * BrowserContext - Manages the browser state for AI operations
 * Now uses real Chrome via CDP WebSocket instead of Electron BrowserView
 */
export class BrowserContext implements BrowserContextInterface {
  private mainWindow: BrowserWindow | null = null
  private activeTargetId: string | null = null
  private activeCDPClient: CDPClient | null = null
  private lastSnapshot: AccessibilitySnapshot | null = null

  // Track page info (since we don't have webContents.getURL() anymore)
  private pageUrl: string = ''
  private pageTitle: string = ''

  // Network monitoring state
  private networkRequests: Map<string, NetworkRequest> = new Map()
  private networkEnabled: boolean = false
  private networkRequestCounter: number = 0

  // Console monitoring state
  private consoleMessages: ConsoleMessage[] = []
  private consoleEnabled: boolean = false
  private consoleMessageCounter: number = 0

  // Dialog handling state
  private pendingDialog: DialogInfo | null = null

  /**
   * Initialize the context with the main window
   */
  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow
    console.log('[BrowserContext] Initialized')
  }

  /**
   * Ensure Chrome is launched and connected
   */
  async ensureConnected(): Promise<void> {
    if (!chromeConnection.connected) {
      await chromeConnection.launch()
    }
  }

  /**
   * Get the currently active view ID (target ID in Chrome terms)
   */
  getActiveViewId(): string | null {
    return this.activeTargetId
  }

  /**
   * Set the active browser page by target ID
   */
  async setActiveViewId(viewId: string): Promise<void> {
    // If changing pages, disable monitoring on old page
    if (this.activeTargetId && this.activeTargetId !== viewId) {
      this.disableMonitoring()
    }

    this.activeTargetId = viewId

    // Get CDP session for this page
    try {
      this.activeCDPClient = await chromeConnection.getPageSession(viewId)

      // Bring page to front
      await chromeConnection.activatePage(viewId)

      // Update page info
      await this.updatePageInfo()

      console.log(`[BrowserContext] Active page set to: ${viewId}`)

      // Enable monitoring on new page
      await this.enableMonitoring()

      // Notify renderer
      this.notifyActiveViewChange(viewId)
    } catch (error) {
      console.error(`[BrowserContext] Failed to set active page:`, error)
      throw error
    }
  }

  /**
   * Notify renderer process of active view ID change
   */
  private notifyActiveViewChange(viewId: string): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('ai-browser:active-view-changed', {
        viewId,
        url: this.pageUrl || null,
        title: this.pageTitle || null,
      })
    }
  }

  /**
   * Update tracked page URL and title via CDP
   */
  private async updatePageInfo(): Promise<void> {
    try {
      const result = await this.sendCDPCommand<{
        result: { value: { url: string; title: string } }
      }>('Runtime.evaluate', {
        expression: 'JSON.stringify({ url: location.href, title: document.title })',
        returnByValue: true
      })
      if (result?.result?.value) {
        const info = typeof result.result.value === 'string'
          ? JSON.parse(result.result.value)
          : result.result.value
        this.pageUrl = info.url
        this.pageTitle = info.title
      }
    } catch {
      // Page might not be ready yet
    }
  }

  /**
   * Get the active CDP client
   */
  private getActiveCDPClient(): CDPClient | null {
    if (!this.activeCDPClient || this.activeCDPClient.closed) {
      return null
    }
    return this.activeCDPClient
  }

  /**
   * Send a CDP command to the active browser page
   */
  async sendCDPCommand<T = unknown>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    const client = this.getActiveCDPClient()
    if (!client) {
      throw new Error('No active browser page')
    }

    return client.sendCommand<T>(method, params)
  }

  // ============================================
  // Accessibility Snapshot
  // ============================================

  /**
   * Create a new accessibility snapshot
   */
  async createSnapshot(verbose: boolean = false): Promise<AccessibilitySnapshot> {
    const client = this.getActiveCDPClient()
    if (!client) {
      throw new Error('No active browser page')
    }

    // Update page info before snapshot
    await this.updatePageInfo()

    this.lastSnapshot = await createAccessibilitySnapshot(
      client, verbose, this.pageUrl, this.pageTitle
    )
    return this.lastSnapshot
  }

  /**
   * Get the last created snapshot
   */
  getLastSnapshot(): AccessibilitySnapshot | null {
    return this.lastSnapshot
  }

  /**
   * Get an element by its UID from the last snapshot
   */
  getElementByUid(uid: string): AccessibilityNode | null {
    if (!this.lastSnapshot) {
      return null
    }
    return this.lastSnapshot.idToNode.get(uid) || null
  }

  // ============================================
  // Network Monitoring
  // ============================================

  private async enableNetworkMonitoring(): Promise<void> {
    const client = this.getActiveCDPClient()
    if (!client || this.networkEnabled) return

    try {
      await client.sendCommand('Network.enable')

      // Listen for network events
      client.on('Network.requestWillBeSent', (params) => this.handleNetworkRequest(params))
      client.on('Network.responseReceived', (params) => this.handleNetworkResponse(params))
      client.on('Network.loadingFailed', (params) => this.handleNetworkError(params))

      this.networkEnabled = true
      console.log('[BrowserContext] Network monitoring enabled')
    } catch (error) {
      console.error('[BrowserContext] Failed to enable network monitoring:', error)
    }
  }

  private handleNetworkRequest(params: Record<string, unknown>): void {
    const requestId = params.requestId as string
    const request = params.request as {
      url: string
      method: string
      headers?: Record<string, string>
      postData?: string
    }
    const resourceType = params.type as string

    const id = `req_${++this.networkRequestCounter}`
    this.networkRequests.set(requestId, {
      id,
      url: request.url,
      method: request.method,
      resourceType,
      requestHeaders: request.headers,
      requestBody: request.postData,
      timing: {
        requestTime: Date.now(),
        responseTime: 0,
        duration: 0
      }
    })
  }

  private handleNetworkResponse(params: Record<string, unknown>): void {
    const requestId = params.requestId as string
    const response = params.response as {
      url: string
      status: number
      statusText: string
      headers?: Record<string, string>
      mimeType?: string
    }

    const request = this.networkRequests.get(requestId)
    if (request) {
      request.status = response.status
      request.statusText = response.statusText
      request.responseHeaders = response.headers
      request.mimeType = response.mimeType
      if (request.timing) {
        request.timing.responseTime = Date.now()
        request.timing.duration = request.timing.responseTime - request.timing.requestTime
      }
    }
  }

  private handleNetworkError(params: Record<string, unknown>): void {
    const requestId = params.requestId as string
    const errorText = params.errorText as string

    const request = this.networkRequests.get(requestId)
    if (request) {
      request.error = errorText
    }
  }

  getNetworkRequests(_includePreserved: boolean = false): NetworkRequest[] {
    return Array.from(this.networkRequests.values())
  }

  getNetworkRequest(id: string): NetworkRequest | undefined {
    for (const request of this.networkRequests.values()) {
      if (request.id === id) {
        return request
      }
    }
    return undefined
  }

  getSelectedNetworkRequest(): NetworkRequest | undefined {
    return undefined
  }

  clearNetworkRequests(): void {
    this.networkRequests.clear()
    this.networkRequestCounter = 0
  }

  // ============================================
  // Console Monitoring
  // ============================================

  private async enableConsoleMonitoring(): Promise<void> {
    const client = this.getActiveCDPClient()
    if (!client || this.consoleEnabled) return

    try {
      await client.sendCommand('Runtime.enable')

      client.on('Runtime.consoleAPICalled', (params) => this.handleConsoleMessage(params))
      client.on('Page.javascriptDialogOpening', (params) => this.handleDialogOpening(params))

      this.consoleEnabled = true
      console.log('[BrowserContext] Console monitoring enabled')
    } catch (error) {
      console.error('[BrowserContext] Failed to enable console monitoring:', error)
    }
  }

  private handleConsoleMessage(params: Record<string, unknown>): void {
    const type = params.type as string
    const args = params.args as Array<{ type: string; value?: unknown; description?: string }>
    const stackTrace = params.stackTrace as { callFrames?: Array<{ url: string; lineNumber: number }> }

    const text = args
      .map(arg => {
        if (arg.value !== undefined) return String(arg.value)
        if (arg.description) return arg.description
        return '[Object]'
      })
      .join(' ')

    const id = `msg_${++this.consoleMessageCounter}`
    const message: ConsoleMessage = {
      id,
      type: type as ConsoleMessage['type'],
      text,
      timestamp: Date.now(),
      args: args.map(a => a.value)
    }

    if (stackTrace?.callFrames?.[0]) {
      const frame = stackTrace.callFrames[0]
      message.url = frame.url
      message.lineNumber = frame.lineNumber
    }

    this.consoleMessages.push(message)

    if (this.consoleMessages.length > 1000) {
      this.consoleMessages = this.consoleMessages.slice(-1000)
    }
  }

  getConsoleMessages(_includePreserved: boolean = false): ConsoleMessage[] {
    return this.consoleMessages
  }

  getConsoleMessage(id: string): ConsoleMessage | undefined {
    return this.consoleMessages.find(m => m.id === id)
  }

  clearConsoleMessages(): void {
    this.consoleMessages = []
    this.consoleMessageCounter = 0
  }

  // ============================================
  // Dialog Handling
  // ============================================

  private handleDialogOpening(params: Record<string, unknown>): void {
    this.pendingDialog = {
      type: params.type as DialogInfo['type'],
      message: params.message as string,
      defaultPrompt: params.defaultPrompt as string | undefined
    }
  }

  getPendingDialog(): DialogInfo | null {
    return this.pendingDialog
  }

  async handleDialog(accept: boolean, promptText?: string): Promise<void> {
    try {
      await this.sendCDPCommand('Page.handleJavaScriptDialog', {
        accept,
        promptText
      })
      this.pendingDialog = null
    } catch (error) {
      console.error('[BrowserContext] Failed to handle dialog:', error)
    }
  }

  // ============================================
  // Element Operations
  // ============================================

  async clickElement(uid: string, options?: { dblClick?: boolean }): Promise<void> {
    const element = this.getElementByUid(uid)
    if (!element) {
      throw new Error(`Element not found: ${uid}`)
    }

    const client = this.getActiveCDPClient()
    if (!client) {
      throw new Error('No active browser page')
    }

    await scrollIntoView(client, element.backendNodeId)

    const box = await getElementBoundingBox(client, element.backendNodeId)
    if (!box) {
      throw new Error(`Could not get bounding box for element: ${uid}`)
    }

    const x = box.x + box.width / 2
    const y = box.y + box.height / 2

    await this.sendCDPCommand('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      clickCount: options?.dblClick ? 2 : 1
    })

    await this.sendCDPCommand('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      clickCount: options?.dblClick ? 2 : 1
    })
  }

  async hoverElement(uid: string): Promise<void> {
    const element = this.getElementByUid(uid)
    if (!element) {
      throw new Error(`Element not found: ${uid}`)
    }

    const client = this.getActiveCDPClient()
    if (!client) {
      throw new Error('No active browser page')
    }

    await scrollIntoView(client, element.backendNodeId)

    const box = await getElementBoundingBox(client, element.backendNodeId)
    if (!box) {
      throw new Error(`Could not get bounding box for element: ${uid}`)
    }

    const x = box.x + box.width / 2
    const y = box.y + box.height / 2

    await this.sendCDPCommand('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y
    })
  }

  async fillElement(uid: string, value: string): Promise<void> {
    const element = this.getElementByUid(uid)
    if (!element) {
      throw new Error(`Element not found: ${uid}`)
    }

    const client = this.getActiveCDPClient()
    if (!client) {
      throw new Error('No active browser page')
    }

    await focusElement(client, element.backendNodeId)

    // Clear existing content
    const selectAllModifier = process.platform === 'darwin' ? 4 : 2
    await this.sendCDPCommand('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'a',
      code: 'KeyA',
      modifiers: selectAllModifier
    })
    await this.sendCDPCommand('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'a',
      code: 'KeyA',
      modifiers: selectAllModifier
    })

    await this.sendCDPCommand('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Backspace',
      code: 'Backspace'
    })
    await this.sendCDPCommand('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Backspace',
      code: 'Backspace'
    })

    await this.sendCDPCommand('Input.insertText', { text: value })
  }

  async selectOption(uid: string, value: string): Promise<void> {
    const element = this.getElementByUid(uid)
    if (!element) {
      throw new Error(`Element not found: ${uid}`)
    }

    if (element.role !== 'combobox' && element.role !== 'listbox') {
      throw new Error(`Element is not a select/combobox: ${element.role}`)
    }

    let optionFound = false
    for (const child of element.children || []) {
      if (child.role === 'option' && child.name === value) {
        optionFound = true

        try {
          const resolveResponse = await this.sendCDPCommand<{
            object?: { objectId?: string }
          }>('DOM.resolveNode', {
            backendNodeId: child.backendNodeId
          })

          if (resolveResponse?.object?.objectId) {
            const valueResponse = await this.sendCDPCommand<{
              result?: { value?: string }
            }>('Runtime.callFunctionOn', {
              objectId: resolveResponse.object.objectId,
              functionDeclaration: 'function() { return this.value; }',
              returnByValue: true
            })

            const optionValue = valueResponse?.result?.value || value

            const parentResolve = await this.sendCDPCommand<{
              object?: { objectId?: string }
            }>('DOM.resolveNode', {
              backendNodeId: element.backendNodeId
            })

            if (parentResolve?.object?.objectId) {
              await this.sendCDPCommand('Runtime.callFunctionOn', {
                objectId: parentResolve.object.objectId,
                functionDeclaration: `function(val) {
                  this.value = val;
                  this.dispatchEvent(new Event('change', { bubbles: true }));
                  this.dispatchEvent(new Event('input', { bubbles: true }));
                }`,
                arguments: [{ value: optionValue }],
                awaitPromise: true
              })
            }
          }
        } catch (error) {
          console.error('[BrowserContext] Failed to select option:', error)
          throw error
        }
        break
      }
    }

    if (!optionFound) {
      throw new Error(`Could not find option with text "${value}"`)
    }
  }

  async dragElement(fromUid: string, toUid: string): Promise<void> {
    const fromElement = this.getElementByUid(fromUid)
    const toElement = this.getElementByUid(toUid)

    if (!fromElement) throw new Error(`Source element not found: ${fromUid}`)
    if (!toElement) throw new Error(`Target element not found: ${toUid}`)

    const client = this.getActiveCDPClient()
    if (!client) throw new Error('No active browser page')

    const fromBox = await getElementBoundingBox(client, fromElement.backendNodeId)
    const toBox = await getElementBoundingBox(client, toElement.backendNodeId)

    if (!fromBox || !toBox) throw new Error('Could not get element positions')

    const fromX = fromBox.x + fromBox.width / 2
    const fromY = fromBox.y + fromBox.height / 2
    const toX = toBox.x + toBox.width / 2
    const toY = toBox.y + toBox.height / 2

    await this.sendCDPCommand('Input.dispatchMouseEvent', {
      type: 'mousePressed', x: fromX, y: fromY, button: 'left', clickCount: 1
    })

    const steps = 10
    for (let i = 1; i <= steps; i++) {
      const x = fromX + (toX - fromX) * (i / steps)
      const y = fromY + (toY - fromY) * (i / steps)
      await this.sendCDPCommand('Input.dispatchMouseEvent', {
        type: 'mouseMoved', x, y, button: 'left'
      })
    }

    await this.sendCDPCommand('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: toX, y: toY, button: 'left', clickCount: 1
    })
  }

  // ============================================
  // Keyboard Input
  // ============================================

  async pressKey(key: string): Promise<void> {
    const keyInfo = parseKey(key)

    await this.sendCDPCommand('Input.dispatchKeyEvent', {
      type: 'keyDown',
      ...keyInfo
    })

    await this.sendCDPCommand('Input.dispatchKeyEvent', {
      type: 'keyUp',
      ...keyInfo
    })
  }

  async typeText(text: string): Promise<void> {
    await this.sendCDPCommand('Input.insertText', { text })
  }

  // ============================================
  // Screenshot
  // ============================================

  async captureScreenshot(options?: {
    format?: 'png' | 'jpeg' | 'webp'
    quality?: number
    fullPage?: boolean
    uid?: string
  }): Promise<{ data: string; mimeType: string }> {
    const format = options?.format || 'png'
    const quality = format === 'png' ? undefined : (options?.quality || 80)

    const getMimeType = (fmt: string): string => {
      switch (fmt) {
        case 'jpeg': return 'image/jpeg'
        case 'webp': return 'image/webp'
        default: return 'image/png'
      }
    }

    if (options?.uid) {
      const element = this.getElementByUid(options.uid)
      if (!element) throw new Error(`Element not found: ${options.uid}`)

      const client = this.getActiveCDPClient()
      if (!client) throw new Error('No active browser page')

      await scrollIntoView(client, element.backendNodeId)
      const box = await getElementBoundingBox(client, element.backendNodeId)

      if (box) {
        const response = await this.sendCDPCommand<{ data: string }>('Page.captureScreenshot', {
          format,
          quality,
          clip: {
            x: box.x, y: box.y,
            width: box.width, height: box.height,
            scale: 1
          }
        })

        return { data: response.data, mimeType: getMimeType(format) }
      }
    }

    const params: Record<string, unknown> = { format, quality }

    if (options?.fullPage) {
      const metrics = await this.sendCDPCommand<{
        contentSize: { width: number; height: number }
      }>('Page.getLayoutMetrics')

      params.clip = {
        x: 0, y: 0,
        width: metrics.contentSize.width,
        height: metrics.contentSize.height,
        scale: 1
      }
      params.captureBeyondViewport = true
    }

    const response = await this.sendCDPCommand<{ data: string }>('Page.captureScreenshot', params)
    return { data: response.data, mimeType: getMimeType(format) }
  }

  // ============================================
  // Script Execution
  // ============================================

  async evaluateScript<T = unknown>(script: string, args?: unknown[]): Promise<T> {
    let expression = script
    if (args && args.length > 0) {
      const argsStr = args.map(a => JSON.stringify(a)).join(', ')
      expression = `(${script})(${argsStr})`
    }

    const response = await this.sendCDPCommand<{
      result: { value?: T; type: string; description?: string }
      exceptionDetails?: { exception?: { description?: string } }
    }>('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    })

    if (response.exceptionDetails) {
      throw new Error(
        response.exceptionDetails.exception?.description || 'Script execution failed'
      )
    }

    return response.result.value as T
  }

  // ============================================
  // Page State
  // ============================================

  async getPageInfo(): Promise<{
    url: string
    title: string
    viewport: { width: number; height: number }
  }> {
    await this.updatePageInfo()

    const metrics = await this.sendCDPCommand<{
      layoutViewport: { clientWidth: number; clientHeight: number }
    }>('Page.getLayoutMetrics')

    return {
      url: this.pageUrl,
      title: this.pageTitle,
      viewport: {
        width: metrics.layoutViewport.clientWidth,
        height: metrics.layoutViewport.clientHeight
      }
    }
  }

  // ============================================
  // Wait Utilities
  // ============================================

  async waitForText(text: string, timeout: number = 30000): Promise<void> {
    const startTime = Date.now()
    const pollInterval = 500

    while (Date.now() - startTime < timeout) {
      const snapshot = await this.createSnapshot()
      const formattedText = snapshot.format()

      if (formattedText.includes(text)) {
        return
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }

    throw new Error(`Timeout waiting for text: "${text}"`)
  }

  async waitForElement(selector: string, timeout: number = 30000): Promise<void> {
    const startTime = Date.now()
    const pollInterval = 500

    while (Date.now() - startTime < timeout) {
      try {
        const result = await this.evaluateScript<boolean>(
          `!!document.querySelector("${selector.replace(/"/g, '\\"')}")`
        )
        if (result) return
      } catch {
        // Ignore errors and retry
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }

    throw new Error(`Timeout waiting for element: "${selector}"`)
  }

  // ============================================
  // Monitoring Control
  // ============================================

  private async enableMonitoring(): Promise<void> {
    await this.enableNetworkMonitoring()
    await this.enableConsoleMonitoring()
  }

  private disableMonitoring(): void {
    this.networkEnabled = false
    this.consoleEnabled = false
    this.clearNetworkRequests()
    this.clearConsoleMessages()
  }

  /**
   * Cleanup when context is destroyed
   */
  destroy(): void {
    this.disableMonitoring()
    // Only disconnect, don't close Chrome
    chromeConnection.close()
    this.activeTargetId = null
    this.activeCDPClient = null
    this.lastSnapshot = null
    this.mainWindow = null
  }
}

// ============================================
// Key Parsing Utility
// ============================================

function parseKey(key: string): {
  key: string
  code: string
  modifiers?: number
  text?: string
} {
  const specialKeys: Record<string, { key: string; code: string }> = {
    'Enter': { key: 'Enter', code: 'Enter' },
    'Tab': { key: 'Tab', code: 'Tab' },
    'Escape': { key: 'Escape', code: 'Escape' },
    'Backspace': { key: 'Backspace', code: 'Backspace' },
    'Delete': { key: 'Delete', code: 'Delete' },
    'ArrowUp': { key: 'ArrowUp', code: 'ArrowUp' },
    'ArrowDown': { key: 'ArrowDown', code: 'ArrowDown' },
    'ArrowLeft': { key: 'ArrowLeft', code: 'ArrowLeft' },
    'ArrowRight': { key: 'ArrowRight', code: 'ArrowRight' },
    'Home': { key: 'Home', code: 'Home' },
    'End': { key: 'End', code: 'End' },
    'PageUp': { key: 'PageUp', code: 'PageUp' },
    'PageDown': { key: 'PageDown', code: 'PageDown' },
    'Space': { key: ' ', code: 'Space' },
  }

  const parts = key.split('+')
  let modifiers = 0
  let actualKey = key

  if (parts.length > 1) {
    actualKey = parts[parts.length - 1]
    for (let i = 0; i < parts.length - 1; i++) {
      const mod = parts[i].toLowerCase()
      if (mod === 'control' || mod === 'ctrl') modifiers |= 2
      if (mod === 'shift') modifiers |= 8
      if (mod === 'alt') modifiers |= 1
      if (mod === 'meta' || mod === 'cmd' || mod === 'command') modifiers |= 4
    }
  }

  if (specialKeys[actualKey]) {
    return {
      ...specialKeys[actualKey],
      modifiers: modifiers || undefined
    }
  }

  return {
    key: actualKey,
    code: actualKey.length === 1 ? `Key${actualKey.toUpperCase()}` : actualKey,
    text: actualKey,
    modifiers: modifiers || undefined
  }
}

// Singleton instance
export const browserContext = new BrowserContext()
