/**
 * OnboardingFlow - Main container for first-launch onboarding
 * 4 pages: Welcome/Slogan, Skills Market, Agent Ability, Model Support
 */

import { useState } from 'react'
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

// Import provider logos
import zhipuLogo from '../../assets/providers/zhipu.jpg'
import minimaxLogo from '../../assets/providers/minimax.jpg'
import kimiLogo from '../../assets/providers/kimi.jpg'
import deepseekLogo from '../../assets/providers/deepseek.jpg'
import claudeLogo from '../../assets/providers/claude.jpg'
import openaiLogo from '../../assets/providers/openai.jpg'

// Placeholder images - will be replaced with actual images later
const PLACEHOLDER_IMAGES = {
  welcome: 'data:image/svg+xml,' + encodeURIComponent(`
    <svg width="640" height="360" viewBox="0 0 640 360" xmlns="http://www.w3.org/2000/svg">
      <rect width="640" height="360" fill="#f4f4f5"/>
      <text x="320" y="180" text-anchor="middle" fill="#a1a1aa" font-size="24" font-family="system-ui">Welcome Image</text>
    </svg>
  `),
  skills: 'data:image/svg+xml,' + encodeURIComponent(`
    <svg width="640" height="360" viewBox="0 0 640 360" xmlns="http://www.w3.org/2000/svg">
      <rect width="640" height="360" fill="#f4f4f5"/>
      <text x="320" y="180" text-anchor="middle" fill="#a1a1aa" font-size="24" font-family="system-ui">Skills Market Image</text>
    </svg>
  `),
  agent: 'data:image/svg+xml,' + encodeURIComponent(`
    <svg width="640" height="360" viewBox="0 0 640 360" xmlns="http://www.w3.org/2000/svg">
      <rect width="640" height="360" fill="#f4f4f5"/>
      <text x="320" y="180" text-anchor="middle" fill="#a1a1aa" font-size="24" font-family="system-ui">Agent Image</text>
    </svg>
  `),
  models: 'data:image/svg+xml,' + encodeURIComponent(`
    <svg width="640" height="360" viewBox="0 0 640 360" xmlns="http://www.w3.org/2000/svg">
      <rect width="640" height="360" fill="#f4f4f5"/>
      <text x="320" y="180" text-anchor="middle" fill="#a1a1aa" font-size="24" font-family="system-ui">Models Image</text>
    </svg>
  `)
}

// Model providers for the last page
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
}

export function OnboardingFlow({ onComplete, onLogin }: OnboardingFlowProps) {
  const { t } = useTranslation()
  const [currentStep, setCurrentStep] = useState(0)

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

  const handleLogin = () => {
    if (onLogin) {
      onLogin()
    } else {
      // Default: go to setup with login mode
      onComplete()
    }
  }

  // Feature items for page 2 - Skills Market
  const skillsFeatures: FeatureItem[] = [
    {
      icon: <Store className="w-5 h-5" />,
      title: t('onboarding.skills.market.title'),
      description: t('onboarding.skills.market.desc')
    },
    {
      icon: <Layers className="w-5 h-5" />,
      title: t('onboarding.skills.manage.title'),
      description: t('onboarding.skills.manage.desc')
    },
    {
      icon: <RefreshCw className="w-5 h-5" />,
      title: t('onboarding.skills.update.title'),
      description: t('onboarding.skills.update.desc')
    }
  ]

  // Feature items for page 3 - Agent Ability
  const agentFeatures: FeatureItem[] = [
    {
      icon: <Zap className="w-5 h-5" />,
      title: t('onboarding.agent.execute.title'),
      description: t('onboarding.agent.execute.desc')
    },
    {
      icon: <GitBranch className="w-5 h-5" />,
      title: t('onboarding.agent.workflow.title'),
      description: t('onboarding.agent.workflow.desc')
    },
    {
      icon: <Users className="w-5 h-5" />,
      title: t('onboarding.agent.partner.title'),
      description: t('onboarding.agent.partner.desc')
    }
  ]

  // Navigation buttons component - smaller, more subtle style
  const NavigationButtons = ({ showPrev = true }: { showPrev?: boolean }) => (
    <div className="flex items-center justify-end gap-2">
      {showPrev && currentStep > 0 && (
        <button
          onClick={goPrev}
          className="flex items-center gap-1 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          {t('onboarding.prev')}
        </button>
      )}
      <button
        onClick={goNext}
        className="flex items-center gap-1 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {t('onboarding.next')}
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  )

  // Back button for last page (top left)
  const BackButton = () => (
    <button
      onClick={goPrev}
      className="flex items-center gap-1 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      <ChevronLeft className="w-3.5 h-3.5" />
      {t('onboarding.back')}
    </button>
  )

  // Last page buttons - Full width login + Custom API text link
  const LastPageButtons = () => (
    <div className="flex flex-col items-stretch gap-2 w-full">
      <button
        onClick={handleLogin}
        className="w-full py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
      >
        {t('onboarding.login')}
      </button>
      <button
        onClick={onComplete}
        className="py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {t('onboarding.customApi')}
      </button>
    </div>
  )

  // Model logos grid for last page
  const ModelLogosGrid = () => (
    <div className="grid grid-cols-3 gap-3">
      {MODEL_PROVIDERS.map((provider) => (
        <div
          key={provider.name}
          className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg"
        >
          <img
            src={provider.logo}
            alt={provider.name}
            className="w-6 h-6 rounded object-cover"
          />
          <span className="text-sm text-foreground">{provider.name}</span>
        </div>
      ))}
    </div>
  )

  // Progress dots
  const ProgressDots = () => (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2">
      {Array.from({ length: totalSteps }).map((_, index) => (
        <div
          key={index}
          className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
            index === currentStep
              ? 'bg-primary w-4'
              : 'bg-muted-foreground/30'
          }`}
        />
      ))}
    </div>
  )

  return (
    <div className="h-full w-full bg-background relative overflow-hidden">
      {/* Page 1: Welcome / Slogan */}
      <OnboardingPage
        image={PLACEHOLDER_IMAGES.welcome}
        title={t('onboarding.welcome.title')}
        subtitle={t('onboarding.welcome.subtitle')}
        isActive={currentStep === 0}
      >
        <NavigationButtons showPrev={false} />
      </OnboardingPage>

      {/* Page 2: Skills Market */}
      <OnboardingPage
        image={PLACEHOLDER_IMAGES.skills}
        title={t('onboarding.skills.title')}
        features={skillsFeatures}
        isActive={currentStep === 1}
      >
        <NavigationButtons />
      </OnboardingPage>

      {/* Page 3: Agent Ability */}
      <OnboardingPage
        image={PLACEHOLDER_IMAGES.agent}
        title={t('onboarding.agent.title')}
        features={agentFeatures}
        isActive={currentStep === 2}
      >
        <NavigationButtons />
      </OnboardingPage>

      {/* Page 4: Model Support */}
      <OnboardingPage
        image={PLACEHOLDER_IMAGES.models}
        title={t('onboarding.models.title')}
        customContent={<ModelLogosGrid />}
        isActive={currentStep === 3}
      >
        <LastPageButtons />
      </OnboardingPage>

      {/* Progress Dots */}
      <ProgressDots />
    </div>
  )
}
