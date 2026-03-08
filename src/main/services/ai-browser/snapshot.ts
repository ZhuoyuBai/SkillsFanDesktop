/**
 * Accessibility Snapshot - Core a11y tree implementation
 *
 * Provides the foundation for AI Browser interactions by:
 * 1. Capturing the accessibility tree via CDP
 * 2. Converting it to a structured format with unique IDs
 * 3. Formatting it as text for AI consumption
 *
 * Uses CDPClient (WebSocket to real Chrome) instead of Electron's WebContents.
 */

import type { CDPClient } from './chrome-connection'
import type { AccessibilityNode, AccessibilitySnapshot } from './types'

// Counter for generating unique snapshot IDs
let snapshotCounter = 0

/**
 * CDP AXNode structure from Accessibility.getFullAXTree
 */
interface CDPAXNode {
  nodeId: string
  ignored: boolean
  ignoredReasons?: Array<{ name: string; value?: { type: string; value?: string } }>
  role?: { type: string; value: string }
  name?: { type: string; value: string; sources?: Array<{ type: string; value?: { type: string; value: string } }> }
  description?: { type: string; value: string }
  value?: { type: string; value: string | number | boolean }
  properties?: Array<{
    name: string
    value: { type: string; value: string | number | boolean }
  }>
  childIds?: string[]
  backendDOMNodeId?: number
  parentId?: string
  frameId?: string
}

interface CDPAXTreeResponse {
  nodes: CDPAXNode[]
}

const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'searchbox', 'combobox', 'listbox', 'option',
  'checkbox', 'radio', 'switch', 'slider', 'spinbutton',
  'menuitem', 'menuitemcheckbox', 'menuitemradio',
  'tab', 'treeitem', 'gridcell', 'columnheader', 'rowheader',
])

const STRUCTURAL_ROLES = new Set([
  'heading', 'img', 'figure', 'table', 'list', 'listitem',
  'navigation', 'main', 'article', 'region', 'banner',
  'contentinfo', 'complementary', 'form', 'search',
  'dialog', 'alertdialog', 'alert', 'status', 'tooltip',
  'progressbar', 'meter',
])

/**
 * Create an accessibility snapshot using CDP client
 */
export async function createAccessibilitySnapshot(
  cdpClient: CDPClient,
  verbose: boolean = false,
  pageUrl: string = '',
  pageTitle: string = ''
): Promise<AccessibilitySnapshot> {
  const snapshotId = `snap_${++snapshotCounter}`
  const idToNode = new Map<string, AccessibilityNode>()
  let nodeIndex = 0

  const response = await cdpClient.sendCommand<CDPAXTreeResponse>(
    'Accessibility.getFullAXTree'
  )

  if (!response?.nodes || response.nodes.length === 0) {
    throw new Error('Empty accessibility tree')
  }

  // Build node lookup
  const cdpNodeMap = new Map<string, CDPAXNode>()
  for (const node of response.nodes) {
    cdpNodeMap.set(node.nodeId, node)
  }

  const rootCDPNode = response.nodes.find(
    n => !n.ignored && !n.parentId
  ) || response.nodes[0]

  const convertNode = (cdpNode: CDPAXNode): AccessibilityNode | null => {
    if (cdpNode.ignored) {
      const children: AccessibilityNode[] = []
      if (cdpNode.childIds) {
        for (const childId of cdpNode.childIds) {
          const childCDPNode = cdpNodeMap.get(childId)
          if (childCDPNode) {
            const childNode = convertNode(childCDPNode)
            if (childNode) children.push(childNode)
          }
        }
      }
      if (children.length === 1) return children[0]
      if (children.length > 1) {
        const uid = `${snapshotId}_${nodeIndex++}`
        const node: AccessibilityNode = {
          uid, role: 'group', name: '', children,
          backendNodeId: cdpNode.backendDOMNodeId || 0,
        }
        idToNode.set(uid, node)
        return node
      }
      return null
    }

    const role = cdpNode.role?.value || 'generic'
    const name = cdpNode.name?.value || ''

    if (!verbose) {
      const isInteractive = INTERACTIVE_ROLES.has(role)
      const isStructural = STRUCTURAL_ROLES.has(role)
      const hasName = name.trim().length > 0

      if (!isInteractive && !isStructural && !hasName && role === 'generic') {
        const children: AccessibilityNode[] = []
        if (cdpNode.childIds) {
          for (const childId of cdpNode.childIds) {
            const childCDPNode = cdpNodeMap.get(childId)
            if (childCDPNode) {
              const childNode = convertNode(childCDPNode)
              if (childNode) children.push(childNode)
            }
          }
        }
        if (children.length === 1) return children[0]
        if (children.length > 1) {
          const uid = `${snapshotId}_${nodeIndex++}`
          const node: AccessibilityNode = {
            uid, role: 'group', name: '', children,
            backendNodeId: cdpNode.backendDOMNodeId || 0,
          }
          idToNode.set(uid, node)
          return node
        }
        return null
      }
    }

    const uid = `${snapshotId}_${nodeIndex++}`
    const node: AccessibilityNode = {
      uid, role, name,
      backendNodeId: cdpNode.backendDOMNodeId || 0,
      children: [],
    }

    if (cdpNode.value?.value !== undefined) {
      node.value = String(cdpNode.value.value)
    }
    if (cdpNode.description?.value) {
      node.description = cdpNode.description.value
    }

    if (cdpNode.properties) {
      for (const prop of cdpNode.properties) {
        switch (prop.name) {
          case 'focused':
            node.focused = prop.value.value === true
            break
          case 'checked':
            node.checked = prop.value.value === true || prop.value.value === 'true'
            break
          case 'disabled':
            node.disabled = prop.value.value === true
            break
          case 'expanded':
            node.expanded = prop.value.value === true
            break
          case 'selected':
            node.selected = prop.value.value === true
            break
          case 'required':
            node.required = prop.value.value === true
            break
          case 'level':
            node.level = Number(prop.value.value)
            break
        }
      }
    }

    if (cdpNode.childIds) {
      for (const childId of cdpNode.childIds) {
        const childCDPNode = cdpNodeMap.get(childId)
        if (childCDPNode) {
          const childNode = convertNode(childCDPNode)
          if (childNode) node.children.push(childNode)
        }
      }
    }

    idToNode.set(uid, node)
    return node
  }

  const root = convertNode(rootCDPNode) || {
    uid: `${snapshotId}_0`,
    role: 'document',
    name: 'Empty page',
    children: [],
    backendNodeId: 0,
  }

  const snapshot: AccessibilitySnapshot = {
    root,
    snapshotId,
    timestamp: Date.now(),
    url: pageUrl,
    title: pageTitle,
    idToNode,
    format: function(verbose?: boolean): string {
      return formatSnapshot(this, verbose)
    }
  }

  return snapshot
}

