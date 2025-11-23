/**
 * Live Recorder Component
 * Records voice and video using MediaRecorder API
 */

import { useState, useRef, useEffect } from 'react';
import { Mic, Video, Square, Play, Pause, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { colors, spacing, typography, cardStyles, buttonStyles } from '../styles/theme';

interface LiveRecorderProps {
  type: 'audio' | 'video';
  onRecordingComplete: (blob: Blob, type: 'audio' | 'video') => void;
  onCancel?: () => void;
}

export function LiveRecorder({ type, onRecordingComplete, onCancel }: LiveRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Request permissions and initialize
  useEffect(() => {
    const initMedia = async () => {
      try {
        if (type === 'video') {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' }, // Front camera for selfie mode
            audio: true,
          });
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.muted = true; // Mute to prevent feedback
            videoRef.current.play();
          }
          setHasPermission(true);
        } else {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          streamRef.current = stream;
          setHasPermission(true);
        }
      } catch (error) {
        console.error('Error accessing media devices:', error);
        setHasPermission(false);
        toast.error('Failed to access camera/microphone. Please grant permissions.');
      }
    };

    initMedia();

    return () => {
      // Cleanup
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [type]);

  const startRecording = async () => {
    if (!streamRef.current) {
      toast.error('Media stream not available');
      return;
    }

    try {
      const mimeType = type === 'video' 
        ? (MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : 'video/mp4')
        : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/wav');

      const mediaRecorder = new MediaRecorder(streamRef.current, {
        mimeType,
      });

      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setRecordedBlob(blob);
        setIsRecording(false);
        setIsPaused(false);
        setRecordingTime(0);
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      toast.success('Recording started');
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('Failed to start recording');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && isRecording && isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    }
  };

  const playRecording = () => {
    if (!recordedBlob) return;

    const url = URL.createObjectURL(recordedBlob);
    
    if (type === 'video') {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.src = url;
        videoRef.current.muted = false;
        videoRef.current.play();
        setIsPlaying(true);
        
        videoRef.current.onended = () => {
          setIsPlaying(false);
          URL.revokeObjectURL(url);
        };
      }
    } else {
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play();
        setIsPlaying(true);
        
        audioRef.current.onended = () => {
          setIsPlaying(false);
          URL.revokeObjectURL(url);
        };
      }
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleSave = () => {
    if (recordedBlob) {
      onRecordingComplete(recordedBlob, type);
    }
  };

  if (hasPermission === false) {
    return (
      <div style={{ ...cardStyles.base, padding: spacing.xl, textAlign: 'center' }}>
        <p style={{ color: colors.error, marginBottom: spacing.md }}>
          Camera/microphone access denied
        </p>
        <p style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm }}>
          Please grant permissions to record {type === 'video' ? 'video' : 'audio'}
        </p>
      </div>
    );
  }

  return (
    <div style={{ ...cardStyles.base, padding: spacing.lg }}>
      <h3 style={{
        fontSize: typography.fontSize.md,
        color: colors.text,
        marginBottom: spacing.md,
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
      }}>
        {type === 'video' ? <Video size={20} style={{ color: colors.primary }} /> : <Mic size={20} style={{ color: colors.primary }} />}
        Record {type === 'video' ? 'Video' : 'Voice'}
      </h3>

      {/* Video Preview (for video recording) */}
      {type === 'video' && (
        <div style={{
          width: '100%',
          maxWidth: '500px',
          margin: '0 auto',
          marginBottom: spacing.md,
          borderRadius: spacing.sm,
          overflow: 'hidden',
          background: colors.surface,
          position: 'relative',
        }}>
          <video
            ref={videoRef}
            style={{
              width: '100%',
              height: 'auto',
              display: 'block',
              transform: 'scaleX(-1)', // Mirror for selfie mode
            }}
            playsInline
            muted
          />
          {isRecording && (
            <div style={{
              position: 'absolute',
              top: spacing.sm,
              right: spacing.sm,
              background: 'rgba(255,0,0,0.8)',
              color: '#fff',
              padding: `${spacing.xs} ${spacing.sm}`,
              borderRadius: spacing.xs,
              fontSize: typography.fontSize.xs,
              display: 'flex',
              alignItems: 'center',
              gap: spacing.xs,
            }}>
              <div style={{
                width: '8px',
                height: '8px',
                background: '#fff',
                borderRadius: '50%',
                animation: 'pulse 1s infinite',
              }} />
              REC
            </div>
          )}
        </div>
      )}

      {/* Recording Controls */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.md,
        alignItems: 'center',
      }}>
        {/* Timer */}
        {isRecording && (
          <div style={{
            fontSize: typography.fontSize.xl,
            color: colors.primary,
            fontWeight: 600,
            fontFamily: typography.fontFamily.mono,
          }}>
            {formatTime(recordingTime)}
          </div>
        )}

        {/* Control Buttons */}
        <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'center' }}>
          {!isRecording && !recordedBlob && (
            <button
              onClick={startRecording}
              disabled={hasPermission !== true}
              style={{
                ...buttonStyles,
                background: colors.primary,
                color: colors.background,
                border: `1px solid ${colors.primary}`,
              }}
            >
              <Mic size={16} />
              <span>Start Recording</span>
            </button>
          )}

          {isRecording && (
            <>
              {isPaused ? (
                <button
                  onClick={resumeRecording}
                  style={{
                    ...buttonStyles,
                    background: colors.primary,
                    color: colors.background,
                    border: `1px solid ${colors.primary}`,
                  }}
                >
                  <Play size={16} />
                  <span>Resume</span>
                </button>
              ) : (
                <button
                  onClick={pauseRecording}
                  style={{
                    ...buttonStyles,
                    background: colors.surface,
                    color: colors.text,
                    border: `1px solid ${colors.border}`,
                  }}
                >
                  <Pause size={16} />
                  <span>Pause</span>
                </button>
              )}
              <button
                onClick={stopRecording}
                style={{
                  ...buttonStyles,
                  background: colors.error,
                  color: '#fff',
                  border: `1px solid ${colors.error}`,
                }}
              >
                <Square size={16} />
                <span>Stop</span>
              </button>
            </>
          )}

          {recordedBlob && (
            <>
              <button
                onClick={playRecording}
                disabled={isPlaying}
                style={{
                  ...buttonStyles,
                  background: colors.surface,
                  color: colors.text,
                  border: `1px solid ${colors.border}`,
                }}
              >
                <Play size={16} />
                <span>Preview</span>
              </button>
              <button
                onClick={handleSave}
                style={{
                  ...buttonStyles,
                  background: colors.primary,
                  color: colors.background,
                  border: `1px solid ${colors.primary}`,
                }}
              >
                <Download size={16} />
                <span>Use Recording</span>
              </button>
            </>
          )}

          {onCancel && (
            <button
              onClick={onCancel}
              style={{
                ...buttonStyles,
                background: colors.surface,
                color: colors.text,
                border: `1px solid ${colors.border}`,
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Hidden audio element for playback */}
      {type === 'audio' && <audio ref={audioRef} style={{ display: 'none' }} />}
    </div>
  );
}

