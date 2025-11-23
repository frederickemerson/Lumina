/**
 * Shared Theme Constants
 * Centralized styling constants with animations, glassmorphism, and responsive design
 */

export const colors = {
  background: '#000',
  surface: '#0a0a0a',
  surfaceHover: 'rgba(255,255,255,0.05)',
  border: 'rgba(255,255,255,0.1)',
  borderHover: 'rgba(255,255,255,0.15)',
  text: '#fff',
  textSecondary: '#666',
  textMuted: '#999',
  primary: '#fff',
  primaryHover: '#f5f5f5',
  // Status colors
  error: '#ff4444',
  errorBg: 'rgba(255, 68, 68, 0.1)',
  errorBorder: 'rgba(255, 68, 68, 0.2)',
  danger: '#ff4444',
  success: '#00ff88',
  successBg: 'rgba(0, 255, 136, 0.1)',
  successBorder: 'rgba(0, 255, 136, 0.2)',
  warning: '#ffaa00',
  warningBg: 'rgba(255, 170, 0, 0.1)',
  warningBorder: 'rgba(255, 170, 0, 0.2)',
  info: '#00aaff',
  infoBg: 'rgba(0, 170, 255, 0.1)',
  infoBorder: 'rgba(0, 170, 255, 0.2)',
} as const;

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  xxl: '24px',
} as const;

export const borderRadius = {
  sm: '4px',
  md: '8px',
  lg: '12px',
} as const;

export const typography = {
  fontFamily: {
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", "SF Pro Display", Roboto, "Helvetica Neue", Arial, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
    display: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", "SF Pro Display", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  fontSize: {
    xs: '12px',
    sm: '14px',
    md: '16px',
    lg: '18px',
    xl: '24px',
    '2xl': '32px',
    '3xl': '48px',
    '4xl': '64px',
    '5xl': '96px',
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  letterSpacing: {
    tight: '-0.02em',
    normal: '0em',
    wide: '0.05em',
    wider: '0.1em',
  },
} as const;

export const cardStyles = {
  base: {
    padding: spacing.lg,
    background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
    backdropFilter: 'blur(10px)',
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.md,
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    position: 'relative' as const,
    overflow: 'hidden' as const,
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
  },
  withGlow: {
    padding: spacing.lg,
    background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
    backdropFilter: 'blur(10px)',
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.md,
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    position: 'relative' as const,
    overflow: 'hidden' as const,
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2), 0 0 40px rgba(255, 255, 255, 0.05)',
  },
  hover: {
    borderColor: colors.borderHover,
    background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
    transform: 'translateY(-2px)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  },
  glass: {
    background: 'rgba(10, 10, 10, 0.7)',
    backdropFilter: 'blur(20px) saturate(180%)',
    border: `1px solid rgba(255,255,255,0.1)`,
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
  },
} as const;

export const inputStyles = {
  base: {
    width: '100%',
    height: '32px',
    padding: `0 ${spacing.md}`,
    background: 'rgba(0,0,0,0.4)',
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.sm,
    color: colors.text,
    fontSize: typography.fontSize.md,
    fontFamily: typography.fontFamily.mono,
    outline: 'none',
    transition: 'all 0.2s',
  },
  focus: {
    borderColor: 'rgba(255,255,255,0.3)',
    background: 'rgba(0,0,0,0.6)',
  },
  disabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
} as const;

export const buttonStyles = {
  padding: `${spacing.sm} ${spacing.lg}`,
  background: colors.primary,
  color: colors.background,
  border: 'none',
  borderRadius: borderRadius.sm,
  fontSize: typography.fontSize.sm,
  fontWeight: typography.fontWeight.semibold,
  cursor: 'pointer',
  transition: 'all 0.2s',
  display: 'inline-flex',
  alignItems: 'center',
  gap: spacing.sm,
} as const;

export const hoverGradient = 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)';

// Animations
export const animations = {
  fadeIn: {
    animation: 'fadeIn 0.4s ease-out',
  },
  slideUp: {
    animation: 'slideUp 0.3s ease-out',
  },
  slideDown: {
    animation: 'slideDown 0.3s ease-out',
  },
  scaleIn: {
    animation: 'scaleIn 0.2s ease-out',
  },
  pulse: {
    animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  },
  shimmer: {
    animation: 'shimmer 2s linear infinite',
    background: 'linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 100%)',
    backgroundSize: '200% 100%',
  },
} as const;

// Responsive breakpoints
export const breakpoints = {
  mobile: '480px',
  tablet: '768px',
  desktop: '1024px',
  wide: '1280px',
} as const;

// Responsive utilities
export const responsive = {
  mobile: `@media (max-width: ${breakpoints.mobile})`,
  tablet: `@media (max-width: ${breakpoints.tablet})`,
  desktop: `@media (min-width: ${breakpoints.desktop})`,
  wide: `@media (min-width: ${breakpoints.wide})`,
} as const;

