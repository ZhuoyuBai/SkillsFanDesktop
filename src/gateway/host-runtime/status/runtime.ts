import { browserHostRuntime } from '../browser/runtime'
import type { HostStatusRuntime } from '../types'
import {
  getMacOSAccessibilityPermissionStatus,
  getMacOSScreenRecordingPermissionStatus
} from '../../../main/services/local-tools/macos-ui'

export class HostStatusRuntimeAdapter implements HostStatusRuntime {
  async getEnvironmentStatus() {
    const browserCapabilities = browserHostRuntime.getCapabilities('automated')
    const isDesktopSupported = process.platform === 'darwin'
    const [accessibility, screenRecording] = await Promise.all([
      getMacOSAccessibilityPermissionStatus(),
      getMacOSScreenRecordingPermissionStatus()
    ])

    return {
      platform: process.platform,
      browser: {
        state: browserCapabilities.toolNames.length > 0 ? 'ready' : 'unsupported',
        backend: browserCapabilities.backend,
        toolCount: browserCapabilities.toolNames.length
      },
      desktop: {
        state: isDesktopSupported ? 'ready' : 'unsupported'
      },
      permissions: {
        accessibility,
        screenRecording
      }
    }
  }
}

export const hostStatusRuntime = new HostStatusRuntimeAdapter()
