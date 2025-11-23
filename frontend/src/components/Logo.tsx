import { useNavigate } from 'react-router-dom';

interface LogoProps {
  size?: number;
  showText?: boolean;
  style?: React.CSSProperties;
}

export function Logo({ size = 32, showText = false, style }: LogoProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate('/');
  };

  return (
    <div
      onClick={handleClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        cursor: 'pointer',
        transition: 'opacity 0.2s ease',
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.opacity = '0.8';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = '1';
      }}
    >
      <img
        src="/logo.png"
        alt="Lumina Logo"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          objectFit: 'contain',
          display: 'block',
        }}
      />
      {showText && (
        <span
          style={{
            fontSize: '16px',
            fontWeight: 300,
            color: '#fff',
            letterSpacing: '0.15em',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", sans-serif',
          }}
        >
          LUMINA
        </span>
      )}
    </div>
  );
}

