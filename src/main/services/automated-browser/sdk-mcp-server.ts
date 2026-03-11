import { writeFileSync } from 'fs'
import { BrowserWindow } from 'electron'
import { z } from 'zod'
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { recordToolExecutionStep } from '../../../gateway/host-runtime/step-reporter/tool-reporting'
import { browserViewManager } from '../browser-view.service'

interface BrowserMcpServerOptions {
  spaceId?: string
  conversationId?: string
}

type ManagedViewState = {
  id: string
  url: string
  title: string
  isLoading: boolean
}

type SnapshotElement = {
  uid: string
  selector: string
  tag: string
  role: string
  text: string
  placeholder: string
  type: string
}

const managedViewOrder: string[] = []
const snapshotCache = new Map<string, Map<string, SnapshotElement>>()
let activeViewId: string | null = null
let viewSequence = 0

function createViewId(): string {
  viewSequence += 1
  return `automated-browser-${Date.now()}-${viewSequence}`
}

function getMainWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows().find((window) => !window.isDestroyed()) || null
}

function getManagedViews(): ManagedViewState[] {
  const states: ManagedViewState[] = []

  for (let index = managedViewOrder.length - 1; index >= 0; index -= 1) {
    const viewId = managedViewOrder[index]
    const state = browserViewManager.getState(viewId)
    if (!state) {
      managedViewOrder.splice(index, 1)
      snapshotCache.delete(viewId)
      if (activeViewId === viewId) activeViewId = null
      continue
    }

    states.push({
      id: viewId,
      url: state.url,
      title: state.title,
      isLoading: state.isLoading
    })
  }

  return states
}

function emitActiveViewChanged(viewId: string | null): void {
  const mainWindow = getMainWindow()
  if (!mainWindow) return

  const state = viewId ? browserViewManager.getState(viewId) : null
  mainWindow.webContents.send('ai-browser:active-view-changed', {
    viewId,
    url: state?.url || null,
    title: state?.title || null
  })
}

function setActiveManagedView(viewId: string | null): void {
  activeViewId = viewId
  if (viewId) {
    browserViewManager.setActiveView(viewId)
  }
  emitActiveViewChanged(viewId)
}

async function waitForIdle(viewId: string, timeoutMs = 30000): Promise<void> {
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    const state = browserViewManager.getState(viewId)
    if (!state) {
      throw new Error(`Browser view not found: ${viewId}`)
    }

    if (!state.isLoading) return

    await new Promise((resolve) => setTimeout(resolve, 150))
  }

  throw new Error(`Timed out waiting for browser view ${viewId} to finish loading`)
}

async function executeInView<T>(viewId: string, script: string): Promise<T> {
  const result = await browserViewManager.executeJS(viewId, script)
  return result as T
}

function getRequiredActiveViewId(): string {
  const views = getManagedViews()
  if (!activeViewId || !views.some((view) => view.id === activeViewId)) {
    activeViewId = views[0]?.id || null
  }

  if (!activeViewId) {
    throw new Error('No active automated browser page. Use browser_new_page first.')
  }

  return activeViewId
}

function getSnapshotElement(viewId: string, uid: string): SnapshotElement {
  const element = snapshotCache.get(viewId)?.get(uid)
  if (!element) {
    throw new Error(`Element ${uid} not found. Take a fresh browser_snapshot first.`)
  }
  return element
}

function formatSnapshot(args: {
  title: string
  url: string
  bodyText: string
  elements: SnapshotElement[]
}): string {
  const lines = [
    `Page: ${args.title || 'Untitled'}`,
    `URL: ${args.url || 'about:blank'}`,
    '',
    'Visible text:',
    args.bodyText || '(No visible text captured)',
    '',
    'Interactive elements:'
  ]

  if (args.elements.length === 0) {
    lines.push('(No interactive elements found)')
    return lines.join('\n')
  }

  for (const element of args.elements) {
    const details = [
      `<${element.tag}>`,
      element.role ? `role="${element.role}"` : '',
      element.type ? `type="${element.type}"` : '',
      element.placeholder ? `placeholder="${element.placeholder}"` : '',
      element.text ? `text="${element.text}"` : ''
    ].filter(Boolean)

    lines.push(`- uid=${element.uid} ${details.join(' ')}`)
  }

  return lines.join('\n')
}

