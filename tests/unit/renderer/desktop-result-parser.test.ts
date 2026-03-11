import { describe, expect, it } from 'vitest'
import type { HostStep } from '../../../src/shared/types/host-runtime'
import { buildDesktopResultModel } from '../../../src/renderer/components/tool/desktop-result-parser'

function createStep(overrides: Partial<HostStep>): HostStep {
  return {
    taskId: 'task-1',
    stepId: `step-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: 1,
    category: 'desktop',
    action: 'run_applescript',
    ...overrides
  }
}

describe('buildDesktopResultModel', () => {
  it('picks the latest desktop screenshot and parses structured fields', () => {
    const steps: HostStep[] = [
      createStep({
        stepId: 'step-old',
        timestamp: 1,
        action: 'desktop_screenshot',
        artifacts: [{
          kind: 'screenshot',
          path: '/tmp/old-shot.png',
          mimeType: 'image/png',
          previewImageData: 'old-image'
        }]
      }),
      createStep({
        stepId: 'step-new',
        timestamp: 2,
        action: 'run_applescript',
        artifacts: [{
          kind: 'screenshot',
          path: '/tmp/new-shot.png',
          mimeType: 'image/png',
          previewImageData: 'new-image',
          previewText: 'AppleScript completed:\nApplication: Finder\nWindow: Desktop'
        }]
      })
    ]

    const model = buildDesktopResultModel(steps)

    expect(model?.screenshot).toEqual(expect.objectContaining({
      path: '/tmp/new-shot.png',
      previewImageData: 'new-image'
    }))
    expect(model?.fields).toEqual([
      { label: 'Application', value: 'Finder' },
      { label: 'Window', value: 'Desktop' }
    ])
  })

  it('parses ui tree elements and bullet notes from desktop text', () => {
    const model = buildDesktopResultModel([
      createStep({
        stepId: 'step-structured',
        action: 'desktop_ui_tree',
        artifacts: [{
          kind: 'snapshot',
          previewText: [
            'Application: Finder',
            '- role=AXGroup, name=Desktop items, children=2',
            '  - role=AXImage, name=Folder',
            '• Dock is visible',
            '• Status bar is visible'
          ].join('\n')
        }]
      })
    ])

    expect(model?.elements).toEqual([
      { level: 0, role: 'AXGroup', name: 'Desktop items', details: 'children: 2' },
      { level: 1, role: 'AXImage', name: 'Folder', details: undefined }
    ])
    expect(model?.bulletItems).toEqual([
      'Dock is visible',
      'Status bar is visible'
    ])
  })

  it('falls back to raw text when no structure can be parsed', () => {
    const model = buildDesktopResultModel([
      createStep({
        stepId: 'step-raw',
        artifacts: [{
          kind: 'log',
          previewText: 'AppleScript completed:\nDesktop capture finished successfully.'
        }]
      })
    ])

    expect(model?.rawText).toBe('Desktop capture finished successfully.')
    expect(model?.fields).toEqual([])
    expect(model?.elements).toEqual([])
    expect(model?.bulletItems).toEqual([])
  })
})
