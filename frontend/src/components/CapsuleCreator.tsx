/**
 * LUMINA Capsule Creator Component
 * Creates encrypted memory capsules with unlock conditions
 */

import React, { useState, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Upload, File, Lock, CheckCircle, Mic, Video as VideoIcon, Users, Copy } from 'lucide-react';
import { colors, spacing, typography, cardStyles, inputStyles, buttonStyles, borderRadius } from '../styles/theme';
import { BinaryProgressBar } from './BinaryProgressBar';
import { UploadProgressModal } from './UploadProgressModal';
import { LiveRecorder } from './LiveRecorder';
import { TextPressure } from './TextPressure';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import type { CapsuleUnlockConfig, UnlockCondition, CapsuleUploadResult } from '../types/capsule';

interface CapsuleCreatorProps {
  onCapsuleCreated?: (capsuleId: string) => void;
  address: string;
  isConnected: boolean;
  uploadCapsule: (
    file: File,
    metadata: { description?: string; tags?: string[]; message?: string; nftUnlockAt?: number },
    unlockConfig: CapsuleUnlockConfig,
    voiceBlob?: Blob,
    onProgress?: (stage: string, progress: number) => void
  ) => Promise<CapsuleUploadResult>;
  loading: boolean;
}

interface UploadLog {
  stage: string;
  message: string;
  timestamp: number;
  status: 'pending' | 'processing' | 'complete' | 'error';
}