function dataUrlToImagePayload(dataUrl: string): { data: string; mimeType: string } {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/)
  if (!match) {
    throw new Error('Invalid screenshot data returned from BrowserView')
  }

  return {
    mimeType: match[1],
    data: match[2]
  }
}

export async function captureAutomatedBrowserSnapshot(args?: {
  verbose?: boolean
  filePath?: string
}): Promise<{
  backend: 'automated'
  title: string
  url: string
  text: string
  elementCount: number
  filePath?: string
}> {
  const viewId = getRequiredActiveViewId()
  const verbose = Boolean(args?.verbose)
  const payload = await executeInView<{
    title: string
    url: string
    bodyText: string
    elements: Array<{
      selector: string
      tag: string
      role: string
      text: string
      placeholder: string
      type: string
    }>
  }>(
    viewId,
    `(() => {
      const selector = [
        'a[href]',
        'button',
        'input',
        'textarea',
        'select',
        '[role="button"]',
        '[role="link"]',
        '[role="textbox"]',
        '[contenteditable="true"]',
        '[tabindex]:not([tabindex="-1"])'
      ].join(',')
      const limit = ${verbose ? 300 : 120}
      const textLimit = ${verbose ? 6000 : 2500}
      const isVisible = (el) => {
        const style = window.getComputedStyle(el)
        const rect = el.getBoundingClientRect()
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
      }
      const cssPath = (element) => {
        const parts = []
        let current = element
        while (current && current.nodeType === Node.ELEMENT_NODE && current.tagName.toLowerCase() !== 'html') {
          let part = current.tagName.toLowerCase()
          if (current.id) {
            part += '#' + CSS.escape(current.id)
            parts.unshift(part)
            break
          }
          let sibling = current
          let index = 1
          while ((sibling = sibling.previousElementSibling)) {
            if (sibling.tagName === current.tagName) index += 1
          }
          part += ':nth-of-type(' + index + ')'
          parts.unshift(part)
          current = current.parentElement
        }
        return parts.join(' > ')
      }
      const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim()
      const elements = Array.from(document.querySelectorAll(selector))
        .filter(isVisible)
        .slice(0, limit)
        .map((el) => ({
          selector: cssPath(el),
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role') || '',
          text: normalize(el.innerText || el.textContent || '').slice(0, 160),
          placeholder: 'placeholder' in el ? normalize(el.placeholder || '').slice(0, 120) : '',
          type: 'type' in el ? normalize(el.type || '').slice(0, 40) : ''
        }))
      return {
        title: document.title,
        url: location.href,
        bodyText: normalize(document.body ? document.body.innerText : '').slice(0, textLimit),
        elements
      }
    })()`
  )

  const elementMap = new Map<string, SnapshotElement>()
  const formattedElements = payload.elements.map((element, index) => {
    const uid = `e${index + 1}`
    const snapshotElement: SnapshotElement = { uid, ...element }
    elementMap.set(uid, snapshotElement)
    return snapshotElement
  })

  snapshotCache.set(viewId, elementMap)

  const text = formatSnapshot({
    title: payload.title,
    url: payload.url,
    bodyText: payload.bodyText,
    elements: formattedElements
  })

  if (args?.filePath) {
    writeFileSync(args.filePath, text, 'utf-8')
  }

  return {
    backend: 'automated',
    title: payload.title,
    url: payload.url,
    text,
    elementCount: formattedElements.length,
    filePath: args?.filePath
  }
}

export async function captureAutomatedBrowserScreenshot(args?: {
  uid?: string
  filePath?: string
}): Promise<{
  backend: 'automated'
  mimeType: string
  data: string
  filePath?: string
}> {
  const viewId = getRequiredActiveViewId()
  let dataUrl: string | null

  if (args?.uid) {
    const element = getSnapshotElement(viewId, args.uid)
    const selector = JSON.stringify(element.selector)
    const rect = await executeInView<{ x: number; y: number; width: number; height: number } | null>(
      viewId,
      `(() => {
        const el = document.querySelector(${selector})
        if (!el) return null
        const rect = el.getBoundingClientRect()
        return {
          x: Math.max(0, Math.floor(rect.x)),
          y: Math.max(0, Math.floor(rect.y)),
          width: Math.max(1, Math.ceil(rect.width)),
          height: Math.max(1, Math.ceil(rect.height))
        }
      })()`
    )

    if (!rect) {
      throw new Error(`Element ${args.uid} not found for screenshot.`)
    }

    dataUrl = await browserViewManager.capture(viewId, rect)
  } else {
    dataUrl = await browserViewManager.capture(viewId)
  }

  if (!dataUrl) {
    throw new Error('Failed to capture screenshot.')
  }

  const imagePayload = dataUrlToImagePayload(dataUrl)
  if (args?.filePath) {
    writeFileSync(args.filePath, Buffer.from(imagePayload.data, 'base64'))
  }

  return {
    backend: 'automated',
    mimeType: imagePayload.mimeType,
    data: imagePayload.data,
    filePath: args?.filePath
  }
}

