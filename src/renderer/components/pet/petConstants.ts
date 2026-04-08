import sleepingVideo from '../../assets/pet/sleeping.mp4'
import normalVideo from '../../assets/pet/normal.mp4'
import busyVideo from '../../assets/pet/busy.mp4'
import overwhelmedVideo from '../../assets/pet/overwhelmed.mp4'
import lightSleepingVideo from '../../assets/pet/light-sleeping.mp4'
import lightNormalVideo from '../../assets/pet/light-normal.mp4'
import lightBusyVideo from '../../assets/pet/light-busy.mp4'
import lightOverwhelmedVideo from '../../assets/pet/light-overwhelmed.mp4'

export const PET_SIZE = 120
export const PET_DEFAULT_POSITION = { right: 20, bottom: 20 }

export type PetActivityState = 'sleeping' | 'normal' | 'busy' | 'overwhelmed'

// Busy tiers mirror ccusage burn-rate thresholds. Sleeping remains the zero-activity state.
export const PET_THRESHOLDS = {
  sleeping: 1,
  busy: 10000,
  overwhelmed: 100000,
}

export const HYSTERESIS_COUNT = 1
export const POLL_INTERVAL_MS = 2000
export const LIVE_OUTPUT_HOLD_MS = 4000

export const PET_VIDEOS_DARK: Record<PetActivityState, string> = {
  sleeping: sleepingVideo,
  normal: normalVideo,
  busy: busyVideo,
  overwhelmed: overwhelmedVideo,
}

export const PET_VIDEOS_LIGHT: Record<PetActivityState, string> = {
  sleeping: lightSleepingVideo,
  normal: lightNormalVideo,
  busy: lightBusyVideo,
  overwhelmed: lightOverwhelmedVideo,
}
