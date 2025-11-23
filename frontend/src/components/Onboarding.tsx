/**
 * Onboarding Component
 * Tutorial flow for new users
 */

import React, { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Sparkles, Lock, Calendar, Share2, Eye, Zap } from 'lucide-react';
import { colors, spacing, typography, cardStyles, buttonStyles } from '../styles/theme';
import Orb from './Orb';
import { TextPressure } from './TextPressure';

interface OnboardingProps {
  onComplete: () => void;
  onSkip: () => void;
}

interface OnboardingStep {
  title: string;
  description: string;
  icon: React.ReactNode;
  content: React.ReactNode;
}

export function Onboarding({ onComplete, onSkip }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const steps: OnboardingStep[] = [
    {
      title: 'Welcome to LUMINA',
      description: 'Your life. Encrypted in light.',
      icon: <Sparkles size={32} style={{ color: colors.primary }} />,
      content: (
        <div style={{ textAlign: 'center', padding: spacing.xl }}>
          <div style={{ marginBottom: spacing.lg, display: 'flex', justifyContent: 'center' }}>
            <Orb size={0.6} />
          </div>
          <TextPressure
            text="LUMINA is a decentralized memory vault where you can store your most precious memories, locked until a future date or shared with a secret phrase."
            style={{
              color: colors.text,
              fontSize: typography.fontSize.lg,
              marginBottom: spacing.md,
              lineHeight: 1.6,
              display: 'block',
            }}
          />
          <p style={{
            color: colors.textSecondary,
            fontSize: typography.fontSize.sm,
            lineHeight: 1.6,
          }}>
            Your memories are encrypted, immutable, and beautiful.
          </p>
        </div>
      ),
    },
    {
      title: 'Create Your First Capsule',
      description: 'Upload a file or record live',
      icon: <Lock size={32} style={{ color: colors.primary }} />,
      content: (
        <div style={{ padding: spacing.xl }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: spacing.md,
            marginBottom: spacing.lg,
          }}>
            <div style={{
              ...cardStyles.base,
              padding: spacing.md,
              textAlign: 'center',
            }}>
              <Eye size={24} style={{ color: colors.primary, marginBottom: spacing.sm }} />
              <h4 style={{ color: colors.text, fontSize: typography.fontSize.sm, marginBottom: spacing.xs }}>
                Upload File
              </h4>
              <p style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs }}>
                Images, videos, audio, documents (up to 1GB)
              </p>
            </div>
            <div style={{
              ...cardStyles.base,
              padding: spacing.md,
              textAlign: 'center',
            }}>
              <Zap size={24} style={{ color: colors.primary, marginBottom: spacing.sm }} />
              <h4 style={{ color: colors.text, fontSize: typography.fontSize.sm, marginBottom: spacing.xs }}>
                Live Recording
              </h4>
              <p style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs }}>
                Record voice or video directly in your browser
              </p>
            </div>
          </div>
          <p style={{
            color: colors.textSecondary,
            fontSize: typography.fontSize.sm,
            lineHeight: 1.6,
          }}>
            Your files are encrypted with Seal (threshold encryption) and stored on Walrus (decentralized storage).
            Only you can unlock them.
          </p>
        </div>
      ),
    },
    {
      title: 'Choose Unlock Condition',
      description: 'Time-based or manual unlock',
      icon: <Calendar size={32} style={{ color: colors.primary }} />,
      content: (
        <div style={{ padding: spacing.xl }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: spacing.md,
            marginBottom: spacing.lg,
          }}>
            <div style={{
              ...cardStyles.base,
              padding: spacing.md,
              textAlign: 'center',
            }}>
              <Calendar size={24} style={{ color: colors.primary, marginBottom: spacing.sm }} />
              <h4 style={{ color: colors.text, fontSize: typography.fontSize.sm, marginBottom: spacing.xs }}>
                Time-Based
              </h4>
              <p style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs }}>
                Unlocks automatically on a future date
              </p>
            </div>
            <div style={{
              ...cardStyles.base,
              padding: spacing.md,
              textAlign: 'center',
            }}>
              <Lock size={24} style={{ color: colors.primary, marginBottom: spacing.sm }} />
              <h4 style={{ color: colors.text, fontSize: typography.fontSize.sm, marginBottom: spacing.xs }}>
                Manual
              </h4>
              <p style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs }}>
                You can unlock at any time
              </p>
            </div>
          </div>
          <p style={{
            color: colors.textSecondary,
            fontSize: typography.fontSize.sm,
            lineHeight: 1.6,
          }}>
            Time-based capsules are perfect for digital inheritance or time capsules.
            Manual unlock gives you full control.
          </p>
        </div>
      ),
    },
    {
      title: 'Share with Secret Phrase',
      description: 'Public unlock without wallet',
      icon: <Share2 size={32} style={{ color: colors.primary }} />,
      content: (
        <div style={{ padding: spacing.xl }}>
          <div style={{
            ...cardStyles.base,
            padding: spacing.md,
            marginBottom: spacing.lg,
            background: colors.surface,
          }}>
            <p style={{
              color: colors.text,
              fontSize: typography.fontSize.sm,
              marginBottom: spacing.sm,
            }}>
              <strong>Generate a secret phrase</strong> to share your capsule publicly.
            </p>
            <p style={{
              color: colors.textSecondary,
              fontSize: typography.fontSize.xs,
              lineHeight: 1.6,
            }}>
              Anyone with the secret phrase can view the capsule (after unlock time, if time-based).
              No wallet connection required.
            </p>
          </div>
          <p style={{
            color: colors.textSecondary,
            fontSize: typography.fontSize.sm,
            lineHeight: 1.6,
          }}>
            Perfect for sharing memories with family, friends, or future generations.
          </p>
        </div>
      ),
    },
    {
      title: 'View in AR',
      description: 'See your capsule orb in augmented reality',
      icon: <Eye size={32} style={{ color: colors.primary }} />,
      content: (
        <div style={{ padding: spacing.xl }}>
          <div style={{
            ...cardStyles.base,
            padding: spacing.md,
            marginBottom: spacing.lg,
            background: colors.surface,
            textAlign: 'center',
          }}>
            <div style={{ marginBottom: spacing.md, display: 'flex', justifyContent: 'center' }}>
              <Orb size={1.5} />
            </div>
            <p style={{
              color: colors.textSecondary,
              fontSize: typography.fontSize.sm,
              lineHeight: 1.6,
            }}>
              Each capsule is represented by a beautiful glowing orb.
              View it in AR using WebXR (free, native browser API).
            </p>
          </div>
          <p style={{
            color: colors.textSecondary,
            fontSize: typography.fontSize.sm,
            lineHeight: 1.6,
          }}>
            Share QR codes to let others view your capsule in AR.
          </p>
        </div>
      ),
    },
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const currentStepData = steps[currentStep];

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.9)',
      zIndex: 2000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
    }}>
      <div style={{
        ...cardStyles.base,
        maxWidth: '600px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        position: 'relative',
      }}>
        {/* Close Button */}
        <button
          onClick={onSkip}
          style={{
            position: 'absolute',
            top: spacing.md,
            right: spacing.md,
            background: 'transparent',
            border: 'none',
            color: colors.textSecondary,
            cursor: 'pointer',
            padding: spacing.xs,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X size={20} />
        </button>

        {/* Step Content */}
        <div style={{ padding: spacing.xl }}>
          {/* Icon and Title */}
          <div style={{
            textAlign: 'center',
            marginBottom: spacing.lg,
          }}>
            <div style={{ marginBottom: spacing.md }}>
              {currentStepData.icon}
            </div>
            <h2 style={{
              color: colors.text,
              fontSize: typography.fontSize.xl,
              fontWeight: 700,
              marginBottom: spacing.xs,
            }}>
              {currentStepData.title}
            </h2>
            <p style={{
              color: colors.textSecondary,
              fontSize: typography.fontSize.sm,
            }}>
              {currentStepData.description}
            </p>
          </div>

          {/* Content */}
          {currentStepData.content}

          {/* Progress Indicator */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: spacing.xs,
            marginTop: spacing.xl,
            marginBottom: spacing.lg,
          }}>
            {steps.map((_, index) => (
              <div
                key={index}
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: index === currentStep ? colors.primary : colors.border,
                  transition: 'all 0.3s ease',
                }}
              />
            ))}
          </div>

          {/* Navigation */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: spacing.sm,
          }}>
            <button
              onClick={handlePrevious}
              disabled={currentStep === 0}
              style={{
                ...buttonStyles,
                background: currentStep === 0 ? colors.surface : colors.primary,
                color: currentStep === 0 ? colors.textSecondary : colors.background,
                border: `1px solid ${currentStep === 0 ? colors.border : colors.primary}`,
                cursor: currentStep === 0 ? 'not-allowed' : 'pointer',
                opacity: currentStep === 0 ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: spacing.xs,
              }}
            >
              <ChevronLeft size={16} />
              <span>Previous</span>
            </button>

            <button
              onClick={() => onSkip()}
              style={{
                ...buttonStyles,
                background: 'transparent',
                color: colors.textSecondary,
                border: `1px solid ${colors.border}`,
              }}
            >
              Skip Tutorial
            </button>

            <button
              onClick={handleNext}
              style={{
                ...buttonStyles,
                background: colors.primary,
                color: colors.background,
                border: `1px solid ${colors.primary}`,
                display: 'flex',
                alignItems: 'center',
                gap: spacing.xs,
              }}
            >
              <span>{currentStep === steps.length - 1 ? 'Get Started' : 'Next'}</span>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