/**
 * Format accessibility snapshot as text for AI consumption
 */
function formatSnapshot(snapshot: AccessibilitySnapshot, verbose: boolean = false): string {
  const lines: string[] = []

  lines.push(`# Page: ${snapshot.title}`)
  lines.push(`URL: ${snapshot.url}`)
  lines.push('')

  const formatNode = (node: AccessibilityNode, indent: number = 0): void => {
    const prefix = '  '.repeat(indent)
    const attributes: string[] = []

    attributes.push(`uid=${node.uid}`)

    if (node.role) {
      attributes.push(node.role === 'none' ? 'ignored' : node.role)
    }

    if (node.name) {
      attributes.push(`"${node.name}"`)
    }

    if (node.disabled !== undefined) {
      attributes.push('disableable')
      if (node.disabled) attributes.push('disabled')
    }
    if (node.expanded !== undefined) {
      attributes.push('expandable')
      if (node.expanded) attributes.push('expanded')
    }
    if (node.focused !== undefined) {
      attributes.push('focusable')
      if (node.focused) attributes.push('focused')
    }
    if (node.selected !== undefined) {
      attributes.push('selectable')
      if (node.selected) attributes.push('selected')
    }

    if (node.checked) attributes.push('checked')
    if (node.required) attributes.push('required')

    if (node.value !== undefined) {
      attributes.push(`value="${node.value}"`)
    }
    if (node.level !== undefined) {
      attributes.push(`level="${node.level}"`)
    }
    if (verbose && node.description) {
      attributes.push(`description="${node.description}"`)
    }

    lines.push(prefix + attributes.join(' '))

    for (const child of node.children) {
      formatNode(child, indent + 1)
    }
  }

  formatNode(snapshot.root)
  return lines.join('\n')
}

/**
 * Get element bounding box by backend node ID
 */
export async function getElementBoundingBox(
  cdpClient: CDPClient,
  backendNodeId: number
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  try {
    const response = await cdpClient.sendCommand<{ model?: { content: number[] } }>(
      'DOM.getBoxModel',
      { backendNodeId }
    )

    if (!response?.model?.content) return null

    const content = response.model.content
    const x = Math.min(content[0], content[2], content[4], content[6])
    const y = Math.min(content[1], content[3], content[5], content[7])
    const maxX = Math.max(content[0], content[2], content[4], content[6])
    const maxY = Math.max(content[1], content[3], content[5], content[7])

    return { x, y, width: maxX - x, height: maxY - y }
  } catch (error) {
    console.error('[Snapshot] Failed to get bounding box:', error)
    return null
  }
}

/**
 * Scroll element into view
 */
export async function scrollIntoView(
  cdpClient: CDPClient,
  backendNodeId: number
): Promise<void> {
  try {
    const resolveResponse = await cdpClient.sendCommand<{
      object?: { objectId?: string }
    }>('DOM.resolveNode', { backendNodeId })

    if (resolveResponse?.object?.objectId) {
      await cdpClient.sendCommand('Runtime.callFunctionOn', {
        objectId: resolveResponse.object.objectId,
        functionDeclaration: `function() {
          this.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
        }`,
        awaitPromise: true
      })
    }
  } catch (error) {
    console.error('[Snapshot] Failed to scroll into view:', error)
  }
}

/**
 * Focus an element by backend node ID
 */
export async function focusElement(
  cdpClient: CDPClient,
  backendNodeId: number
): Promise<void> {
  try {
    await cdpClient.sendCommand('DOM.focus', { backendNodeId })
  } catch (error) {
    console.error('[Snapshot] Failed to focus element:', error)
  }
}
