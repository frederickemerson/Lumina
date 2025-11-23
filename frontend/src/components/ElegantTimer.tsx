/**
 * Elegant Timer Component
 * Award-winning style countdown timer with orb at center
 * Reference: Apple, Stripe, Linear design patterns
 */

import { useState, useEffect } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';
import Orb from './Orb';
import { colors, spacing, typography } from '../styles/theme';

interface ElegantTimerProps {
  unlockAt: string | null; // ISO timestamp
  onUnlockReady?: () => void;
}

export function ElegantTimer({ unlockAt, onUnlockReady }: ElegantTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    total: number;
  } | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);

  // Calculate time remaining
  useEffect(() => {
    if (!unlockAt) {
      setTimeRemaining(null);
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const unlockTime = new Date(unlockAt).getTime();
      const diff = unlockTime - now;

      if (diff <= 0) {
        setTimeRemaining({
          days: 0,
          hours: 0,
          minutes: 0,
          seconds: 0,
          total: 0,
        });
        setIsUnlocked(true);
        if (onUnlockReady) {
          onUnlockReady();
        }
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeRemaining({
        days,
        hours,
        minutes,
        seconds,
        total: diff,
      });
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [unlockAt, onUnlockReady]);

  // Spring animation for progress
  const progress = timeRemaining
    ? Math.max(0, Math.min(1, 1 - timeRemaining.total / (365 * 24 * 60 * 60 * 1000))) // Assume max 1 year
    : 0;
  const progressSpring = useSpring(progress, { stiffness: 50, damping: 20 });
  const circumference = 2 * Math.PI * 120; // radius = 120
  const strokeDashoffset = useTransform(progressSpring, (p) => circumference * (1 - p));

  if (!unlockAt) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        color: colors.textSecondary,
      }}>
        <p style={{ fontSize: typography.fontSize.sm }}>No unlock time set</p>
      </div>
    );
  }

  if (isUnlocked) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '400px',
        }}
      >
        <motion.div
          initial={{ scale: 0.8 }}
          animate={{ scale: 1.2 }}
          transition={{ 
            duration: 0.6,
            repeat: Infinity,
            repeatType: 'reverse',
            ease: 'easeInOut',
          }}
        >
          <Orb pulse={true} heartbeat={72} size={1.5} />
        </motion.div>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          style={{
            marginTop: spacing.lg,
            fontSize: typography.fontSize.xl,
            color: colors.primary,
            fontWeight: 600,
            textAlign: 'center',
          }}
        >
          Ready to unlock
        </motion.p>
      </motion.div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '500px',
      position: 'relative',
    }}>
      {/* Circular Progress Ring */}
      <div style={{
        position: 'relative',
        width: '280px',
        height: '280px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {/* SVG Progress Ring */}
        <svg
          width="280"
          height="280"
          style={{
            position: 'absolute',
            transform: 'rotate(-90deg)',
          }}
        >
          {/* Background circle */}
          <circle
            cx="140"
            cy="140"
            r="120"
            fill="none"
            stroke={colors.border}
            strokeWidth="2"
            opacity="0.2"
          />
          {/* Progress circle */}
          <motion.circle
            cx="140"
            cy="140"
            r="120"
            fill="none"
            stroke={colors.primary}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            style={{
              strokeDashoffset,
              filter: 'drop-shadow(0 0 8px rgba(0,212,255,0.5))',
            }}
          />
        </svg>

        {/* Orb at center */}
        <motion.div
          animate={{
            scale: [1, 1.05, 1],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          style={{
            position: 'relative',
            zIndex: 1,
          }}
        >
          <Orb pulse={true} heartbeat={72} size={1} />
        </motion.div>
      </div>

      {/* Countdown Text */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        style={{
          marginTop: spacing.xl,
          textAlign: 'center',
        }}
      >
        <p style={{
          fontSize: '14px',
          color: colors.textSecondary,
          marginBottom: spacing.sm,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          fontWeight: 500,
        }}>
          Unlocks in
        </p>
        
        {timeRemaining && (
          <div style={{
            display: 'flex',
            gap: spacing.lg,
            justifyContent: 'center',
            alignItems: 'baseline',
          }}>
            {timeRemaining.days > 0 && (
              <motion.div
                key={timeRemaining.days}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <span style={{
                  fontSize: '48px',
                  fontWeight: 300,
                  color: colors.text,
                  fontFamily: 'Georgia, serif',
                  lineHeight: 1,
                }}>
                  {timeRemaining.days}
                </span>
                <span style={{
                  fontSize: '14px',
                  color: colors.textSecondary,
                  marginLeft: spacing.xs,
                  fontWeight: 400,
                }}>
                  {timeRemaining.days === 1 ? 'day' : 'days'}
                </span>
              </motion.div>
            )}
            
            <motion.div
              key={`${timeRemaining.hours}-${timeRemaining.minutes}`}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <span style={{
                fontSize: '48px',
                fontWeight: 300,
                color: colors.text,
                fontFamily: 'Georgia, serif',
                lineHeight: 1,
              }}>
                {String(timeRemaining.hours).padStart(2, '0')}
              </span>
              <span style={{
                fontSize: '14px',
                color: colors.textSecondary,
                marginLeft: spacing.xs,
                fontWeight: 400,
              }}>
                :
              </span>
              <span style={{
                fontSize: '48px',
                fontWeight: 300,
                color: colors.text,
                fontFamily: 'Georgia, serif',
                lineHeight: 1,
                marginLeft: spacing.xs,
              }}>
                {String(timeRemaining.minutes).padStart(2, '0')}
              </span>
            </motion.div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

