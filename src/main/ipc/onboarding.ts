/**
 * Onboarding IPC Handlers
 */

import {
  writeOnboardingArtifact,
  saveOnboardingConversation
} from '../services/onboarding.service'
import { ipcHandle } from './utils'

export function registerOnboardingHandlers(): void {
  ipcHandle('onboarding:write-artifact',
    (_e, spaceId: string, filename: string, content: string) =>
      writeOnboardingArtifact(spaceId, filename, content)
  )

  ipcHandle('onboarding:save-conversation',
    (_e, spaceId: string, userPrompt: string, aiResponse: string) =>
      saveOnboardingConversation(spaceId, userPrompt, aiResponse)
  )
}