const browser_list_pages = tool(
  'browser_list_pages',
  'List automated browser pages/tabs with their URLs and titles.',
  {},
  async () => {
    const views = getManagedViews()
    if (views.length === 0) {
      return {
        content: [{ type: 'text' as const, text: 'No automated browser pages are currently open.' }]
      }
    }

    const lines = ['Open automated browser pages:']
    views.forEach((view, index) => {
      const marker = view.id === activeViewId ? ' *active*' : ''
      lines.push(`[${index}] ${view.title || 'Untitled'} - ${view.url || 'about:blank'}${marker}`)
    })

    return {
      content: [{ type: 'text' as const, text: lines.join('\n') }]
    }
  }
)

const browser_select_page = tool(
  'browser_select_page',
  'Select an automated browser page by index.',
  {
    pageIdx: z.number().int().min(0).describe('The index from browser_list_pages output'),
    bringToFront: z.boolean().optional().describe('Unused for embedded browser views; kept for compatibility')
  },
  async (args) => {
    const views = getManagedViews()
    const view = views[args.pageIdx]
    if (!view) {
      return {
        content: [{ type: 'text' as const, text: `Invalid page index: ${args.pageIdx}` }],
        isError: true
      }
    }

    setActiveManagedView(view.id)
    return {
      content: [{ type: 'text' as const, text: `Selected page [${args.pageIdx}]: ${view.title || 'Untitled'} - ${view.url}` }]
    }
  }
)

const browser_new_page = tool(
  'browser_new_page',
  'Create a new automated browser page and navigate to a URL.',
  {
    url: z.string().describe('The URL to open'),
    timeout: z.number().int().min(1000).max(120000).optional().describe('Navigation timeout in milliseconds')
  },
  async (args) => {
    try {
      const viewId = createViewId()
      await browserViewManager.create(viewId, args.url)
      managedViewOrder.push(viewId)
      setActiveManagedView(viewId)
      await waitForIdle(viewId, args.timeout || 30000)

      const state = browserViewManager.getState(viewId)
      return {
        content: [{ type: 'text' as const, text: `Created new automated browser page: ${state?.title || 'Untitled'} - ${state?.url || args.url}` }]
      }
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: `Failed to create automated browser page: ${(error as Error).message}` }],
        isError: true
      }
    }
  }
)

const browser_close_page = tool(
  'browser_close_page',
  'Close an automated browser page by index.',
  {
    pageIdx: z.number().int().min(0).describe('The index from browser_list_pages output')
  },
  async (args) => {
    const views = getManagedViews()
    const view = views[args.pageIdx]
    if (!view) {
      return {
        content: [{ type: 'text' as const, text: `Invalid page index: ${args.pageIdx}` }],
        isError: true
      }
    }

    browserViewManager.destroy(view.id)
    snapshotCache.delete(view.id)
    const orderIndex = managedViewOrder.indexOf(view.id)
    if (orderIndex >= 0) managedViewOrder.splice(orderIndex, 1)

    if (activeViewId === view.id) {
      setActiveManagedView(getManagedViews()[0]?.id || null)
    }

    return {
      content: [{ type: 'text' as const, text: `Closed page [${args.pageIdx}]: ${view.title || 'Untitled'}` }]
    }
  }
)

