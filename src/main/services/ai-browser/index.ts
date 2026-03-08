/**
 * AI Browser Module - Main Entry Point
 *
 * This module provides AI-controlled browser capabilities for SkillsFan.
 * It connects to the user's real Chrome browser via CDP WebSocket,
 * enabling full automation without being detected as a bot.
 *
 * Key Features:
 * - 26 browser control tools compatible with Claude Agent SDK
 * - Real Chrome browser (user's login sessions preserved)
 * - No automation detection banner
 * - Accessibility tree-based element identification
 * - Network and console monitoring
 * - Screenshot capture
 * - Device/network emulation
 *
 * Usage:
 * 1. Initialize with main window
 * 2. Create SDK MCP server with createAIBrowserMcpServer()
 * 3. Pass to SDK via mcpServers option
 */

import { BrowserWindow } from 'electron'
import { browserContext, BrowserContext } from './context'
import {
  allTools,
  getToolNames,
  getToolDefinitions,
  findTool
} from './tools'
import type { AIBrowserTool, ToolResult } from './types'
import { AI_BROWSER_SYSTEM_PROMPT } from './prompt'
import { isAIBrowserTool as isAIBrowserToolName } from './tool-utils'

// Import SDK MCP server creator
import { createAIBrowserMcpServer, getAIBrowserSdkToolNames } from './sdk-mcp-server'

// Re-export SDK MCP server functions
export { createAIBrowserMcpServer, getAIBrowserSdkToolNames }

// ============================================
// Module Initialization
// ============================================

/**
 * Initialize the AI Browser module
 * Must be called with the main window before using any tools
 */
export function initializeAIBrowser(mainWindow: BrowserWindow): void {
  browserContext.initialize(mainWindow)
  console.log('[AI Browser] Module initialized (real Chrome mode)')
}

// ============================================
// Tool Registration
// ============================================

export function getAIBrowserToolNames(): string[] {
  return getToolNames()
}

export function getAIBrowserToolDefinitions() {
  return getToolDefinitions()
}

export function isAIBrowserTool(toolName: string): boolean {
  return isAIBrowserToolName(toolName)
}

// ============================================
// Tool Execution
// ============================================

export async function executeAIBrowserTool(
  toolName: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const tool = findTool(toolName)

  if (!tool) {
    return {
      content: `Unknown AI Browser tool: ${toolName}`,
      isError: true
    }
  }

  try {
    console.log(`[AI Browser] Executing tool: ${toolName}`)
    const result = await tool.handler(params, browserContext)
    console.log(`[AI Browser] Tool completed: ${toolName}`)
    return result
  } catch (error) {
    console.error(`[AI Browser] Tool error: ${toolName}`, error)
    return {
      content: `Tool execution failed: ${(error as Error).message}`,
      isError: true
    }
  }
}

// ============================================
// System Prompt
// ============================================

export { AI_BROWSER_SYSTEM_PROMPT }

// ============================================
// Context Access
// ============================================

export function getBrowserContext(): BrowserContext {
  return browserContext
}

export function setActiveBrowserView(viewId: string): void {
  browserContext.setActiveViewId(viewId)
}

export function cleanupAIBrowser(): void {
  browserContext.destroy()
  console.log('[AI Browser] Module cleaned up')
}

// Re-export types
export type { AIBrowserTool, ToolResult } from './types'
