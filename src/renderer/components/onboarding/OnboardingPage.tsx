/**
 * OnboardingPage - Single page template for onboarding flow
 * Layout: Left side 1:1 image container, right side content
 * Responsive: Sizes adapt to viewport
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
  customContent?: ReactNode // Custom content slot (e.g., model logos grid)
  topLeft?: ReactNode // Top left slot (e.g., back button)
  footer?: ReactNode // Footer slot (e.g., progress dots)
  children?: ReactNode // Button slot
  isActive: boolean
}

export function OnboardingPage({
  image,
  title,
  subtitle,
  features,
  customContent,
  topLeft,
  footer,
  children,
  isActive
}: OnboardingPageProps) {
  return (
    <div
      className={`absolute inset-0 flex items-center justify-center overflow-auto py-8 transition-opacity duration-300 ${
        isActive ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      {/* Top left slot - for back button on last page */}
      {topLeft && (
        <div className="absolute top-6 left-6 z-10">
          {topLeft}
        </div>
      )}
      {/* Wrapper for content + footer */}
      <div className="flex flex-col items-center">
        {/* Responsive container: 80% of viewport width, max 1200px */}
        <div className="flex items-start gap-[4vw] w-[85vw] max-w-[1200px] px-[3vw]">
          {/* Left: 1:1 Image Container - responsive size based on viewport height */}
        <div
          className="flex-shrink-0 aspect-square rounded-2xl overflow-hidden flex items-start justify-center"
          style={{ width: 'min(65vh, 55vw)', height: 'min(65vh, 55vw)', minWidth: '200px', minHeight: '200px' }}
        >
          <img
            src={image}
            alt={title}
            className={`max-w-full max-h-full object-contain object-top transition-all duration-300 ${
              isActive ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
            }`}
            style={{ animationDelay: '0ms' }}
          />
        </div>

        {/* Right: Content - aligned with image (light mode) */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Title - responsive font size */}
          <h1
            className={`text-[clamp(1.5rem,3vw,2.5rem)] font-semibold text-gray-900 whitespace-nowrap transition-all duration-300 ${
              isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
            style={{ transitionDelay: '100ms' }}
          >
            {title}
          </h1>

          {/* Middle content area */}
          <div className="flex-1">
            {/* Subtitle - responsive font size */}
            {subtitle && (
              <p
                className={`mt-4 text-gray-500 text-[clamp(0.875rem,1.5vw,1.125rem)] leading-relaxed whitespace-pre-line transition-all duration-300 ${
                  isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                }`}
                style={{ transitionDelay: '200ms' }}
              >
                {subtitle}
              </p>
            )}

            {/* Features List */}
            {features && features.length > 0 && (
              <div
                className={`mt-6 space-y-4 transition-all duration-300 ${
                  isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                }`}
                style={{ transitionDelay: '200ms' }}
              >
                {features.map((feature, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-3"
                    style={{ transitionDelay: `${200 + index * 50}ms` }}
                  >
                    <div className="flex-shrink-0 w-5 h-5 mt-0.5 text-orange-500">
                      {feature.icon}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 text-[clamp(0.875rem,1.2vw,1rem)]">
                        {feature.title}
                      </div>
                      <div className="text-[clamp(0.75rem,1vw,0.875rem)] text-gray-500">
                        {feature.description}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Custom content slot - for model logos grid etc. */}
            {customContent && (
              <div
                className={`mt-6 transition-all duration-300 ${
                  isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                }`}
                style={{ transitionDelay: '200ms' }}
              >
                {customContent}
              </div>
            )}
          </div>

          {/* Button Slot */}
          {children && (
            <div
              className={`flex-shrink-0 mt-6 transition-all duration-300 ${
                isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
              }`}
              style={{ transitionDelay: '400ms' }}
            >
              {children}
            </div>
          )}
        </div>
        </div>

        {/* Footer slot - for progress dots */}
        {footer && (
          <div className="mt-6">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
