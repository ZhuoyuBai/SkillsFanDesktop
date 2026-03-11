import { writeFileSync } from 'fs'
import { browserContext } from '../../../main/services/ai-browser/context'
import {
  captureAutomatedBrowserScreenshot,
  captureAutomatedBrowserSnapshot
} from '../../../main/services/automated-browser/sdk-mcp-server'
import {
  captureMacOSDesktopScreenshot,
  readMacOSDesktopUiTree
} from '../../../main/services/local-tools/macos-ui'
import { stepReporterRuntime } from '../step-reporter/runtime'
import type {
  BrowserScreenshotInput,
  BrowserScreenshotResult,
  BrowserSnapshotInput,
  BrowserSnapshotResult,
  DesktopScreenshotInput,
  DesktopScreenshotResult,
  DesktopUiTreeInput,
  DesktopUiTreeResult,
  PerceptionCapabilities,
  PerceptionHostRuntime,
  PerceptionSourceDescriptor,
  StepArtifactRef
} from '../types'
import { browserHostRuntime } from '../browser/runtime'

function resolveBrowserBackend(backend?: 'connected' | 'automated'): 'connected' | 'automated' {
  return backend || 'connected'
}

function recordPerceptionStep(args: {
  taskId?: string
  stepId?: string
  action: string
  summary: string
  artifacts?: StepArtifactRef[]
  metadata?: Record<string, unknown>
}): void {
  if (!args.taskId) return

  stepReporterRuntime.recordStep({
    taskId: args.taskId,
    stepId: args.stepId,
    category: 'perception',
    action: args.action,
    summary: args.summary,
    artifacts: args.artifacts,
    metadata: args.metadata
  })
}

export class PerceptionHostRuntimeAdapter implements PerceptionHostRuntime {
  getCapabilities(): PerceptionCapabilities {
    const connected = browserHostRuntime.getCapabilities('connected')
    const automated = browserHostRuntime.getCapabilities('automated')
    const isMacOS = process.platform === 'darwin'

    return {
      browserSnapshot:
        connected.supportsStructuredSnapshot || automated.supportsStructuredSnapshot,
      browserScreenshot:
        connected.supportsScreenshots || automated.supportsScreenshots,
      desktopScreenshot: isMacOS,
      desktopUiTree: isMacOS
    }
  }

  listSources(): PerceptionSourceDescriptor[] {
    const connected = browserHostRuntime.getCapabilities('connected')
    const automated = browserHostRuntime.getCapabilities('automated')

    return [
      {
        kind: 'browser_snapshot',
        available: connected.supportsStructuredSnapshot,
        backend: 'connected',
        toolName: connected.supportsStructuredSnapshot ? 'browser_snapshot' : undefined
      },
      {
        kind: 'browser_snapshot',
        available: automated.supportsStructuredSnapshot,
        backend: 'automated',
        toolName: automated.supportsStructuredSnapshot ? 'browser_snapshot' : undefined
      },
      {
        kind: 'browser_screenshot',
        available: connected.supportsScreenshots,
        backend: 'connected',
        toolName: connected.supportsScreenshots ? 'browser_screenshot' : undefined
      },
      {
        kind: 'browser_screenshot',
        available: automated.supportsScreenshots,
        backend: 'automated',
        toolName: automated.supportsScreenshots ? 'browser_screenshot' : undefined
      },
      {
        kind: 'desktop_screenshot',
        available: process.platform === 'darwin',
        backend: 'desktop',
        notes: process.platform === 'darwin'
          ? 'Requires macOS Screen Recording permission.'
          : 'Desktop screenshot capture is only available on macOS.'
      },
      {
        kind: 'desktop_ui_tree',
        available: process.platform === 'darwin',
        backend: 'desktop',
        notes: process.platform === 'darwin'
          ? 'Requires macOS Accessibility permission.'
          : 'Desktop UI tree reading is only available on macOS.'
      }
    ]
  }

