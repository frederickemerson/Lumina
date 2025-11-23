import * as React from "react"
import { cn } from "../../lib/utils"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, style, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(className)}
        style={{
          display: 'flex',
          height: '40px',
          width: '100%',
          borderRadius: '6px',
          border: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(0,0,0,0.4)',
          padding: '0 12px',
          fontSize: '14px',
          color: '#fff',
          transition: 'all 0.2s',
          outline: 'none',
          ...style,
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'
          e.currentTarget.style.background = 'rgba(0,0,0,0.6)'
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
          e.currentTarget.style.background = 'rgba(0,0,0,0.4)'
        }}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }

