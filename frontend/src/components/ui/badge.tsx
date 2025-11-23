import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, style, ...props }: BadgeProps) {
  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: '9999px',
    border: '1px solid rgba(255,255,255,0.1)',
    padding: '2px 10px',
    fontSize: '11px',
    fontWeight: 600,
    transition: 'all 0.2s',
    ...style,
  }

  const variantStyles: Record<string, React.CSSProperties> = {
    default: {
      background: '#fff',
      color: '#000',
      borderColor: 'transparent',
    },
    secondary: {
      background: 'rgba(255,255,255,0.1)',
      color: '#fff',
      borderColor: 'transparent',
    },
    destructive: {
      background: 'rgba(255,68,68,0.2)',
      color: '#ff4444',
      borderColor: 'rgba(255,68,68,0.3)',
    },
    outline: {
      background: 'transparent',
      color: '#fff',
      borderColor: 'rgba(255,255,255,0.2)',
    },
  }

  return (
    <div
      className={cn(badgeVariants({ variant }), className)}
      style={{
        ...baseStyle,
        ...variantStyles[variant || 'default'],
      }}
      {...props}
    />
  )
}

export { Badge, badgeVariants }

