/**
 * SkillsFanLogo - Brand logo component
 * Used across the app for loading states and branding
 *
 * Usage:
 *   <HaloLogo size="sm" />      // 28px - for inline/small areas
 *   <HaloLogo size="md" />      // 48px - for medium contexts
 *   <HaloLogo size="lg" />      // 96px - for large displays (like splash)
 *   <HaloLogo size={64} />      // custom size in pixels
 */

import logoImage from '../../assets/logo.png'

interface HaloLogoProps {
  /** Size preset or custom pixel value */
  size?: 'sm' | 'md' | 'lg' | number
  /** Optional additional class names */
  className?: string
  /** Whether to show loading animation */
  animated?: boolean
  /** Only animate on hover */
  hoverOnly?: boolean
}

// Size presets in pixels
const SIZE_PRESETS = {
  sm: 28,
  md: 48,
  lg: 96
} as const

export function HaloLogo({ size = 'md', className = '', animated = true, hoverOnly = false }: HaloLogoProps) {
  const pixelSize = typeof size === 'number' ? size : SIZE_PRESETS[size]

  // Determine animation class
  const animationClass = hoverOnly
    ? 'skillsfan-pulse-hover'
    : animated
      ? 'skillsfan-pulse'
      : ''

  return (
    <div
      className={`relative flex items-center justify-center ${className}`}
      style={{ width: pixelSize, height: pixelSize }}
    >
      <img
        src={logoImage}
        alt="技能范"
        className={`${animationClass} rounded-[22%]`}
        style={{
          width: pixelSize,
          height: pixelSize,
          objectFit: 'contain'
        }}
      />
    </div>
  )
}