  async captureBrowserSnapshot(args: BrowserSnapshotInput = {}): Promise<BrowserSnapshotResult> {
    const backend = resolveBrowserBackend(args.backend)

    if (backend === 'automated') {
      const result = await captureAutomatedBrowserSnapshot({
        verbose: args.verbose,
        filePath: args.filePath
      })

      recordPerceptionStep({
        taskId: args.taskId,
        stepId: args.stepId,
        action: 'browser_snapshot',
        summary: `Captured automated browser snapshot for ${result.url || 'about:blank'}`,
        artifacts: result.filePath
          ? [{ kind: 'snapshot', label: 'browser_snapshot', path: result.filePath, previewText: result.text }]
          : [{ kind: 'snapshot', label: 'browser_snapshot', previewText: result.text, metadata: { backend } }],
        metadata: {
          backend,
          title: result.title,
          url: result.url,
          elementCount: result.elementCount
        }
      })

      return result
    }

    if (!browserContext.getActiveViewId()) {
      throw new Error('No active browser page. Use browser_new_page first.')
    }

    const snapshot = await browserContext.createSnapshot(Boolean(args.verbose))
    const text = snapshot.format(Boolean(args.verbose))

    if (args.filePath) {
      writeFileSync(args.filePath, text, 'utf-8')
    }

    const result: BrowserSnapshotResult = {
      backend,
      title: snapshot.title,
      url: snapshot.url,
      text,
      elementCount: snapshot.idToNode.size,
      filePath: args.filePath
    }

    recordPerceptionStep({
      taskId: args.taskId,
      stepId: args.stepId,
      action: 'browser_snapshot',
      summary: `Captured connected browser snapshot for ${result.url || 'about:blank'}`,
      artifacts: result.filePath
        ? [{ kind: 'snapshot', label: 'browser_snapshot', path: result.filePath, previewText: result.text }]
        : [{ kind: 'snapshot', label: 'browser_snapshot', previewText: result.text, metadata: { backend } }],
      metadata: {
        backend,
        title: result.title,
        url: result.url,
        elementCount: result.elementCount
      }
    })

    return result
  }

  async captureBrowserScreenshot(args: BrowserScreenshotInput = {}): Promise<BrowserScreenshotResult> {
    const backend = resolveBrowserBackend(args.backend)

    if (backend === 'automated') {
      const result = await captureAutomatedBrowserScreenshot({
        uid: args.uid,
        filePath: args.filePath
      })

      recordPerceptionStep({
        taskId: args.taskId,
        stepId: args.stepId,
        action: 'browser_screenshot',
        summary: `Captured automated browser screenshot${args.uid ? ` for ${args.uid}` : ''}`,
        artifacts: [{
          kind: 'screenshot',
          label: 'browser_screenshot',
          path: result.filePath,
          mimeType: result.mimeType,
          previewImageData: result.data,
          metadata: { backend, uid: args.uid }
        }]
      })

      return result
    }

    if (!browserContext.getActiveViewId()) {
      throw new Error('No active browser page.')
    }

    const screenshot = await browserContext.captureScreenshot({
      format: args.format || 'png',
      quality: args.quality,
      uid: args.uid,
      fullPage: args.fullPage || false
    })

    if (args.filePath) {
      writeFileSync(args.filePath, Buffer.from(screenshot.data, 'base64'))
    }

    const result: BrowserScreenshotResult = {
      backend,
      mimeType: screenshot.mimeType,
      data: screenshot.data,
      filePath: args.filePath
    }

    recordPerceptionStep({
      taskId: args.taskId,
      stepId: args.stepId,
      action: 'browser_screenshot',
      summary: `Captured connected browser screenshot${args.uid ? ` for ${args.uid}` : ''}`,
      artifacts: [{
        kind: 'screenshot',
        label: 'browser_screenshot',
        path: result.filePath,
        mimeType: result.mimeType,
        previewImageData: result.data,
        metadata: { backend, uid: args.uid, fullPage: args.fullPage || false }
      }]
    })

    return result
  }

  async captureDesktopScreenshot(args: DesktopScreenshotInput): Promise<DesktopScreenshotResult> {
    const result = await captureMacOSDesktopScreenshot(args)

    recordPerceptionStep({
      taskId: args.taskId,
      stepId: args.stepId,
      action: 'desktop_screenshot',
      summary: 'Captured desktop screenshot',
      artifacts: [{
        kind: 'screenshot',
        label: 'desktop_screenshot',
        path: result.filePath,
        mimeType: result.mimeType,
        previewImageData: result.data
      }]
    })

    return result
  }

  async readDesktopUiTree(args: DesktopUiTreeInput): Promise<DesktopUiTreeResult> {
    const result = await readMacOSDesktopUiTree(args)

    recordPerceptionStep({
      taskId: args.taskId,
      stepId: args.stepId,
      action: 'desktop_ui_tree',
      summary: `Read desktop UI tree${args.application ? ` for ${args.application}` : ''}`,
      artifacts: result.filePath
        ? [{ kind: 'snapshot', label: 'desktop_ui_tree', path: result.filePath, previewText: result.text }]
        : [{ kind: 'snapshot', label: 'desktop_ui_tree', previewText: result.text }],
      metadata: {
        application: args.application,
        maxElements: args.maxElements,
        maxChildrenPerElement: args.maxChildrenPerElement
      }
    })

    return result
  }
}

export const perceptionHostRuntime = new PerceptionHostRuntimeAdapter()
