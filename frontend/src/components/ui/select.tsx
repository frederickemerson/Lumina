import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "../../lib/utils"

const Select = SelectPrimitive.Root

const SelectGroup = SelectPrimitive.Group

const SelectValue = SelectPrimitive.Value

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, style, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(className)}
    style={{
      display: 'flex',
      height: '40px',
      width: '100%',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: '6px',
      border: '1px solid rgba(255,255,255,0.1)',
      background: 'rgba(0,0,0,0.4)',
      padding: '0 12px',
      fontSize: '14px',
      color: '#fff',
      transition: 'all 0.2s',
      outline: 'none',
      cursor: 'pointer',
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
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown style={{ height: 16, width: 16, opacity: 0.5 }} />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn(className)}
    {...props}
  >
    <ChevronUp style={{ height: 16, width: 16 }} />
  </SelectPrimitive.ScrollUpButton>
))
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn(className)}
    {...props}
  >
    <ChevronDown style={{ height: 16, width: 16 }} />
  </SelectPrimitive.ScrollDownButton>
))
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(className)}
      position={position}
      style={{
        position: 'relative',
        zIndex: 50,
        minWidth: 'var(--radix-select-trigger-width)',
        maxHeight: 'var(--radix-select-content-available-height)',
        borderRadius: '6px',
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(0,0,0,0.95)',
        backdropFilter: 'blur(10px)',
        padding: '4px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      }}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className="p-1"
        style={{
          padding: '4px',
        }}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn(className)}
    style={{
      padding: '8px 12px',
      fontSize: '12px',
      fontWeight: 500,
      color: '#999',
    }}
    {...props}
  />
))
SelectLabel.displayName = SelectPrimitive.Label.displayName

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(className)}
    style={{
      position: 'relative',
      display: 'flex',
      cursor: 'pointer',
      userSelect: 'none',
      alignItems: 'center',
      borderRadius: '4px',
      padding: '8px 12px',
      fontSize: '14px',
      color: '#fff',
      outline: 'none',
      transition: 'all 0.2s',
    }}
    onFocus={(e) => {
      e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
    }}
    onBlur={(e) => {
      e.currentTarget.style.background = 'transparent'
    }}
    {...props}
  >
    <span style={{ position: 'absolute', left: 8, display: 'flex', alignItems: 'center' }}>
      <SelectPrimitive.ItemIndicator>
        <Check style={{ height: 16, width: 16 }} />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
))
SelectItem.displayName = SelectPrimitive.Item.displayName

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn(className)}
    style={{
      height: '1px',
      background: 'rgba(255,255,255,0.1)',
      margin: '4px 0',
    }}
    {...props}
  />
))
SelectSeparator.displayName = SelectPrimitive.Separator.displayName

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
}

