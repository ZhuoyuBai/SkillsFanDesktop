/**
 * Skill Icon Picker Dialog
 * Grid of all available skill icons for user to choose from
 */

import { X } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { getAllSkillIcons } from '../../assets/skill-icons'

interface SkillIconPickerProps {
  currentIcon: string
  onSelect: (iconName: string) => void
  onClose: () => void
}

export function SkillIconPicker({ currentIcon, onSelect, onClose }: SkillIconPickerProps) {
  const { t } = useTranslation()
  const allIcons = getAllSkillIcons()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-drag">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-card border border-border/80 rounded-2xl p-6 w-full max-w-lg animate-fade-in shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">{t('Choose Icon')}</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-secondary rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Icon Grid */}
        <div className="grid grid-cols-6 gap-3 max-h-[400px] overflow-y-auto p-1">
          {allIcons.map(({ name, url }) => (
            <button
              key={name}
              onClick={() => onSelect(name)}
              className={`w-14 h-14 rounded-xl flex items-center justify-center transition-all hover:bg-secondary hover:shadow-sm ${
                currentIcon === name
                  ? 'ring-2 ring-primary bg-primary/10'
                  : 'border border-transparent hover:border-border'
              }`}
              title={name}
            >
              <img src={url} alt={name} className="w-10 h-10" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
