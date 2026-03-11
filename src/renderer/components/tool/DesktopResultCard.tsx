import { useMemo } from 'react'
import { LayoutGrid, Monitor, Rows3 } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { useCanvasStore } from '../../stores/canvas.store'
import type { HostStep } from '../../types'
import { buildDesktopResultModel } from './desktop-result-parser'

interface DesktopResultCardProps {
  steps: HostStep[]
}

function formatElementIndent(level: number): string {
  return `${Math.min(level, 4) * 14}px`
}

export function DesktopResultCard({ steps }: DesktopResultCardProps) {
  const { t } = useTranslation()
  const openContent = useCanvasStore((state) => state.openContent)
  const model = useMemo(() => buildDesktopResultModel(steps), [steps])
  const hasStructuredContent = Boolean(
    model
    && (model.fields.length > 0 || model.elements.length > 0 || model.bulletItems.length > 0 || model.rawText)
  )

  if (!model || !hasStructuredContent) {
    return null
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border/60 bg-card/80 shadow-sm">
      <div className="border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <Monitor size={16} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground">{t('Desktop result')}</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('Detected interface details from the latest desktop task')}
        </p>
      </div>

      <div className="space-y-4 px-4 py-4">
        {model.fields.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <LayoutGrid size={15} className="text-muted-foreground" />
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {t('Detected details')}
              </span>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {model.fields.map((field) => (
                <div
                  key={`${field.label}-${field.value}`}
                  className="rounded-xl border border-border/40 bg-background/60 px-3 py-2"
                >
                  <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                    {field.label}
                  </div>
                  <div className="mt-1 text-sm text-foreground">{field.value}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {model.elements.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Rows3 size={15} className="text-muted-foreground" />
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {t('UI elements')}
              </span>
            </div>

            <div className="overflow-hidden rounded-xl border border-border/40 bg-background/60">
              <div className="grid grid-cols-[minmax(120px,1fr)_minmax(160px,1.4fr)_minmax(180px,1.5fr)] gap-3 border-b border-border/40 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                <span>{t('Role')}</span>
                <span>{t('Name')}</span>
                <span>{t('Details')}</span>
              </div>

              <div className="divide-y divide-border/30">
                {model.elements.map((element, index) => (
                  <div
                    key={`${element.role}-${element.name || 'unnamed'}-${index}`}
                    className="grid grid-cols-[minmax(120px,1fr)_minmax(160px,1.4fr)_minmax(180px,1.5fr)] gap-3 px-3 py-2.5 text-sm"
                  >
                    <div
                      className="font-medium text-foreground"
                      style={{ paddingLeft: formatElementIndent(element.level) }}
                    >
                      {element.role}
                    </div>
                    <div className="text-foreground/85">
                      {element.name || <span className="text-muted-foreground">{t('No name')}</span>}
                    </div>
                    <div className="text-muted-foreground">
                      {element.details || '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {model.bulletItems.length > 0 && (
          <section className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {t('Notes')}
            </span>
            <ul className="space-y-2 rounded-xl border border-border/40 bg-background/60 px-4 py-3">
              {model.bulletItems.map((item) => (
                <li key={item} className="text-sm leading-6 text-foreground/90">
                  <span className="mr-2 text-muted-foreground">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </section>
        )}

        {model.rawText && (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {t('Notes')}
              </span>
              <button
                type="button"
                onClick={() => openContent(model.rawText!, t('Desktop result'), 'text')}
                className="text-xs font-medium text-primary"
              >
                {t('View full text')}
              </button>
            </div>

            <div className="rounded-xl border border-border/40 bg-background/70 p-3 font-mono text-[11px] leading-5 text-muted-foreground">
              <div className="max-h-48 overflow-hidden whitespace-pre-wrap">
                {model.rawText}
              </div>
            </div>
          </section>
        )}
      </div>
    </section>
  )
}
