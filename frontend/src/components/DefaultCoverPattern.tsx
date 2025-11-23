/**
 * Default Cover Pattern Component
 * Creates a visually interesting gradient pattern for NFT covers
 */

interface DefaultCoverPatternProps {
  color?: string; // Accent color for the pattern
}

export function DefaultCoverPattern({ color = 'rgba(0, 212, 255, 0.3)' }: DefaultCoverPatternProps) {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      position: 'relative',
      background: '#000',
      overflow: 'hidden',
    }}>
      {/* Base gradient */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: `radial-gradient(circle at 30% 40%, ${color}15 0%, transparent 50%),
                     radial-gradient(circle at 70% 60%, ${color}10 0%, transparent 50%)`,
      }} />
      
      {/* Geometric shapes */}
      <svg
        width="100%"
        height="100%"
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.2,
        }}
        preserveAspectRatio="none"
      >
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke={color}
              strokeWidth="0.5"
              opacity="0.3"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        
        {/* Diagonal lines */}
        <line
          x1="0"
          y1="0"
          x2="100%"
          y2="100%"
          stroke={color}
          strokeWidth="1"
          opacity="0.15"
        />
        <line
          x1="100%"
          y1="0"
          x2="0"
          y2="100%"
          stroke={color}
          strokeWidth="1"
          opacity="0.15"
        />
        
        {/* Circles */}
        <circle
          cx="20%"
          cy="30%"
          r="15%"
          fill="none"
          stroke={color}
          strokeWidth="1"
          opacity="0.2"
        />
        <circle
          cx="80%"
          cy="70%"
          r="12%"
          fill="none"
          stroke={color}
          strokeWidth="1"
          opacity="0.2"
        />
      </svg>
    </div>
  );
}

