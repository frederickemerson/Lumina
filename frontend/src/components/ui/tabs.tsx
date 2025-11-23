import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cn } from "../../lib/utils"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, style, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(className)}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0',
      background: 'transparent',
      padding: '0',
      border: 'none',
      ...style,
    }}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, style, ...props }, ref) => {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(className)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        whiteSpace: 'nowrap',
        borderRadius: '0',
        padding: '8px 16px',
        fontSize: '12px',
        fontWeight: 500,
        transition: 'all 0.2s',
        outline: 'none',
        border: 'none',
        background: 'transparent',
        color: '#666',
        cursor: 'pointer',
        borderBottom: '2px solid transparent',
        marginBottom: '-1px',
        ...style,
      }}
      onMouseEnter={(e) => {
        const isActive = e.currentTarget.getAttribute('data-state') === 'active';
        if (!isActive) {
          e.currentTarget.style.color = '#999';
        }
      }}
      onMouseLeave={(e) => {
        const isActive = e.currentTarget.getAttribute('data-state') === 'active';
        if (!isActive) {
          e.currentTarget.style.color = '#666';
        }
      }}
      {...props}
    />
  );
})
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

// Add global style for active tab state
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    [data-state="active"] {
      color: #fff !important;
      border-bottom-color: #fff !important;
    }
  `;
  document.head.appendChild(style);
}

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, style, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(className)}
    style={{
      marginTop: '0',
      outline: 'none',
      ...style,
    }}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
