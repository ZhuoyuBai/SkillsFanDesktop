import { describe, expect, it } from 'vitest'
import {
  classifyMacOSAutomationFailure,
  getMacOSAutomationErrorCode
} from '../../../../src/main/services/local-tools/macos-ui'

describe('macos-ui automation error helpers', () => {
  it('classifies timeout failures', () => {
    expect(classifyMacOSAutomationFailure({
      stdout: '',
      stderr: '',
      timedOut: true,
      returnCode: null
    })).toBe('timeout')
  })

  it('classifies permission failures', () => {
    expect(classifyMacOSAutomationFailure({
      stdout: '',
      stderr: 'System Events got an error: osascript is not allowed assistive access.',
      timedOut: false,
      returnCode: 1
    })).toBe('permission_denied')
  })

  it('classifies missing applications', () => {
    expect(classifyMacOSAutomationFailure({
      stdout: '',
      stderr: 'Unable to find application named "Missing App".',
      timedOut: false,
      returnCode: 1
    })).toBe('app_not_found')
  })

  it('classifies missing windows', () => {
    expect(classifyMacOSAutomationFailure({
      stdout: '',
      stderr: 'Cannot get window 2 of application process "Finder". Invalid index.',
      timedOut: false,
      returnCode: 1
    })).toBe('window_not_found')
  })

  it('classifies missing browser tabs as window-not-found failures', () => {
    expect(classifyMacOSAutomationFailure({
      stdout: '',
      stderr: 'Tab not found: Dashboard',
      timedOut: false,
      returnCode: 1
    })).toBe('window_not_found')
  })

  it('falls back to execution_failed for unknown command failures', () => {
    expect(classifyMacOSAutomationFailure({
      stdout: '',
      stderr: 'Unexpected automation failure.',
      timedOut: false,
      returnCode: 1
    })).toBe('execution_failed')
  })

  it('reads structured error codes from thrown errors', () => {
    const error = new Error('macOS UI automation is only supported on macOS.') as Error & { code?: string }
    error.code = 'unsupported_platform'

    expect(getMacOSAutomationErrorCode(error)).toBe('unsupported_platform')
  })
})
