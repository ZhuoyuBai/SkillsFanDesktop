/**
 * Step3Complete - Success screen after skill creation
 */

import { useSkillCreationStore } from '../../stores/skill-creation.store'
import { useChatStore } from '../../stores/chat.store'
import { api } from '../../api'
import { CheckCircle, Play, FolderOpen, ArrowLeft } from 'lucide-react'
import { useTranslation } from '../../i18n'

export function Step3Complete() {
  const { t } = useTranslation()
  const { savedSkillName, cleanup } = useSkillCreationStore()
  const { setSelectionType } = useChatStore()

  const handleTryNow = async () => {
    await cleanup()
    setSelectionType('conversation')
  }

  const handleViewFile = () => {
    if (savedSkillName) {
      api.openSkillFolder(savedSkillName)
    }
  }

  const handleBack = async () => {
    await cleanup()
    setSelectionType('conversation')
  }

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-6 text-center">
        <CheckCircle className="w-16 h-16 text-green-500" />

        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">
            {t('Skill Created Successfully!')}
          </h2>
          {savedSkillName && (
            <p className="text-sm text-muted-foreground">
              &quot;{savedSkillName}&quot; {t('has been installed to your skill list.')}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleTryNow}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium
              bg-primary text-primary-foreground hover:bg-primary/90
              rounded-lg transition-colors"
          >
            <Play className="w-4 h-4" />
            {t('Try Now')}
          </button>
          <button
            onClick={handleViewFile}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium
              text-foreground bg-secondary hover:bg-secondary/80
              rounded-lg transition-colors"
          >
            <FolderOpen className="w-4 h-4" />
            {t('View File')}
          </button>
          <button
            onClick={handleBack}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium
              text-muted-foreground hover:text-foreground hover:bg-secondary/60
              rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('Go Back')}
          </button>
        </div>
      </div>
    </div>
  )
}
