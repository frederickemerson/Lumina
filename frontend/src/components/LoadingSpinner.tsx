/**
 * Loading Spinner Component
 * Reusable loading indicator
 */

interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  color?: string;
}

export function LoadingSpinner({ size = 'medium', color = '#fff' }: LoadingSpinnerProps) {
  const sizeMap = {
    small: '12px',
    medium: '16px',
    large: '24px',
  };

  return (
    <div
      style={{
        display: 'inline-block',
        width: sizeMap[size],
        height: sizeMap[size],
        border: `2px solid ${color}20`,
        borderTop: `2px solid ${color}`,
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }}
    />
  );
}

// Add CSS animation if not already in global styles
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  if (!document.head.querySelector('style[data-loading-spinner]')) {
    style.setAttribute('data-loading-spinner', 'true');
    document.head.appendChild(style);
  }
}

