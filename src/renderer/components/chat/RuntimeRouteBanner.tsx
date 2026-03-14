import { ArrowRightLeft, Sparkles } from 'lucide-react'
import { useTranslation } from '../../i18n'
import type { RuntimeRouteInfo } from '../../types'

interface RuntimeRouteBannerProps {
  route: RuntimeRouteInfo
}

function getRouteTitle(route: RuntimeRouteInfo, t: (key: string) => string): string {
  return route.selectedKind === 'native'
    ? t('This turn is using the new route')
    : t('This turn is using the existing route')
}

function getRouteDescription(route: RuntimeRouteInfo, t: (key: string) => string): string {
  switch (route.noteId) {
    case 'new-route-simple-task':
      return t('This is a short task, so it can try the new route first.')
    case 'new-route-forced':
      return t('Your current setting prefers the new route for this kind of task.')
    case 'existing-route-fixed':
      return t('Your current setting keeps this on the existing route.')
    case 'existing-route-complex-task':
      return t('This task has more steps, so it stays on the more stable existing route.')
    case 'existing-route-outside-scope':
      return t('This kind of task is not in the first batch yet, so it stays on the existing route.')
    case 'existing-route-not-ready':
    default:
      return t('The new route is not ready yet, so this turn stays on the existing route.')
  }
}

export function RuntimeRouteBanner({ route }: RuntimeRouteBannerProps) {
  const { t } = useTranslation()
  const isNewRoute = route.selectedKind === 'native'
  const toneClasses = isNewRoute
    ? {
        container: 'border-sky-500/25 bg-sky-500/8',
        icon: 'bg-sky-500/12 text-sky-700',
        badge: 'border-sky-500/20 bg-sky-500/12 text-sky-700'
      }
    : {
        container: 'border-border/60 bg-card/70',
        icon: 'bg-secondary/70 text-muted-foreground',
        badge: 'border-border/60 bg-background/80 text-muted-foreground'
      }

  return (
    <div className={`rounded-xl border px-3 py-3 ${toneClasses.container}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${toneClasses.icon}`}>
          {isNewRoute ? <Sparkles size={16} /> : <ArrowRightLeft size={16} />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">
              {getRouteTitle(route, t)}
            </p>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${toneClasses.badge}`}>
              {isNewRoute ? t('New route') : t('Existing route')}
            </span>
          </div>

          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {getRouteDescription(route, t)}
          </p>
        </div>
      </div>
    </div>
  )
}
