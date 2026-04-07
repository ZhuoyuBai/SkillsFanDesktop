import sleepingVideo from '../../assets/pet/sleeping.mp4'
import normalVideo from '../../assets/pet/normal.mp4'
import busyVideo from '../../assets/pet/busy.mp4'
import overwhelmedVideo from '../../assets/pet/overwhelmed.mp4'

export const PET_SIZE = 120
export const PET_DEFAULT_POSITION = { right: 20, bottom: 20 }

export type PetActivityState = 'sleeping' | 'normal' | 'busy' | 'overwhelmed'

// Thresholds based on weighted-average tokens/minute across the last 3 completed minutes
export const PET_THRESHOLDS = {
  normal: 1,
  busy: 60000,
  overwhelmed: 200000,
}

export const HYSTERESIS_COUNT = 2
export const POLL_INTERVAL_MS = 5000

export const PET_VIDEOS: Record<PetActivityState, string> = {
  sleeping: sleepingVideo,
  normal: normalVideo,
  busy: busyVideo,
  overwhelmed: overwhelmedVideo,
}
