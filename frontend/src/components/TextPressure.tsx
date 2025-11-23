/**
 * Text Pressure Animation Component
 * Based on reactbits.dev/text-animations/text-pressure
 * Creates a pressure/wave effect on text
 */

import { useEffect, useRef } from 'react';
import { motion, useAnimation, useInView } from 'framer-motion';

interface TextPressureProps {
  text: string;
  className?: string;
  style?: React.CSSProperties;
  delay?: number;
  duration?: number;
}

export function TextPressure({ 
  text, 
  className = '', 
  style = {},
  delay = 0,
  duration = 0.5 
}: TextPressureProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });
  const controls = useAnimation();

  useEffect(() => {
    if (isInView) {
      controls.start({
        scale: [1, 1.05, 1],
        opacity: [0.5, 1, 1],
        transition: {
          duration,
          delay,
          ease: [0.4, 0, 0.2, 1],
        },
      });
    }
  }, [isInView, controls, delay, duration]);

  return (
    <motion.div
      ref={ref}
      animate={controls}
      className={className}
      style={{
        display: 'inline-block',
        ...style,
      }}
    >
      {text.split('').map((char, index) => (
        <motion.span
          key={index}
          style={{ display: 'inline-block' }}
          animate={{
            y: [0, -5, 0],
            opacity: [0.7, 1, 1],
          }}
          transition={{
            duration: 0.3,
            delay: delay + index * 0.02,
            ease: 'easeOut',
          }}
        >
          {char === ' ' ? '\u00A0' : char}
        </motion.span>
      ))}
    </motion.div>
  );
}

