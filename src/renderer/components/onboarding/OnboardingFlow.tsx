/**
 * OnboardingFlow - Main container for first-launch onboarding
 * 4 pages: Welcome/Slogan, Skills Market, Agent Ability, Model Support
 * macOS-style: Large image, dots, one sentence, prev/next buttons, start now on last page
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Store,
  Layers,
  RefreshCw,
  Zap,
  GitBranch,
  Users,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { OnboardingPage, FeatureItem } from './OnboardingPage'
import { api } from '../../api'

// Import provider logos
import zhipuLogo from '../../assets/providers/zhipu.jpg'
import minimaxLogo from '../../assets/providers/minimax.jpg'
import kimiLogo from '../../assets/providers/kimi.jpg'
import deepseekLogo from '../../assets/providers/deepseek.jpg'
import claudeLogo from '../../assets/providers/claude.jpg'
import openaiLogo from '../../assets/providers/openai.jpg'

// Import onboarding images
import welcomeImage from '../../assets/onboarding/welcome.png'
import skillsImage from '../../assets/onboarding/skills.png'
import agentImage from '../../assets/onboarding/agent.png'
import modelsImage from '../../assets/onboarding/models.png'

const ONBOARDING_IMAGES = {
  welcome: welcomeImage,
  skills: skillsImage,
  agent: agentImage,
  models: modelsImage
}

const MODEL_PROVIDERS = [
  { name: '智谱', logo: zhipuLogo },
  { name: 'MiniMax', logo: minimaxLogo },
  { name: 'Kimi', logo: kimiLogo },
  { name: 'DeepSeek', logo: deepseekLogo },
  { name: 'Claude', logo: claudeLogo },
  { name: 'OpenAI', logo: openaiLogo }
]

interface OnboardingFlowProps {
  onComplete: () => void
  onLogin?: () => void
  onStartNow?: () => void
}

export function OnboardingFlow({ onComplete, onLogin, onStartNow }: OnboardingFlowProps) {
  const { t } = useTranslation()
  const [currentStep, setCurrentStep] = useState(0)

  // Hide macOS traffic lights during onboarding
  useEffect(() => {
    api.setWindowButtonVisibility(false)
    return () => {
      api.setWindowButtonVisibility(true)
    }
  }, [])

  const totalSteps = 4

  const goNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      onComplete()
    }
  }

  const goPrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleStartNow = () => {
    if (onStartNow) {
      onStartNow()
    } else {
      onComplete()
    }
  }

  // Feature items for page 2 - Skills Market
  const skillsFeatures: FeatureItem[] = [
    {
      icon: <Store className="w-4 h-4" />,
      title: t('onboarding.skills.market.title'),
      description: t('onboarding.skills.market.desc')
    },
    {
      icon: <Layers className="w-4 h-4" />,
      title: t('onboarding.skills.manage.title'),
      description: t('onboarding.skills.manage.desc')
    },
    {
      icon: <RefreshCw className="w-4 h-4" />,
      title: t('onboarding.skills.update.title'),
      description: t('onboarding.skills.update.desc')
    }
  ]

  // Feature items for page 3 - Agent Ability
  const agentFeatures: FeatureItem[] = [
    {
      icon: <Zap className="w-4 h-4" />,
      title: t('onboarding.agent.execute.title'),
      description: t('onboarding.agent.execute.desc')
    },
    {
      icon: <GitBranch className="w-4 h-4" />,
      title: t('onboarding.agent.workflow.title'),
      description: t('onboarding.agent.workflow.desc')
    },
    {
      icon: <Users className="w-4 h-4" />,
      title: t('onboarding.agent.partner.title'),
      description: t('onboarding.agent.partner.desc')
    }
  ]

  // Progress dots
  const ProgressDots = () => (
    <div className="flex items-center gap-2.5">
      {Array.from({ length: totalSteps }).map((_, index) => (
        <div
          key={index}
          className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
            index === currentStep
              ? 'bg-gray-800'
              : 'bg-gray-300'
          }`}
        />
      ))}
    </div>
  )

  // Navigation buttons for pages 1-3: prev (left) + next (right)
  const NavButtons = ({ showPrev = true }: { showPrev?: boolean }) => (
    <div className="flex items-center justify-between w-full">
      {/* Prev button - left side */}
      {showPrev && currentStep > 0 ? (
        <button
          onClick={goPrev}
          className="flex items-center gap-1.5 px-5 py-2 text-base text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
          {t('onboarding.prev')}
        </button>
      ) : (
        <div />
      )}

      {/* Next button - right side */}
      <button
        onClick={goNext}
        className="flex items-center gap-1.5 px-6 py-2.5 text-base bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg transition-colors font-medium"
      >
        {t('onboarding.next')}
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  )

  // Last page buttons: prev (left) + start now (right)
  const LastPageButtons = () => (
    <div className="flex items-center justify-between w-full">
      {/* Prev button - left side */}
      <button
        onClick={goPrev}
        className="flex items-center gap-1.5 px-5 py-2 text-base text-gray-500 hover:text-gray-800 transition-colors"
      >
        <ChevronLeft className="w-5 h-5" />
        {t('onboarding.prev')}
      </button>

      {/* Right side: Set up API + Start now */}
      <div className="flex items-center gap-4">
        <button
          onClick={onComplete}
          className="px-5 py-2.5 text-base text-gray-500 hover:text-gray-800 transition-colors"
        >
          {t('onboarding.customApi')}
        </button>
        <button
          onClick={handleStartNow}
          className="flex items-center gap-1.5 px-7 py-2.5 text-base bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors font-medium"
        >
          {t('onboarding.startNow')}
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  )

  // Compact model logos for last page
  const ModelLogosCompact = () => (
    <div className="flex items-center gap-4">
      {MODEL_PROVIDERS.map((provider) => (
        <div
          key={provider.name}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 rounded-md"
        >
          <img
            src={provider.logo}
            alt={provider.name}
            className="w-5 h-5 rounded object-cover"
          />
          <span className="text-xs text-gray-600">{provider.name}</span>
        </div>
      ))}
    </div>
  )

  const dots = <ProgressDots />

  return (
    <div className="h-full w-full bg-white relative overflow-hidden">
      {/* Page 1: Welcome */}
      <OnboardingPage
        image={ONBOARDING_IMAGES.welcome}
        title={t('onboarding.welcome.title')}
        subtitle={t('onboarding.welcome.subtitle')}
        dots={dots}
        isActive={currentStep === 0}
      >
        <NavButtons showPrev={false} />
      </OnboardingPage>

      {/* Page 2: Skills Market */}
      <OnboardingPage
        image={ONBOARDING_IMAGES.skills}
        title={t('onboarding.skills.title')}
        features={skillsFeatures}
        dots={dots}
        isActive={currentStep === 1}
      >
        <NavButtons />
      </OnboardingPage>

      {/* Page 3: Agent Ability */}
      <OnboardingPage
        image={ONBOARDING_IMAGES.agent}
        title={t('onboarding.agent.title')}
        features={agentFeatures}
        dots={dots}
        isActive={currentStep === 2}
      >
        <NavButtons />
      </OnboardingPage>

      {/* Page 4: Model Support */}
      <OnboardingPage
        image={ONBOARDING_IMAGES.models}
        title={t('onboarding.models.title')}
        customContent={<ModelLogosCompact />}
        dots={dots}
        isActive={currentStep === 3}
      >
        <LastPageButtons />
      </OnboardingPage>
    </div>
  )
}
