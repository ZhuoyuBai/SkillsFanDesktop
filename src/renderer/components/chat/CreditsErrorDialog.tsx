/**
 * CreditsErrorDialog - Modal for insufficient credits (402 error)
 *
 * Shows when the user's credit balance is too low to complete a request.
 * Provides a link to recharge credits on the SkillsFan website.
 */

import { Coins, ExternalLink, X } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { api } from '../../api'
import { getSkillsFanBaseUrl } from '../../utils/region'

interface CreditsErrorDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function CreditsErrorDialog({ isOpen, onClose }: CreditsErrorDialogProps) {
  const { t } = useTranslation()

  if (!isOpen) return null

  const handleRecharge = () => {
    api.openExternal(`${getSkillsFanBaseUrl()}/pricing`)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-[360px] p-6 animate-in fade-in-0 zoom-in-95 duration-200">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1 text-muted-foreground hover:text-foreground rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center">
            <Coins className="w-7 h-7 text-amber-500" />
          </div>
        </div>

        {/* Title */}
        <h3 className="text-center text-lg font-semibold mb-2">
          {t('Insufficient Credits')}
        </h3>

        {/* Description */}
        <p className="text-center text-sm text-muted-foreground mb-6">
          {t('Your credit balance is too low to complete this request. Please recharge to continue using AI models.')}
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 h-9 px-4 rounded-lg text-sm border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            {t('Close')}
          </button>
          <button
            onClick={handleRecharge}
            className="flex-1 h-9 px-4 rounded-lg text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5"
          >
            {t('Recharge')}
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