export function CapsuleCreator({ 
  onCapsuleCreated, 
  address, 
  isConnected, 
  uploadCapsule, 
  loading 
}: CapsuleCreatorProps) {
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  // Each capsule has its own unlock condition
  const [unlockCondition, setUnlockCondition] = useState<UnlockCondition>('manual');
  // Multi-party options
  const [sharedOwners, setSharedOwners] = useState<string[]>([]);
  const [newOwnerAddress, setNewOwnerAddress] = useState('');
  const [quorumThreshold, setQuorumThreshold] = useState<number>(1);
  const [enableMultiParty, setEnableMultiParty] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<{ capsuleId: string; blobId: string; nftId?: string } | null>(null);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [uploadLogs, setUploadLogs] = useState<UploadLog[]>([]);
  const [inputMode, setInputMode] = useState<'file' | 'voice' | 'video'>('file');
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null); // Separate voice recording for NFT
  const [message, setMessage] = useState(''); // Optional message for NFT
  const [nftUnlockAt, setNftUnlockAt] = useState<string>(''); // NFT unlock date (only used when time unlock is selected)
  const [enableInheritance, setEnableInheritance] = useState(false);
  const [inheritanceAddresses, setInheritanceAddresses] = useState('');
  const [inheritanceInactiveDays, setInheritanceInactiveDays] = useState(365);
  const [autoTransferInheritance, setAutoTransferInheritance] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Throttle progress updates to prevent infinite loops
  const lastProgressRef = useRef<{ stage: string; progress: number }>({ stage: '', progress: -1 });
  const lastLogTimeRef = useRef<number>(0);

  // Memoize addLog to prevent infinite loops
  const addLog = useCallback((stage: string, message: string, status: UploadLog['status'] = 'processing') => {
    setUploadLogs(prev => {
      // Prevent duplicate logs by checking the last log
      const lastLog = prev[prev.length - 1];
      if (lastLog && lastLog.stage === stage && lastLog.message === message) {
        return prev; // Don't add duplicate
      }
      return [...prev, { stage, message, timestamp: Date.now(), status }];
    });
  }, []);
  
  // Stable progress callback that throttles updates
  const handleProgress = useCallback((stage: string, progress: number) => {
    const roundedProgress = Math.round(progress);
    const now = Date.now();
    
    // Throttle: only update if progress changed by at least 1% or 500ms passed
    const lastProgress = lastProgressRef.current;
    const progressChanged = Math.abs(lastProgress.progress - roundedProgress) >= 1;
    const timePassed = now - lastLogTimeRef.current > 500;
    const stageChanged = lastProgress.stage !== stage;
    
    // Always update progress state (but throttle log updates)
    if (progressChanged || stageChanged) {
      setUploadProgress(roundedProgress);
      lastProgressRef.current = { stage, progress: roundedProgress };
    }
    
    // Throttle log and toast updates
    if (progressChanged || stageChanged || timePassed) {
      addLog(stage, `${stage}... ${roundedProgress}%`, 'processing');
      toast.loading(`${stage}... ${roundedProgress}%`, { id: 'capsule-create' });
      lastLogTimeRef.current = now;
    }
  }, [addLog]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file size (200MB limit)
      if (selectedFile.size > 200 * 1024 * 1024) {
        toast.error('File size exceeds 200MB limit');
        return;
      }
      // Validate file type
      const allowedTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'video/mp4', 'video/webm', 'video/quicktime',
        'audio/mpeg', 'audio/wav', 'audio/webm',
        'application/pdf', 'text/plain', 'application/json',
      ];
      if (!allowedTypes.includes(selectedFile.type)) {
        toast.error('Invalid file type. Allowed: images, videos, audio, PDF, text, JSON');
        return;
      }
      setFile(selectedFile);
      setUploadResult(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      // Validate file size (200MB limit)
      if (droppedFile.size > 200 * 1024 * 1024) {
        toast.error('File size exceeds 200MB limit');
        return;
      }
      // Validate file type
      const allowedTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'video/mp4', 'video/webm', 'video/quicktime',
        'audio/mpeg', 'audio/wav', 'audio/webm',
        'application/pdf', 'text/plain', 'application/json',
      ];
      if (!allowedTypes.includes(droppedFile.type)) {
        toast.error('Invalid file type. Allowed: images, videos, audio, PDF, text, JSON');
        return;
      }
      setFile(droppedFile);
      setUploadResult(null);
    }
  };

  const handleCreate = async () => {
    if (!file && !recordedBlob) {
      toast.error('Please select a file or record audio/video');
      return;
    }

    // Use recorded blob if available, otherwise use file
    const fileToUpload = file || (recordedBlob ? (() => {
      const fileName = inputMode === 'video' ? `recording-${Date.now()}.webm` : `recording-${Date.now()}.webm`;
      // @ts-ignore - File constructor works at runtime
      return new File([recordedBlob], fileName, { type: recordedBlob.type });
    })() : null);

    if (!fileToUpload) {
      toast.error('No file to upload');
      return;
    }

    if (!isConnected || !address) {
      toast.error('Please connect your wallet');
      return;
    }

    try {
      setUploadProgress(0);
      setUploadLogs([]);
      setShowProgressModal(true);
      
      addLog('Initialization', 'Preparing memory capsule...', 'processing');
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const tagsArray = tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
      addLog('Validation', 'Validating file and unlock conditions...', 'processing');
      await new Promise(resolve => setTimeout(resolve, 200));

      // Build unlock config - public sharing removed for security
      const unlockConfig: CapsuleUnlockConfig = {
        condition: unlockCondition,
        unlockDateTime: undefined, // Using NFT unlock date instead
        sharedOwners: enableMultiParty && sharedOwners.length > 0 ? sharedOwners : undefined,
        quorumThreshold: enableMultiParty && sharedOwners.length > 0 ? quorumThreshold : undefined,
        inheritanceTargets: enableInheritance && inheritanceAddresses.trim().length > 0
          ? {
              addresses: inheritanceAddresses
                .split(',')
                .map(addr => addr.trim())
                .filter(addr => addr.length > 0),
              inactiveAfterDays: inheritanceInactiveDays,
              autoTransfer: autoTransferInheritance,
            }
          : undefined,
      };

      // Track stages for server-based flow
      toast.loading('Starting capsule creation...', { id: 'capsule-create' });
      addLog('Upload', 'Sending encrypted data to backend...', 'processing');
      
      // Convert NFT unlock date to timestamp (end of day)
      const nftUnlockTimestamp = nftUnlockAt 
        ? new Date(nftUnlockAt + 'T23:59:59').getTime() 
        : 0;
      
      const result = await uploadCapsule(
        fileToUpload,
        {
          description: description || undefined,
          message: message || undefined,
          tags: tagsArray.length > 0 ? tagsArray : undefined,
          nftUnlockAt: nftUnlockTimestamp > 0 ? nftUnlockTimestamp : undefined,
        },
        unlockConfig,
        voiceBlob || undefined, // Pass voice blob directly (convert null to undefined)
        handleProgress
      );
      
      toast.success('Capsule created successfully!', { id: 'capsule-create' });
      addLog('Complete', 'Capsule created successfully!', 'complete');
      setUploadProgress(100);
      
      setUploadResult({ capsuleId: result.capsuleId, blobId: result.blobId });
      
      // Don't auto-close modal - let user close it manually
      
      if (onCapsuleCreated) {
        onCapsuleCreated(result.capsuleId);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      addLog('Error', errorMessage, 'error');
      toast.error(errorMessage, { id: 'capsule-create' });
      setUploadProgress(0);
      setTimeout(() => {
        setShowProgressModal(false);
        setUploadLogs([]);
      }, 2000);
    }
  };

  if (!isConnected) {
    return (
      <div style={{
        ...cardStyles.base,
        textAlign: 'center',
        padding: spacing.xl,
      }}>
        <Lock size={32} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
        <p style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm }}>
          Connect your wallet to create a memory capsule
        </p>
      </div>
    );
  }

  return (
    <div style={{ 
      width: '100%',
      maxWidth: '800px',
      margin: '0 auto',
      padding: `0 ${spacing.md}`,
    }}>
      <div style={{ 
        ...cardStyles.base, 
        padding: spacing.lg,
        width: '100%',
      }}>
          <TextPressure
            text="Add Memory to Vault"
            style={{
              color: colors.text,
              fontSize: typography.fontSize.xl,
              marginBottom: spacing.lg,
              marginTop: 0,
              fontFamily: typography.fontFamily.display,
              fontWeight: typography.fontWeight.bold,
              letterSpacing: typography.letterSpacing.wide,
              display: 'block',
            }}
          />
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
          {/* Input Mode Selection */}
          <div>
            <label style={{ 
              display: 'block', 
              color: colors.text, 
              fontSize: typography.fontSize.sm, 
              marginBottom: spacing.sm,
              fontFamily: typography.fontFamily.sans,
              fontWeight: typography.fontWeight.medium,
            }}>
              Input Method
            </label>
            <div style={{ 
              display: 'flex', 
              gap: spacing.sm,
              flexWrap: 'wrap' as const,
            }}>
              <button
                type="button"
                onClick={() => {
                  setInputMode('file');
                  setRecordedBlob(null);
                }}
                style={{
                  ...buttonStyles,
                  flex: 1,
                  background: inputMode === 'file' ? colors.primary : colors.surface,
                  color: inputMode === 'file' ? colors.background : colors.text,
                  border: `1px solid ${inputMode === 'file' ? colors.primary : colors.border}`,
                  padding: spacing.sm,
                  fontSize: typography.fontSize.xs,
                }}
              >
                <Upload size={14} />
                <span>Upload File</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setInputMode('voice');
                  setFile(null);
                }}
                style={{
                  ...buttonStyles,
                  flex: 1,
                  background: inputMode === 'voice' ? colors.primary : colors.surface,
                  color: inputMode === 'voice' ? colors.background : colors.text,
                  border: `1px solid ${inputMode === 'voice' ? colors.primary : colors.border}`,
                  padding: spacing.sm,
                  fontSize: typography.fontSize.xs,
                }}
              >
                <Mic size={14} />
                <span>Record Voice</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setInputMode('video');
                  setFile(null);
                }}
                style={{
                  ...buttonStyles,
                  flex: 1,
                  background: inputMode === 'video' ? colors.primary : colors.surface,
                  color: inputMode === 'video' ? colors.background : colors.text,
                  border: `1px solid ${inputMode === 'video' ? colors.primary : colors.border}`,
                  padding: spacing.sm,
                  fontSize: typography.fontSize.xs,
                }}
              >
                <VideoIcon size={14} />
                <span>Record Video</span>
              </button>
            </div>
          </div>

          {/* File Upload */}
          {inputMode === 'file' && (
            <div>
              <label style={{ 
                display: 'block', 
                color: colors.text, 
                fontSize: typography.fontSize.sm, 
                marginBottom: spacing.sm,
                fontFamily: typography.fontFamily.sans,
                fontWeight: typography.fontWeight.medium,
              }}>
                Memory File
              </label>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              style={{
                ...inputStyles.base,
                height: '120px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                border: `2px dashed ${colors.border}`,
                width: '100%',
                transition: 'all 0.3s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = colors.borderHover;
                e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = colors.border;
                e.currentTarget.style.background = 'rgba(0,0,0,0.4)';
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
                accept="*/*"
              />
              {file ? (
                <div style={{ textAlign: 'center' }}>
                  <File size={24} style={{ marginBottom: spacing.xs, opacity: 0.7 }} />
                  <p style={{ color: colors.text, fontSize: typography.fontSize.sm, margin: 0 }}>
                    {file.name}
                  </p>
                  <p style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs, margin: 0 }}>
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <Upload size={24} style={{ marginBottom: spacing.xs, opacity: 0.5 }} />
                  <p style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, margin: 0 }}>
                    Drop file here or click to browse
                  </p>
                </div>
              )}
            </div>
          </div>
          )}

          {/* Live Recording */}
          {(inputMode === 'voice' || inputMode === 'video') && (
            <LiveRecorder
              type={inputMode === 'voice' ? 'audio' : 'video'}
              onRecordingComplete={(blob, type) => {
                setRecordedBlob(blob);
                // Convert blob to File for upload
                const fileName = type === 'video' 
                  ? `recording-${Date.now()}.webm`
                  : `recording-${Date.now()}.webm`;
                // @ts-ignore - File constructor works at runtime
                const file = new File([blob], fileName, { type: blob.type });
                setFile(file);
                toast.success(`${type === 'video' ? 'Video' : 'Voice'} recording ready`);
              }}
              onCancel={() => {
                setInputMode('file');
                setRecordedBlob(null);
              }}
            />
          )}

          {/* Message (Required for NFT) */}
          <div>
            <Label style={{ marginBottom: spacing.xs }}>
              Message <span style={{ color: colors.error }}>*</span>
            </Label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write a message for your memory NFT (required)"
              required
              style={{
                ...inputStyles.base,
                minHeight: '100px',
                resize: 'vertical',
                fontFamily: typography.fontFamily.sans,
                padding: '12px',
                width: '100%',
              }}
            />
            <p style={{ 
              color: colors.textSecondary, 
              fontSize: typography.fontSize.xs, 
              marginTop: spacing.xs 
            }}>
              This message will be permanently stored in your NFT
            </p>
          </div>

          {/* Description (Optional) */}
          <div>
            <Label style={{ marginBottom: spacing.xs }}>
              Description (Optional)
            </Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional notes (e.g., 'Baby's first laugh', 'Wedding vows')"
              style={{
                ...inputStyles.base,
                minHeight: '80px',
                resize: 'vertical',
                fontFamily: typography.fontFamily.sans,
                padding: '12px',
                width: '100%',
              }}
            />
          </div>

          {/* Voice Recording for NFT (Optional, only if file/video exists) */}
          {(file || recordedBlob) && (
            <div>
              <Label style={{ marginBottom: spacing.xs }}>
                Voice Recording (Optional for NFT)
              </Label>
              {!voiceBlob ? (
                <LiveRecorder
                  type="audio"
                  onRecordingComplete={(blob) => {
                    setVoiceBlob(blob);
                    toast.success('Voice recording ready for NFT');
                  }}
                  onCancel={() => {
                    setVoiceBlob(null);
                  }}
                />
              ) : (
                <div style={{
                  ...cardStyles.base,
                  padding: spacing.md,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                    <Mic size={20} style={{ color: colors.primary }} />
                    <span style={{ color: colors.text, fontSize: typography.fontSize.sm }}>
                      Voice recording ready
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setVoiceBlob(null);
                    }}
                    style={{
                      ...buttonStyles,
                      background: colors.error,
                      color: colors.background,
                      padding: `${spacing.xs} ${spacing.sm}`,
                      fontSize: typography.fontSize.xs,
                    }}
                  >
                    Remove
                  </button>
                </div>
              )}
              <p style={{ 
                color: colors.textSecondary, 
                fontSize: typography.fontSize.xs, 
                marginTop: spacing.xs 
              }}>
                Optional: Add a voice recording to your NFT
              </p>
            </div>
          )}

          {/* Tags */}
          <div>
            <Label style={{ marginBottom: spacing.xs }}>
              Tags (Optional)
            </Label>
            <Input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="family, milestone, 2025"
              style={{ width: '100%' }}
            />
          </div>

          {/* Unlock Condition Selection */}
          <div>
            <Label style={{ marginBottom: spacing.xs }}>
              Unlock Condition
            </Label>
            <select
              value={unlockCondition}
              onChange={(e) => {
                setUnlockCondition(e.target.value as UnlockCondition);
                if (e.target.value !== 'time') {
                  setNftUnlockAt(''); // Clear NFT unlock date when not using time unlock
                }
              }}
              style={inputStyles.base}
            >
              <option value="manual">Manual (unlock anytime)</option>
              <option value="time">Timer (unlock at specific date/time)</option>
            </select>
          </div>

          {/* NFT Unlock Date (Only show if time unlock is selected) */}
          {unlockCondition === 'time' && (
            <div>
              <Label style={{ marginBottom: spacing.xs }}>
                NFT Unlock Date (Days)
              </Label>
              <input
                type="date"
                value={nftUnlockAt}
                onChange={(e) => setNftUnlockAt(e.target.value)}
                style={{
                  ...inputStyles.base,
                  width: '100%',
                  padding: '10px',
                }}
              />
              <p style={{ 
                color: colors.textSecondary, 
                fontSize: typography.fontSize.xs, 
                marginTop: spacing.xs 
              }}>
                Set a date when this NFT will unlock. Leave empty for immediate unlock. The NFT will be locked until this date.
              </p>
            </div>
          )}

          {/* Multi-Party Options (Optional - for future use) */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, color: colors.text, fontSize: typography.fontSize.sm, marginBottom: spacing.xs }}>
              <input
                type="checkbox"
                checked={enableMultiParty}
                onChange={(e) => setEnableMultiParty(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <Users size={14} />
              <span>Shared Ownership</span>
            </label>
            {enableMultiParty && (
              <div style={{ marginTop: spacing.sm, padding: spacing.sm, background: colors.surface, borderRadius: borderRadius.md }}>
                <div style={{ display: 'flex', gap: spacing.xs, marginBottom: spacing.xs }}>
                  <Input
                    type="text"
                    placeholder="Owner address (0x...)"
                    value={newOwnerAddress}
                    onChange={(e) => setNewOwnerAddress(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (newOwnerAddress.trim() && !sharedOwners.includes(newOwnerAddress.trim())) {
                        setSharedOwners([...sharedOwners, newOwnerAddress.trim()]);
                        setNewOwnerAddress('');
                      }
                    }}
                  >
                    Add
                  </Button>
                </div>
                {sharedOwners.length > 0 && (
                  <div style={{ marginTop: spacing.xs }}>
                    <label style={{ display: 'block', color: colors.textSecondary, fontSize: typography.fontSize.xs, marginBottom: spacing.xs }}>
                      Quorum Threshold (min {Math.max(1, Math.ceil(sharedOwners.length / 2))}, max {sharedOwners.length + 1})
                    </label>
                    <input
                      type="number"
                      value={quorumThreshold}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 1;
                        const min = Math.max(1, Math.ceil(sharedOwners.length / 2));
                        const max = sharedOwners.length + 1;
                        setQuorumThreshold(Math.max(min, Math.min(max, val)));
                      }}
                      min={Math.max(1, Math.ceil(sharedOwners.length / 2))}
                      max={sharedOwners.length + 1}
                      style={inputStyles.base}
                    />
                    <div style={{ marginTop: spacing.xs }}>
                      {sharedOwners.map((owner, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: spacing.xs, background: colors.background, borderRadius: borderRadius.sm, marginTop: spacing.xs }}>
                          <Badge variant="outline" style={{ fontFamily: 'monospace', fontSize: typography.fontSize.xs }}>
                            {owner.slice(0, 10)}...{owner.slice(-8)}
                          </Badge>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setSharedOwners(sharedOwners.filter((_, i) => i !== idx))}
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Inheritance Mode */}
          <div style={{ marginTop: spacing.lg }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, color: colors.text, fontSize: typography.fontSize.sm, marginBottom: spacing.xs }}>
              <input
                type="checkbox"
                checked={enableInheritance}
                onChange={(e) => setEnableInheritance(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <Lock size={14} />
              <span>Enable Inheritance Mode</span>
            </label>
            {enableInheritance && (
              <div style={{ marginTop: spacing.sm, padding: spacing.sm, background: colors.surface, borderRadius: borderRadius.md }}>
                <div style={{ marginBottom: spacing.sm }}>
                  <Label style={{ marginBottom: spacing.xs }}>
                    Fallback Wallets (comma separated 0x addresses)
                  </Label>
                  <Input
                    type="text"
                    value={inheritanceAddresses}
                    onChange={(e) => setInheritanceAddresses(e.target.value)}
                    placeholder="0x123...,0x456..."
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <Label style={{ marginBottom: spacing.xs }}>
                      Inactive After (days)
                    </Label>
                    <input
                      type="number"
                      min={30}
                      max={3650}
                      value={inheritanceInactiveDays}
                      onChange={(e) => setInheritanceInactiveDays(Math.max(30, Math.min(3650, parseInt(e.target.value) || 365)))}
                      style={inputStyles.base}
                    />
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, marginTop: spacing.lg }}>
                    <input
                      type="checkbox"
                      checked={autoTransferInheritance}
                      onChange={(e) => setAutoTransferInheritance(e.target.checked)}
                    />
                    <span style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>Auto-transfer when triggered</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Upload Button */}
          <Button
            onClick={handleCreate}
            disabled={loading || !file}
            variant="default"
            size="lg"
            style={{
              width: '100%',
              marginTop: spacing.md,
            }}
          >
            {loading ? (
              <>
                <span>Sealing in Light...</span>
              </>
            ) : (
              <>
                <Lock size={16} />
                <span>Seal in Light</span>
              </>
            )}
          </Button>

          {/* Upload Progress */}
          {uploadProgress > 0 && uploadProgress < 100 && (
            <div style={{ marginTop: spacing.sm }}>
              <BinaryProgressBar progress={uploadProgress} height={6} />
            </div>
          )}

          {/* Success Message */}
          {uploadResult && (
            <div style={{
              ...cardStyles.base,
              padding: spacing.md,
              background: colors.successBg,
              border: `1px solid ${colors.successBorder}`,
              marginTop: spacing.sm,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
                <CheckCircle size={16} style={{ color: colors.success }} />
                <span style={{ color: colors.text, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold }}>
                  Memory Capsule Sealed
                </span>
              </div>
              <p style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs, margin: 0, marginBottom: spacing.sm, lineHeight: 1.5 }}>
                Your memory has been encrypted and sealed. It will unlock when your conditions are met.
              </p>
              
              {/* Copy Capsule Link */}
              <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.sm }}>
                <button
                  type="button"
                  onClick={() => {
                    const capsuleLink = `https://lumina.sui/capsule/${uploadResult.capsuleId}`;
                    navigator.clipboard.writeText(capsuleLink);
                    toast.success('Capsule link copied!');
                  }}
                  style={{
                    ...buttonStyles,
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: spacing.xs,
                    padding: spacing.sm,
                    fontSize: typography.fontSize.xs,
                  }}
                >
                  <Copy size={14} />
                  Copy Capsule Link
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Upload Progress Modal */}
      <UploadProgressModal
        isOpen={showProgressModal}
        progress={uploadProgress}
        logs={uploadLogs}
        onClose={() => {
          setShowProgressModal(false);
          setUploadProgress(0);
          setUploadLogs([]);
        }}
        onComplete={() => {
          // Reset all state when upload completes
          setFile(null);
          setRecordedBlob(null);
          setVoiceBlob(null);
          setMessage('');
          setDescription('');
          setTags('');
          setUnlockCondition('manual');
          setEnableMultiParty(false);
          setSharedOwners([]);
          setQuorumThreshold(1);
          setEnableInheritance(false);
          setInheritanceAddresses('');
          setInheritanceInactiveDays(365);
          setAutoTransferInheritance(false);
        }}
      />
    </div>
  );
}

