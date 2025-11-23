/**
 * AI Haiku Generation Service
 * Generates haikus from decrypted content using TinyLlama (on-device) or mock
 * 
 * In production, this would run in Nautilus TEE for privacy
 */

import { logger } from '../utils/logger';

interface HaikuOptions {
  content?: string;
  contentType?: 'image' | 'video' | 'audio' | 'text';
  metadata?: Record<string, unknown>;
}

/**
 * Generate a haiku from content
 * In production, this would:
 * 1. Run in Nautilus TEE for privacy
 * 2. Use TinyLlama 70M model
 * 3. Generate haiku based on content analysis
 * 
 * For now, returns mock haikus based on content type
 */
export async function generateHaiku(options: HaikuOptions): Promise<string> {
  try {
    const { contentType, metadata } = options;

    // Mock haiku generation based on content type
    // In production, this would analyze the actual content in TEE
    const haikus: Record<string, string[]> = {
      image: [
        "Tiny kick in dark, / Mother's hope in silent code — / Light breaks at dawn.",
        "Frozen moment caught, / Time's whisper in pixels stored — / Memory preserved.",
        "Smile captured in light, / Joy encrypted forever — / Future's gift awaits.",
      ],
      video: [
        "First steps on the floor, / Tiny feet exploring world — / Journey begins now.",
        "Laughter fills the room, / Echoes of pure happiness — / Sealed in digital light.",
        "Dance of celebration, / Movement frozen in time's vault — / Awaiting unlock.",
      ],
      audio: [
        "Voice from distant past, / Words of love in sound waves stored — / Echoes of the heart.",
        "Lullaby's soft tune, / Comfort wrapped in melody — / Peace for future days.",
        "Story told in sound, / Wisdom passed through generations — / Legacy preserved.",
      ],
      text: [
        "Words written with care, / Thoughts encrypted in light's vault — / Truth awaits its time.",
        "Promise made in text, / Commitment sealed forever — / Future will reveal.",
        "Memory in words, / Captured moment's essence stored — / Light will set it free.",
      ],
      default: [
        "Tiny kick in dark, / Mother's hope in silent code — / Light breaks at dawn.",
        "Memory sealed in light, / Encrypted for future days — / Unlock when time comes.",
        "Digital time capsule, / Preserved with love and care — / Awaiting its moment.",
      ],
    };

    const category = contentType || 'default';
    const haikuList = haikus[category] || haikus.default;
    
    // Select haiku based on metadata hash or random
    const index = metadata?.hash 
      ? (typeof metadata.hash === 'string' ? parseInt(metadata.hash.slice(0, 2), 16) : 0) % haikuList.length
      : Math.floor(Math.random() * haikuList.length);

    const haiku = haikuList[index];
    
    logger.info('AI haiku generated', { contentType, haiku });
    return haiku;
  } catch (error) {
    logger.error('Failed to generate haiku', { error });
    // Fallback haiku
    return "Memory sealed in light, / Encrypted for future days — / Unlock when time comes.";
  }
}

/**
 * Generate haiku in Nautilus TEE (mock implementation)
 * In production, this would call Nautilus TEE API
 */
export async function generateHaikuInTEE(
  encryptedContent: Uint8Array,
  contentType: string
): Promise<string> {
  try {
    // Mock TEE call - in production, this would:
    // 1. Send encrypted content to Nautilus TEE
    // 2. TEE decrypts and analyzes content
    // 3. TEE runs TinyLlama model
    // 4. TEE returns haiku (content never leaves TEE)
    
    logger.info('Generating haiku in TEE', { contentType, contentSize: encryptedContent.length });
    
    // Simulate TEE processing delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // For now, use mock generation
    return await generateHaiku({ contentType: contentType as any });
  } catch (error) {
    logger.error('TEE haiku generation failed', { error });
    return "Memory sealed in light, / Encrypted for future days — / Unlock when time comes.";
  }
}

