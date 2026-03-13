import type { DesktopAdapterMethodCapability, DesktopKeyModifier } from '../../types'

export const skillsfanAdapterMethods: DesktopAdapterMethodCapability[] = [
  {
    id: 'skillsfan.focus_main_window',
    displayName: 'Focus Main Window',
    action: 'focus_window',
    supported: true,
    stage: 'active',
    notes: 'Focuses the primary SkillsFan window through a structured adapter method.'
  },
  {
    id: 'skillsfan.open_settings',
    displayName: 'Open Settings',
    action: 'press_key',
    supported: true,
    stage: 'active',
    notes: 'Opens the first-party settings surface via a structured shortcut helper.'
  }
]

export function buildSkillsFanOpenSettingsShortcut(): {
  key: string
  modifiers: DesktopKeyModifier[]
} {
  return {
    key: ',',
    modifiers: ['command']
  }
}