const browser_navigate = tool(
  'browser_navigate',
  'Navigate, go back, go forward, or reload in the active automated browser page.',
  {
    type: z.enum(['url', 'back', 'forward', 'reload']).optional().describe('Navigation type'),
    url: z.string().optional().describe('Required when type is "url"'),
    ignoreCache: z.boolean().optional().describe('Unused for BrowserView reload; kept for compatibility'),
    timeout: z.number().int().min(1000).max(120000).optional().describe('Navigation timeout in milliseconds')
  },
  async (args) => {
    try {
      const viewId = getRequiredActiveViewId()
      const type = args.type || 'url'
      let ok = false

      if (type === 'back') ok = browserViewManager.goBack(viewId)
      else if (type === 'forward') ok = browserViewManager.goForward(viewId)
      else if (type === 'reload') ok = browserViewManager.reload(viewId)
      else if (args.url) ok = await browserViewManager.navigate(viewId, args.url)

      if (!ok) {
        return {
          content: [{ type: 'text' as const, text: `Navigation action failed: ${type}` }],
          isError: true
        }
      }

      await waitForIdle(viewId, args.timeout || 30000)
      emitActiveViewChanged(viewId)
      const state = browserViewManager.getState(viewId)

      return {
        content: [{ type: 'text' as const, text: `Navigated to: ${state?.title || 'Untitled'} - ${state?.url || 'about:blank'}` }]
      }
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: (error as Error).message }],
        isError: true
      }
    }
  }
)

const browser_wait_for = tool(
  'browser_wait_for',
  'Wait for specific text to appear in the active automated browser page.',
  {
    text: z.string().min(1).describe('Text to wait for'),
    timeout: z.number().int().min(1000).max(120000).optional().describe('Maximum wait time in milliseconds')
  },
  async (args) => {
    try {
      const viewId = getRequiredActiveViewId()
      const timeoutMs = args.timeout || 30000
      const start = Date.now()
      const escapedText = JSON.stringify(args.text)

      while (Date.now() - start < timeoutMs) {
        const found = await executeInView<boolean>(
          viewId,
          `(() => Boolean(document.body && document.body.innerText.includes(${escapedText})))()`
        )

        if (found) {
          return {
            content: [{ type: 'text' as const, text: `Found text: "${args.text}"` }]
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 200))
      }

      return {
        content: [{ type: 'text' as const, text: `Timeout waiting for text: "${args.text}"` }],
        isError: true
      }
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: (error as Error).message }],
        isError: true
      }
    }
  }
)

const browser_snapshot = tool(
  'browser_snapshot',
  'Capture a structured snapshot of the active automated browser page with element UIDs.',
  {
    verbose: z.boolean().optional().describe('Capture more visible text and more elements'),
    filePath: z.string().optional().describe('Optional path to save the snapshot text')
  },
  async (args) => {
    try {
      const result = await captureAutomatedBrowserSnapshot({
        verbose: args.verbose,
        filePath: args.filePath
      })

      if (result.filePath) {
        return {
          content: [{ type: 'text' as const, text: `Snapshot saved to: ${result.filePath}` }]
        }
      }

      return {
        content: [{ type: 'text' as const, text: result.text }]
      }
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: (error as Error).message }],
        isError: true
      }
    }
  }
)

const browser_click = tool(
  'browser_click',
  'Click an element identified by its UID from browser_snapshot.',
  {
    uid: z.string().min(1).describe('Element UID from browser_snapshot'),
    dblClick: z.boolean().optional().describe('Whether to perform a double click')
  },
  async (args) => {
    try {
      const viewId = getRequiredActiveViewId()
      const element = getSnapshotElement(viewId, args.uid)
      const selector = JSON.stringify(element.selector)
      const action = args.dblClick ? 'dblclick' : 'click'
      const result = await executeInView<{ ok: boolean; message?: string }>(
        viewId,
        `(() => {
          const el = document.querySelector(${selector})
          if (!el) return { ok: false, message: 'Element not found in DOM' }
          el.scrollIntoView({ block: 'center', inline: 'center' })
          if (typeof el.focus === 'function') el.focus()
          if (${args.dblClick ? 'true' : 'false'}) {
            el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, composed: true }))
          } else if (typeof el.click === 'function') {
            el.click()
          } else {
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }))
          }
          return { ok: true }
        })()`
      )

      if (!result?.ok) {
        return {
          content: [{ type: 'text' as const, text: result?.message || `Failed to ${action} ${args.uid}` }],
          isError: true
        }
      }

      return {
        content: [{ type: 'text' as const, text: `Clicked element: ${args.uid}${args.dblClick ? ' (double-click)' : ''}` }]
      }
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: (error as Error).message }],
        isError: true
      }
    }
  }
)

