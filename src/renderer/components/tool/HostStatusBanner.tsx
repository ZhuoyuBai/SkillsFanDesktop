import { AlertCircle, CheckCircle2, Globe2, Monitor } from 'lucide-react'
import { useTranslation } from '../../i18n'
import type { HostEnvironmentStatus, HostStep } from '../../types'

interface HostStatusBannerProps {
  status: HostEnvironmentStatus
  steps?: HostStep[]
}

type ActionState = 'ready' | 'needs_permission' | 'unsupported' | 'unknown'
type HostUsageScope = 'web' | 'computer' | 'mixed'

function getStateTone(state: ActionState) {
  switch (state) {
    case 'ready':
      return 'success'
    case 'needs_permission':
      return 'warning'
    default:
      return 'neutral'
  }
}

function getStateLabel(state: ActionState, t: (key: string) => string) {
  switch (state) {
    case 'ready':
      return t('Ready')
    case 'needs_permission':
      return t('Turn on')
    case 'unsupported':
      return t('Not supported')
    default:
      return t('Checking')
  }
}

function getComputerActionState(status: HostEnvironmentStatus): ActionState {
  if (status.desktop.state === 'unsupported') {
    return 'unsupported'
  }

  if (status.desktop.state !== 'ready') {
    return 'unknown'
  }

  if (
    status.permissions.accessibility.state === 'needs_permission'
    || status.permissions.screenRecording.state === 'needs_permission'
  ) {
    return 'needs_permission'
  }

  if (
    status.permissions.accessibility.state === 'unknown'
    || status.permissions.screenRecording.state === 'unknown'
  ) {
    return 'unknown'
  }

  return 'ready'
}

function getUsageScope(steps: HostStep[]): HostUsageScope {
  const usesWeb = steps.some((step) => (
    step.category === 'browser' || step.action.startsWith('browser_')
  ))
  const usesComputer = steps.some((step) => (
    step.category === 'desktop'
    || step.action.startsWith('desktop_')
    || (step.category === 'perception' && step.action.startsWith('desktop_'))
  ))

  if (usesComputer && !usesWeb) return 'computer'
  if (usesWeb && !usesComputer) return 'web'
  return 'mixed'
}

function getBannerCopy(args: {
  webState: ActionState
  computerState: ActionState
  scope: HostUsageScope
  t: (key: string) => string
}) {
  const { webState, computerState, scope, t } = args

  if (scope === 'computer') {
    if (computerState === 'ready') {
      return {
        tone: 'success' as const,
        title: t('AI can control your computer'),
        description: t('It can read the screen, capture desktop screenshots, and work with desktop interfaces.')
      }
    }

    if (computerState === 'needs_permission') {
      return {
        tone: 'warning' as const,
        title: t('To use computer actions, turn on system permissions first'),
        description: t('Desktop screenshots, desktop element reading, and computer control need system access.')
      }
    }

    if (computerState === 'unsupported') {
      return {
        tone: 'neutral' as const,
        title: t('This device does not support computer actions'),
        description: t("Web automation may still work, but desktop actions aren't available on this device.")
      }
    }

    return {
      tone: 'neutral' as const,
      title: t('AI is checking computer access'),
      description: t("We'll show you when screen reading and computer actions are ready.")
    }
  }

  if (scope === 'web') {
    if (webState === 'ready') {
      return {
        tone: 'success' as const,
        title: t('AI can use the web'),
        description: t('It can open pages, read page structure, and take page screenshots.')
      }
    }

    if (webState === 'unsupported') {
      return {
        tone: 'neutral' as const,
        title: t('Web automation is not available right now'),
        description: t("You can still use chat, but page actions aren't ready.")
      }
    }

    return {
      tone: 'neutral' as const,
      title: t('AI is checking web access'),
      description: t("We'll show you when page actions are ready.")
    }
  }

  if (webState === 'ready' && computerState === 'ready') {
    return {
      tone: 'success' as const,
      title: t('AI can now use the web and your computer'),
      description: t('It can now open pages, take screenshots, read interfaces, and perform computer actions.')
    }
  }

  if (webState === 'ready' && computerState === 'needs_permission') {
    return {
      tone: 'warning' as const,
      title: t("AI can use the web, but it can't see your screen yet"),
      description: t('To take screenshots, read desktop elements, or control your computer, turn on the required system permissions first.')
    }
  }

  if (webState === 'ready') {
    return {
      tone: 'success' as const,
      title: t('AI can use the web'),
      description: t("Computer control isn't supported on this device, but web automation is available.")
    }
  }

  if (computerState === 'ready') {
    return {
      tone: 'success' as const,
      title: t('AI can control your computer'),
      description: t("It can read the screen and perform computer actions, but web automation isn't ready.")
    }
  }

  return {
    tone: 'neutral' as const,
    title: t('AI is still checking what it can use'),
    description: t("We'll show you when web and computer actions are ready.")
  }
}

function StatusPill(args: {
  icon: typeof Globe2
  label: string
  value: string
  tone: 'success' | 'warning' | 'neutral'
}) {
  const className = args.tone === 'success'
    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700'
    : args.tone === 'warning'
      ? 'border-amber-500/20 bg-amber-500/10 text-amber-700'
      : 'border-border/50 bg-background/80 text-muted-foreground'

  const Icon = args.icon

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${className}`}>
      <Icon size={12} />
      <span>{args.label}</span>
      <span>{args.value}</span>
    </span>
  )
}

export function HostStatusBanner({ status, steps = [] }: HostStatusBannerProps) {
  const { t, i18n } = useTranslation()
  const webState: ActionState = status.browser.state === 'ready' ? 'ready' : status.browser.state
  const computerState = getComputerActionState(status)
  const scope = getUsageScope(steps)
  if (scope === 'computer' && computerState === 'unknown' && steps.length > 0) {
    return null
  }

  const copy = getBannerCopy({ webState, computerState, scope, t })
  const permissionItems = [
    status.permissions.screenRecording.state === 'needs_permission' ? t('Read screen') : null,
    status.permissions.accessibility.state === 'needs_permission' ? t('Control computer') : null
  ].filter((item): item is string => Boolean(item))
  const permissionList = permissionItems.join((i18n.resolvedLanguage || i18n.language).startsWith('zh') ? '、' : ', ')

  const toneClasses = copy.tone === 'warning'
    ? {
        container: 'border-amber-500/30 bg-amber-500/8',
        icon: 'bg-amber-500/12 text-amber-600'
      }
    : copy.tone === 'success'
      ? {
          container: 'border-emerald-500/20 bg-emerald-500/8',
          icon: 'bg-emerald-500/12 text-emerald-600'
        }
      : {
          container: 'border-border/50 bg-card/60',
          icon: 'bg-secondary/60 text-muted-foreground'
        }

  return (
    <div className={`rounded-xl border px-3 py-3 ${toneClasses.container}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${toneClasses.icon}`}>
          {copy.tone === 'warning' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-foreground">
            {copy.title}
          </div>

          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {copy.description}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {scope !== 'computer' && (
              <StatusPill
                icon={Globe2}
                label={t('Web actions')}
                value={getStateLabel(webState, t)}
                tone={getStateTone(webState)}
              />
            )}
            {scope !== 'web' && (
              <StatusPill
                icon={Monitor}
                label={t('Computer actions')}
                value={getStateLabel(computerState, t)}
                tone={getStateTone(computerState)}
              />
            )}
          </div>

          {permissionItems.length > 0 && (
            <div className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-700">
              <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
              <span>{t('Turn on in System Settings: {{items}}.', { items: permissionList })}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
