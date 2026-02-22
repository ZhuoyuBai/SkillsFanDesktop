/**
 * AI Browser lightweight tool helpers.
 *
 * Keep these helpers independent from the heavy ai-browser module entrypoint
 * so agent hot paths can perform tool-name checks without importing browser internals.
 */

export const AI_BROWSER_TOOL_PREFIX = 'browser_'

export function isAIBrowserTool(toolName: string): boolean {
  return toolName.startsWith(AI_BROWSER_TOOL_PREFIX)
}
