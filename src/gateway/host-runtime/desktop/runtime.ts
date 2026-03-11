import {
  executeAppleScript,
  openMacOSApplication
} from '../../../main/services/local-tools/macos-ui'
import type {
  DesktopHostCapabilities,
  DesktopHostRuntime,
  OpenDesktopApplicationInput,
  RunAppleScriptInput
} from '../types'

export class DesktopHostRuntimeAdapter implements DesktopHostRuntime {
  getCapabilities(): DesktopHostCapabilities {
    const isMacOS = process.platform === 'darwin'
    return {
      platform: process.platform,
      supportsOpenApplication: isMacOS,
      supportsAppleScript: isMacOS
    }
  }

  async openApplication(args: OpenDesktopApplicationInput) {
    return await openMacOSApplication(args)
  }

  async runAppleScript(args: RunAppleScriptInput) {
    return await executeAppleScript(args)
  }
}

export const desktopHostRuntime = new DesktopHostRuntimeAdapter()
