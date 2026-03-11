import { browserHostRuntime } from './browser/runtime'
import { desktopHostRuntime } from './desktop/runtime'
import { perceptionHostRuntime } from './perception/runtime'
import { hostStatusRuntime } from './status/runtime'
import { stepReporterRuntime } from './step-reporter/runtime'
import type { HostRuntime } from './types'

export const hostRuntime: HostRuntime = {
  browser: browserHostRuntime,
  desktop: desktopHostRuntime,
  perception: perceptionHostRuntime,
  stepReporter: stepReporterRuntime,
  status: hostStatusRuntime
}

export {
  browserHostRuntime,
  desktopHostRuntime,
  perceptionHostRuntime,
  hostStatusRuntime,
  stepReporterRuntime
}

export type * from './types'
