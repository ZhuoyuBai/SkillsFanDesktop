import { browserHostRuntime } from '../browser/runtime'
import { desktopHostRuntime } from '../desktop/runtime'
import { getDesktopSmokeFlowRunSnapshot } from '../desktop/smoke-flows'
import type { HostStatusRuntime } from '../types'
import {
  getMacOSAccessibilityPermissionStatus,
  getMacOSScreenRecordingPermissionStatus
} from '../../../main/services/local-tools/macos-ui'

export class HostStatusRuntimeAdapter implements HostStatusRuntime {
  async getEnvironmentStatus() {
    const browserCapabilities = browserHostRuntime.getCapabilities('automated')
    const desktopCapabilities = desktopHostRuntime.getCapabilities()
    const isDesktopSupported = process.platform === 'darwin'
    const [accessibility, screenRecording] = await Promise.all([
      getMacOSAccessibilityPermissionStatus(),
      getMacOSScreenRecordingPermissionStatus()
    ])
    const blockedActionIds = new Set(
      desktopCapabilities.actions
        .filter((action) => (
          action.supported
          && action.requiresAccessibilityPermission
          && accessibility.state !== 'granted'
        ))
        .map((action) => action.id)
    )

    return {
      platform: process.platform,
      browser: {
        state: browserCapabilities.toolNames.length > 0 ? 'ready' : 'unsupported',
        backend: browserCapabilities.backend,
        toolCount: browserCapabilities.toolNames.length
      },
      desktop: {
        state: isDesktopSupported ? 'ready' : 'unsupported',
        backend: desktopCapabilities.backend,
        actions: desktopCapabilities.actions.map((action) => ({
          id: action.id,
          supported: action.supported,
          requiresAccessibilityPermission: action.requiresAccessibilityPermission,
          blockedByPermission: Boolean(
            action.supported
            && action.requiresAccessibilityPermission
            && accessibility.state !== 'granted'
          ),
          notes: action.notes
        })),
        adapters: desktopCapabilities.adapters.map((adapter) => {
          const methods = adapter.methods?.map((method) => ({
            id: method.id,
            displayName: method.displayName,
            action: method.action,
            supported: method.supported,
            stage: method.stage,
            notes: method.notes
          }))
          const methodById = new Map(methods?.map((method) => [method.id, method]) ?? [])
          const buildBlockedDescriptor = (methodIds: string[]) => {
            const blockedMethodIds = methodIds.filter((methodId) => {
              const method = methodById.get(methodId)
              return Boolean(method && blockedActionIds.has(method.action))
            })
            const blockedByPermission = blockedMethodIds.length > 0

            return {
              blockedByPermission,
              blockedMethodIds,
              recoveryHint: blockedByPermission
                ? 'Grant macOS Accessibility permission to unlock shortcut, keyboard, mouse, and window-control steps in this flow.'
                : undefined
            }
          }

          return {
            id: adapter.id,
            displayName: adapter.displayName,
            supported: adapter.supported,
            stage: adapter.stage,
            applicationNames: adapter.applicationNames,
            actions: adapter.actions,
            methods,
            workflows: adapter.workflows?.map((workflow) => {
              const blockedDescriptor = buildBlockedDescriptor(workflow.methodIds)

              return {
                id: workflow.id,
                displayName: workflow.displayName,
                supported: workflow.supported,
                stage: workflow.stage,
                methodIds: workflow.methodIds,
                blockedByPermission: blockedDescriptor.blockedByPermission,
                blockedMethodIds: blockedDescriptor.blockedMethodIds,
                recoveryHint: blockedDescriptor.blockedByPermission
                  ? 'Grant macOS Accessibility permission to unlock shortcut, keyboard, mouse, and window-control steps in this workflow.'
                  : undefined,
                notes: workflow.notes
              }
            }),
            smokeFlows: adapter.smokeFlows?.map((smokeFlow) => {
              const blockedDescriptor = buildBlockedDescriptor(smokeFlow.methodIds)
              const lastRun = getDesktopSmokeFlowRunSnapshot(smokeFlow.id)

              return {
                id: smokeFlow.id,
                displayName: smokeFlow.displayName,
                supported: smokeFlow.supported,
                stage: smokeFlow.stage,
                methodIds: smokeFlow.methodIds,
                blockedByPermission: blockedDescriptor.blockedByPermission,
                blockedMethodIds: blockedDescriptor.blockedMethodIds,
                verification: smokeFlow.verification,
                recoveryHint: blockedDescriptor.recoveryHint,
                lastRun: lastRun
                  ? {
                    state: lastRun.state,
                    startedAt: lastRun.startedAt,
                    finishedAt: lastRun.finishedAt,
                    durationMs: lastRun.durationMs,
                    summary: lastRun.summary,
                    error: lastRun.error ?? undefined
                  }
                  : undefined,
                notes: smokeFlow.notes
              }
            }),
            notes: adapter.notes
          }
        }),
        errorCodes: desktopCapabilities.errorCodes
      },
      permissions: {
        accessibility,
        screenRecording
      }
    }
  }
}

export const hostStatusRuntime = new HostStatusRuntimeAdapter()
