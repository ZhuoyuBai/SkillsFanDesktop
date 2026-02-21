/**
 * OnboardingPage - Single page template for onboarding flow
 * macOS-style layout: Large image on top, dots + one sentence below, continue button at bottom-right
 */

import { ReactNode } from 'react'

export interface FeatureItem {
  icon: ReactNode
  title: string
  description: string
}

export interface OnboardingPageProps {
  image: string
  title: string
  subtitle?: string
  features?: FeatureItem[]
  customContent?: ReactNode
  children?: ReactNode // Bottom-right action slot
  isActive: boolean
  dots?: ReactNode // Progress dots
}

export function OnboardingPage({
  image,
  title,
  subtitle,
  features,
  customContent,
  children,
  isActive,
  dots
}: OnboardingPageProps) {
  return (
    <div
      className={`absolute inset-0 flex flex-col transition-all duration-500 ${
        isActive ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      {/* Top: Image - takes most of the space */}
      <div className="flex-1 flex items-center justify-center pt-0 pb-4 min-h-0">
        <img
          src={image}
          alt={title}
          className={`max-h-full w-full object-cover object-top transition-all duration-500 ${
            isActive ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.96]'
          }`}
        />
      </div>

      {/* Bottom: Dots + Text + Action button */}
      <div className="flex-shrink-0 px-12 pb-10 pt-4">
        {/* Progress dots - centered */}
        {dots && (
          <div
            className={`flex justify-center mb-5 transition-all duration-300 ${
              isActive ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ transitionDelay: '150ms' }}
          >
            {dots}
          </div>
        )}

        {/* Title - centered */}
        <h1
          className={`text-[clamp(1.3rem,2.5vw,1.75rem)] text-gray-700 text-center font-semibold transition-all duration-300 ${
            isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
          }`}
          style={{ transitionDelay: '200ms' }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            className={`mt-1.5 text-[clamp(0.8rem,1.2vw,0.95rem)] text-gray-400 text-center transition-all duration-300 ${
              isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
            }`}
            style={{ transitionDelay: '230ms' }}
          >
            {subtitle.split('\n')[0]}
          </p>
        )}

        {/* Features as inline compact text */}
        {features && features.length > 0 && (
          <div
            className={`mt-3 flex justify-center gap-8 text-[clamp(0.85rem,1.2vw,1rem)] text-gray-500 transition-all duration-300 ${
              isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
            }`}
            style={{ transitionDelay: '250ms' }}
          >
            {features.map((feature, index) => (
              <span key={index} className="flex items-center gap-2">
                <span className="text-primary">{feature.icon}</span>
                {feature.title}
              </span>
            ))}
          </div>
        )}

        {/* Custom content (model logos) */}
        {customContent && (
          <div
            className={`mt-4 flex justify-center transition-all duration-300 ${
              isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
            }`}
            style={{ transitionDelay: '250ms' }}
          >
            {customContent}
          </div>
        )}

        {/* Bottom row: action button at right */}
        {children && (
          <div
            className={`mt-8 flex justify-end transition-all duration-300 ${
              isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
            }`}
            style={{ transitionDelay: '350ms' }}
          >
            {children}
          </div>
        )}
      </div>
    </div>
  )
}
