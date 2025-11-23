/**
 * Session Authentication Service
 * Manages session tokens to avoid repeated wallet signatures
 */

const SESSION_TOKEN_KEY = 'lumina_session_token';
const SESSION_EXPIRY_KEY = 'lumina_session_expiry';
const SESSION_ADDRESS_KEY = 'lumina_session_address';

export interface SessionData {
  token: string;
  expiresAt: number;
  address: string;
}

/**
 * Get stored session token
 */
export function getSessionToken(): string | null {
  const token = localStorage.getItem(SESSION_TOKEN_KEY);
  const expiry = localStorage.getItem(SESSION_EXPIRY_KEY);
  
  if (!token || !expiry) {
    return null;
  }
  
  // Check if session is expired
  const expiresAt = parseInt(expiry, 10);
  if (Date.now() >= expiresAt) {
    clearSession();
    return null;
  }
  
  return token;
}

/**
 * Store session token
 */
export function setSessionToken(data: SessionData): void {
  localStorage.setItem(SESSION_TOKEN_KEY, data.token);
  localStorage.setItem(SESSION_EXPIRY_KEY, data.expiresAt.toString());
  localStorage.setItem(SESSION_ADDRESS_KEY, data.address);
}

/**
 * Clear session token
 */
export function clearSession(): void {
  localStorage.removeItem(SESSION_TOKEN_KEY);
  localStorage.removeItem(SESSION_EXPIRY_KEY);
  localStorage.removeItem(SESSION_ADDRESS_KEY);
}

/**
 * Get session address
 */
export function getSessionAddress(): string | null {
  return localStorage.getItem(SESSION_ADDRESS_KEY);
}

/**
 * Check if session is valid
 */
export function isSessionValid(): boolean {
  const token = getSessionToken();
  return token !== null;
}

/**
 * Create a new session by signing with wallet
 */
export async function createSession(
  signRequestHeaders: (method: string, path: string) => Promise<Record<string, string> | null>
): Promise<SessionData | null> {
  try {
    const headers = await signRequestHeaders('POST', '/api/auth/session');
    if (!headers) {
      return null;
    }
    
    const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/auth/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      credentials: 'include',
    });
    
    if (!response.ok) {
      throw new Error('Failed to create session');
    }
    
    const data = await response.json();
    if (data.success && data.sessionToken) {
      const sessionData: SessionData = {
        token: data.sessionToken,
        expiresAt: data.expiresAt,
        address: data.address,
      };
      setSessionToken(sessionData);
      return sessionData;
    }
    
    return null;
  } catch (error) {
    console.error('Failed to create session', error);
    return null;
  }
}

