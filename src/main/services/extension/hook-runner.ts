/**
 * Extension Hook Runner - Safe execution of extension hooks
 *
 * Runs hooks across all enabled extensions with:
 * - Error isolation: one extension failing doesn't affect others
 * - Timeout protection: hooks are limited to 5 seconds
 * - Logging: execution time and errors are recorded
 */

import type { LoadedExtension, ExtensionHooks } from './types'

const HOOK_TIMEOUT_MS = 5000

/**
 * Run a hook across all enabled extensions.
 * Returns an array of results from each extension that defines the hook.
 * Errors are caught and logged, never propagated.
 */
export async function runHook<K extends keyof ExtensionHooks>(
  extensions: LoadedExtension[],
  hookName: K,
  ...args: Parameters<NonNullable<ExtensionHooks[K]>>
): Promise<ReturnType<NonNullable<ExtensionHooks[K]>>[]> {
  const results: any[] = []

  for (const ext of extensions) {
    if (!ext.enabled) continue

    const hookFn = ext.hooks[hookName] as Function | undefined
    if (!hookFn) continue

    try {
      const result = await Promise.race([
        Promise.resolve(hookFn(...args)),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Hook timeout (${HOOK_TIMEOUT_MS}ms)`)), HOOK_TIMEOUT_MS)
        )
      ])
      results.push(result)
    } catch (error) {
      console.error(`[Extension] Hook "${hookName}" failed in ${ext.manifest.id}:`, error)
      ext.error = `Hook "${hookName}" error: ${error}`
    }
  }

  return results
}

/**
 * Run onBuildSystemPrompt hooks and collect all prompt fragments.
 * Returns a concatenated string of all non-empty results.
 */
export async function runSystemPromptHooks(
  extensions: LoadedExtension[],
  context: Parameters<NonNullable<ExtensionHooks['onBuildSystemPrompt']>>[0]
): Promise<string> {
  const results = await runHook(extensions, 'onBuildSystemPrompt', context)
  return results.filter(Boolean).join('\n\n')
}

/**
 * Run onBeforeToolUse hooks.
 * If ANY extension returns { behavior: 'deny' }, the tool is blocked.
 * Returns the first deny result, or { behavior: 'allow' } if all pass.
 */
export async function runToolUseHooks(
  extensions: LoadedExtension[],
  toolName: string,
  input: Record<string, any>
): Promise<{ behavior: 'allow' | 'deny'; message?: string; updatedInput?: Record<string, any> }> {
  for (const ext of extensions) {
    if (!ext.enabled || !ext.hooks.onBeforeToolUse) continue

    try {
      const result = await Promise.race([
        Promise.resolve(ext.hooks.onBeforeToolUse(toolName, input)),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Hook timeout`)), HOOK_TIMEOUT_MS)
        )
      ])

      if (result.behavior === 'deny') {
        console.log(`[Extension] Tool "${toolName}" denied by ${ext.manifest.id}: ${result.message || '(no reason)'}`)
        return result
      }

      if (result.updatedInput) {
        input = result.updatedInput
      }
    } catch (error) {
      console.error(`[Extension] onBeforeToolUse failed in ${ext.manifest.id}:`, error)
      // Don't block tool on extension error
    }
  }

  return { behavior: 'allow', updatedInput: input }
}

/**
 * Run onBeforeSendMessage hooks.
 * Each extension can modify the message text; changes are chained.
 */
export async function runBeforeSendMessageHooks(
  extensions: LoadedExtension[],
  message: string,
  context: Parameters<NonNullable<ExtensionHooks['onBeforeSendMessage']>>[1]
): Promise<string> {
  let currentMessage = message

  for (const ext of extensions) {
    if (!ext.enabled || !ext.hooks.onBeforeSendMessage) continue

    try {
      const result = await Promise.race([
        Promise.resolve(ext.hooks.onBeforeSendMessage(currentMessage, context)),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Hook timeout`)), HOOK_TIMEOUT_MS)
        )
      ])

      if (typeof result === 'string') {
        currentMessage = result
      }
    } catch (error) {
      console.error(`[Extension] onBeforeSendMessage failed in ${ext.manifest.id}:`, error)
    }
  }

  return currentMessage
}

/**
 * Run getMcpServers hooks and merge all server configs.
 * Extension server names are prefixed with 'ext-{extensionId}-' to avoid conflicts.
 */
export async function runGetMcpServersHooks(
  extensions: LoadedExtension[]
): Promise<Record<string, any>> {
  const merged: Record<string, any> = {}

  for (const ext of extensions) {
    if (!ext.enabled || !ext.hooks.getMcpServers) continue

    try {
      const servers = await Promise.race([
        Promise.resolve(ext.hooks.getMcpServers()),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Hook timeout`)), HOOK_TIMEOUT_MS)
        )
      ])

      if (servers && typeof servers === 'object') {
        for (const [name, config] of Object.entries(servers)) {
          const prefixedName = `ext-${ext.manifest.id}-${name}`
          merged[prefixedName] = config
        }
      }
    } catch (error) {
      console.error(`[Extension] getMcpServers failed in ${ext.manifest.id}:`, error)
    }
  }

  return merged
}
