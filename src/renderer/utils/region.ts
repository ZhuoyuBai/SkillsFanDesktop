/**
 * Region-aware URL helper for renderer
 *
 * Uses build-time injected __SKILLSFAN_REGION__ constant.
 * Falls back to language detection when region is not set (default build).
 */

import { getCurrentLanguage } from '../i18n'

// Build-time injected constant (from electron.vite.config.ts)
declare const __SKILLSFAN_REGION__: string

/**
 * Get the SkillsFan base URL based on region
 * Priority: build-time region > language detection
 */
export function getSkillsFanBaseUrl(): string {
  const region = __SKILLSFAN_REGION__
  if (region === 'cn') return 'https://www.skills.fan'
  if (region === 'overseas') return 'https://skillsfan.com'

  // No build-time region — fallback to language detection
  const lang = getCurrentLanguage()
  return lang.startsWith('zh') ? 'https://www.skills.fan' : 'https://skillsfan.com'
}
