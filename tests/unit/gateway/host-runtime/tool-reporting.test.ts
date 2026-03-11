import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const mocks = vi.hoisted(() => {
  const dispatchEvent = vi.fn()

  return {
    dispatchEvent,
    getChannelManager: vi.fn(() => ({ dispatchEvent })),
    createOutboundEvent: vi.fn((channel, spaceId, conversationId, payload) => ({
      channel,
      spaceId,
      conversationId,
      payload
    }))
  }
})

vi.mock('../../../../src/main/services/channel/channel-manager', () => ({
  getChannelManager: mocks.getChannelManager,
  createOutboundEvent: mocks.createOutboundEvent
}))

import { stepReporterRuntime } from '../../../../src/gateway/host-runtime/step-reporter/runtime'
import { recordToolExecutionStep } from '../../../../src/gateway/host-runtime/step-reporter/tool-reporting'

describe('recordToolExecutionStep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stepReporterRuntime.clearAll()
  })

  it('extracts screenshot previews from image tool results', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-image',
      category: 'browser',
      action: 'browser_screenshot',
      result: {
        content: [
          {
            type: 'image',
            mimeType: 'image/png',
            data: 'preview-image-data'
          }
        ]
      }
    })

    expect(report.artifacts).toEqual([
      {
        kind: 'screenshot',
        label: 'browser_screenshot',
        mimeType: 'image/png',
        previewImageData: 'preview-image-data'
      }
    ])
    expect(stepReporterRuntime.listSteps('task-image')).toHaveLength(1)
  })

  it('extracts snapshot previews and dispatches scoped step events', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-text',
      defaultSpaceId: 'space-1',
      defaultConversationId: 'conv-1',
      category: 'browser',
      action: 'browser_snapshot',
      toolArgs: {
        filePath: '/tmp/page-snapshot.txt'
      },
      result: {
        content: [
          {
            type: 'text',
            text: 'Heading\nBody copy'
          }
        ]
      }
    })

    expect(report.artifacts).toEqual([
      {
        kind: 'snapshot',
        label: 'browser_snapshot',
        path: '/tmp/page-snapshot.txt',
        previewText: 'Heading\nBody copy'
      }
    ])
    expect(mocks.createOutboundEvent).toHaveBeenCalledWith(
      'agent:host-step',
      'space-1',
      'conv-1',
      expect.objectContaining({
        taskId: 'task-text',
        action: 'browser_snapshot'
      })
    )
    expect(mocks.dispatchEvent).toHaveBeenCalledTimes(1)
  })

  it('extracts local screenshot previews from text-only tool results', () => {
    const tempDir = mkdtempSync(join(process.cwd(), 'tmp-tool-report-'))
    const screenshotPath = join(tempDir, 'desktop_screenshot.png')
    writeFileSync(screenshotPath, Buffer.from('desktop-image-preview'))
    const hfsPath = screenshotPath.replace(/^\//, 'Macintosh HD:').replace(/\//g, ':')

    try {
      const report = recordToolExecutionStep({
        defaultTaskId: 'task-applescript',
        category: 'desktop',
        action: 'run_applescript',
        result: {
          content: [
            {
              type: 'text',
              text: `AppleScript completed:\nSaved screenshot to ${hfsPath}`
            }
          ]
        }
      })

      expect(report.artifacts).toEqual([
        expect.objectContaining({
          kind: 'screenshot',
          label: 'run_applescript',
          path: screenshotPath,
          mimeType: 'image/png',
          previewImageData: Buffer.from('desktop-image-preview').toString('base64'),
          previewText: `AppleScript completed:\nSaved screenshot to ${hfsPath}`
        })
      ])
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('extracts local screenshot previews from tilde paths in text-only tool results', () => {
    const homeScreenshotPath = join(homedir(), 'Desktop', 'screenshot.png')
    mkdirSync(join(homedir(), 'Desktop'), { recursive: true })
    writeFileSync(homeScreenshotPath, Buffer.from('desktop-image-tilde-preview'))

    try {
      const report = recordToolExecutionStep({
        defaultTaskId: 'task-applescript-tilde',
        category: 'desktop',
        action: 'run_applescript',
        result: {
          content: [
            {
              type: 'text',
              text: 'AppleScript completed:\n截图已保存到 ~/Desktop/screenshot.png'
            }
          ]
        }
      })

      expect(report.artifacts).toEqual([
        expect.objectContaining({
          kind: 'screenshot',
          label: 'run_applescript',
          path: homeScreenshotPath,
          mimeType: 'image/png',
          previewImageData: Buffer.from('desktop-image-tilde-preview').toString('base64'),
          previewText: 'AppleScript completed:\n截图已保存到 ~/Desktop/screenshot.png'
        })
      ])
    } finally {
      rmSync(homeScreenshotPath, { force: true })
    }
  })

  it('keeps structured desktop text for applescript-only results', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-desktop-structure',
      category: 'desktop',
      action: 'run_applescript',
      result: {
        content: [
          {
            type: 'text',
            text: 'AppleScript completed:\nApplication: Finder\nWindow: Desktop\n- role=AXGroup, name=Desktop items, children=3'
          }
        ]
      }
    })

    expect(report.artifacts).toEqual([
      {
        kind: 'log',
        label: 'run_applescript',
        previewText: 'AppleScript completed:\nApplication: Finder\nWindow: Desktop\n- role=AXGroup, name=Desktop items, children=3'
      }
    ])
  })

  it('does not expose file artifacts when a tool result is marked as failed', () => {
    const report = recordToolExecutionStep({
      defaultTaskId: 'task-error',
      category: 'browser',
      action: 'browser_screenshot',
      toolArgs: {
        filePath: '/tmp/failed-screenshot.png'
      },
      result: {
        content: [
          {
            type: 'text',
            text: 'Screenshot failed'
          }
        ],
        isError: true
      }
    })

    expect(report.artifacts).toBeUndefined()
  })
})