const browser_fill = tool(
  'browser_fill',
  'Fill an input element identified by its UID from browser_snapshot.',
  {
    uid: z.string().min(1).describe('Element UID from browser_snapshot'),
    value: z.string().describe('Value to input')
  },
  async (args) => {
    try {
      const viewId = getRequiredActiveViewId()
      const element = getSnapshotElement(viewId, args.uid)
      const selector = JSON.stringify(element.selector)
      const value = JSON.stringify(args.value)
      const result = await executeInView<{ ok: boolean; message?: string }>(
        viewId,
        `(() => {
          const el = document.querySelector(${selector})
          if (!el) return { ok: false, message: 'Element not found in DOM' }
          el.scrollIntoView({ block: 'center', inline: 'center' })
          if (!('value' in el) && !el.isContentEditable) {
            return { ok: false, message: 'Element is not fillable' }
          }
          if (typeof el.focus === 'function') el.focus()
          if (el.isContentEditable) {
            el.textContent = ${value}
          } else {
            el.value = ${value}
          }
          el.dispatchEvent(new Event('input', { bubbles: true }))
          el.dispatchEvent(new Event('change', { bubbles: true }))
          return { ok: true }
        })()`
      )

      if (!result?.ok) {
        return {
          content: [{ type: 'text' as const, text: result?.message || `Failed to fill ${args.uid}` }],
          isError: true
        }
      }

      return {
        content: [{ type: 'text' as const, text: `Filled element ${args.uid} with: "${args.value}"` }]
      }
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: (error as Error).message }],
        isError: true
      }
    }
  }
)

const browser_screenshot = tool(
  'browser_screenshot',
  'Take a screenshot of the active automated browser page or a specific element.',
  {
    uid: z.string().optional().describe('Optional element UID from browser_snapshot'),
    filePath: z.string().optional().describe('Optional path to save the screenshot')
  },
  async (args) => {
    try {
      const result = await captureAutomatedBrowserScreenshot({
        uid: args.uid,
        filePath: args.filePath
      })

      if (result.filePath) {
        return {
          content: [
            { type: 'text' as const, text: `Screenshot saved to: ${result.filePath}` },
            { type: 'image' as const, data: result.data, mimeType: result.mimeType }
          ]
        }
      }

      return {
        content: [
          { type: 'text' as const, text: `Screenshot captured${args.uid ? ` for ${args.uid}` : ''}` },
          { type: 'image' as const, data: result.data!, mimeType: result.mimeType }
        ]
      }
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: (error as Error).message }],
        isError: true
      }
    }
  }
)

const automatedBrowserTools = [
  browser_list_pages,
  browser_select_page,
  browser_new_page,
  browser_close_page,
  browser_navigate,
  browser_wait_for,
  browser_click,
  browser_fill,
  browser_snapshot,
  browser_screenshot
]

const instrumentedAutomatedBrowserTools = automatedBrowserTools.map((toolDefinition) => ({
  ...toolDefinition
}))

export function createAutomatedBrowserMcpServer(options: BrowserMcpServerOptions = {}) {
  const tools = instrumentedAutomatedBrowserTools.map((toolDefinition) => ({
    ...toolDefinition,
    handler: async (args: unknown, extra?: unknown) => {
      try {
        const result = await toolDefinition.handler(args, extra)
        recordToolExecutionStep({
          defaultTaskId: options.conversationId || 'browser:automated',
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'browser',
          action: toolDefinition.name,
          toolArgs: args,
          result,
          metadata: { backend: 'automated' }
        })
        return result
      } catch (error) {
        recordToolExecutionStep({
          defaultTaskId: options.conversationId || 'browser:automated',
          defaultSpaceId: options.spaceId,
          defaultConversationId: options.conversationId,
          extra,
          category: 'browser',
          action: toolDefinition.name,
          toolArgs: args,
          result: {
            content: [{ type: 'text' as const, text: (error as Error).message }],
            isError: true
          },
          metadata: { backend: 'automated', thrown: true }
        })
        throw error
      }
    }
  }))

  return createSdkMcpServer({
    name: 'ai-browser',
    version: '1.0.0',
    tools
  })
}

export function getAutomatedBrowserToolNames(): string[] {
  return instrumentedAutomatedBrowserTools.map((tool) => tool.name)
}
