import {
  activateMacOSApplication,
  clickMacOSAtCoordinate,
  executeAppleScript,
  focusMacOSWindow,
  listMacOSWindows,
  moveMacOSMouse,
  openMacOSApplication,
  pressMacOSKey,
  scrollMacOS,
  typeMacOSText
} from '../../../main/services/local-tools/macos-ui'
import { listDesktopAppAdapters } from './adapters/registry'
import type {
  ActivateDesktopApplicationInput,
  ClickDesktopAtCoordinateInput,
  DesktopHostCapabilities,
  DesktopHostRuntime,
  FocusDesktopWindowInput,
  ListDesktopWindowsInput,
  MoveDesktopMouseInput,
  OpenDesktopApplicationInput,
  PressDesktopKeyInput,
  RunAppleScriptInput,
  ScrollDesktopInput,
  TypeDesktopTextInput
} from '../types'

export class DesktopHostRuntimeAdapter implements DesktopHostRuntime {
  getCapabilities(): DesktopHostCapabilities {
    const isMacOS = process.platform === 'darwin'
    const unsupportedNote = 'Desktop automation is only available on macOS.'
    const accessibilityNote = isMacOS
      ? 'Requires macOS Accessibility permission.'
      : unsupportedNote
    const adapters = listDesktopAppAdapters(process.platform)

    return {
      platform: process.platform,
      backend: isMacOS ? 'generic-macos' : 'unsupported',
      supportsOpenApplication: isMacOS,
      supportsAppleScript: isMacOS,
      supportsActivateApplication: isMacOS,
      supportsPressKey: isMacOS,
      supportsTypeText: isMacOS,
      supportsClick: isMacOS,
      supportsScroll: isMacOS,
      supportsWindowManagement: isMacOS,
      actions: [
        {
          id: 'open_application',
          supported: isMacOS,
          notes: isMacOS
            ? 'Launches a real macOS application or target URL/file.'
            : unsupportedNote
        },
        {
          id: 'run_applescript',
          supported: isMacOS,
          notes: isMacOS
            ? 'Advanced escape hatch for actions not yet covered by structured desktop tools.'
            : unsupportedNote
        },
        {
          id: 'activate_application',
          supported: isMacOS,
          notes: isMacOS
            ? 'Brings an existing application to the foreground.'
            : unsupportedNote
        },
        {
          id: 'press_key',
          supported: isMacOS,
          requiresAccessibilityPermission: isMacOS,
          notes: accessibilityNote
        },
        {
          id: 'type_text',
          supported: isMacOS,
          requiresAccessibilityPermission: isMacOS,
          notes: accessibilityNote
        },
        {
          id: 'click',
          supported: isMacOS,
          requiresAccessibilityPermission: isMacOS,
          notes: accessibilityNote
        },
        {
          id: 'move_mouse',
          supported: isMacOS,
          requiresAccessibilityPermission: isMacOS,
          notes: accessibilityNote
        },
        {
          id: 'scroll',
          supported: isMacOS,
          requiresAccessibilityPermission: isMacOS,
          notes: accessibilityNote
        },
        {
          id: 'list_windows',
          supported: isMacOS,
          requiresAccessibilityPermission: isMacOS,
          notes: accessibilityNote
        },
        {
          id: 'focus_window',
          supported: isMacOS,
          requiresAccessibilityPermission: isMacOS,
          notes: accessibilityNote
        }
      ],
      adapters,
      errorCodes: [
        'unsupported_platform',
        'invalid_input',
        'timeout',
        'permission_denied',
        'app_not_found',
        'window_not_found',
        'execution_failed'
      ]
    }
  }

  async openApplication(args: OpenDesktopApplicationInput) {
    return await openMacOSApplication(args)
  }

  async runAppleScript(args: RunAppleScriptInput) {
    return await executeAppleScript(args)
  }

  async activateApplication(args: ActivateDesktopApplicationInput) {
    return await activateMacOSApplication(args)
  }

  async pressKey(args: PressDesktopKeyInput) {
    return await pressMacOSKey(args)
  }

  async typeText(args: TypeDesktopTextInput) {
    return await typeMacOSText(args)
  }

  async clickAtCoordinate(args: ClickDesktopAtCoordinateInput) {
    return await clickMacOSAtCoordinate(args)
  }

  async moveMouse(args: MoveDesktopMouseInput) {
    return await moveMacOSMouse(args)
  }

  async scroll(args: ScrollDesktopInput) {
    return await scrollMacOS(args)
  }

  async listWindows(args: ListDesktopWindowsInput) {
    return await listMacOSWindows(args)
  }

  async focusWindow(args: FocusDesktopWindowInput) {
    return await focusMacOSWindow(args)
  }
}

export const desktopHostRuntime = new DesktopHostRuntimeAdapter()
