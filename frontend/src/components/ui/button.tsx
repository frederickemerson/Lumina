import * as React from "react"
import { cn } from "../../lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', style, ...props }, ref) => {
    const baseStyles: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      whiteSpace: 'nowrap',
      borderRadius: '4px',
      fontSize: '14px',
      fontWeight: 500,
      transition: 'all 0.2s',
      outline: 'none',
      border: 'none',
      cursor: 'pointer',
    };
    
    const variants: Record<string, React.CSSProperties> = {
      default: {
        background: '#fff',
        color: '#000',
      },
      secondary: {
        background: '#0a0a0a',
        color: '#fff',
        border: '1px solid #333',
      },
      outline: {
        border: '1px solid #333',
        color: '#fff',
        background: 'transparent',
      },
      ghost: {
        background: 'transparent',
        color: '#fff',
      },
    };
    
    const sizes: Record<string, React.CSSProperties> = {
      default: { height: '44px', padding: '0 24px' },
      sm: { height: '36px', padding: '0 16px', fontSize: '12px' },
      lg: { height: '48px', padding: '0 32px', fontSize: '16px' },
      icon: { height: '40px', width: '40px', padding: 0 },
    };
    
    const combinedStyle: React.CSSProperties = {
      ...baseStyles,
      ...variants[variant],
      ...sizes[size],
      ...style,
    };
    
    return (
      <button
        className={cn(className)}
        style={combinedStyle}
        ref={ref}
        onMouseEnter={(e) => {
          if (variant === 'default') {
            e.currentTarget.style.background = '#f5f5f5';
          } else if (variant === 'outline') {
            e.currentTarget.style.borderColor = '#fff';
            e.currentTarget.style.color = '#fff';
          } else if (variant === 'secondary') {
            e.currentTarget.style.borderColor = '#666';
          } else if (variant === 'ghost') {
            e.currentTarget.style.background = '#0a0a0a';
          }
        }}
        onMouseLeave={(e) => {
          if (variant === 'default') {
            e.currentTarget.style.background = '#fff';
          } else if (variant === 'outline') {
            e.currentTarget.style.borderColor = '#333';
            e.currentTarget.style.color = '#fff';
          } else if (variant === 'secondary') {
            e.currentTarget.style.borderColor = '#333';
          } else if (variant === 'ghost') {
            e.currentTarget.style.background = 'transparent';
          }
        }}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
