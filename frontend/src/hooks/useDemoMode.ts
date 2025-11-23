/**
 * Demo Mode Hook
 * Manages demo account mode with localStorage persistence
 */

import { useState, useEffect } from 'react';

const DEMO_MODE_KEY = 'lumina_demo_mode';
const DEMO_ADDRESS_KEY = 'lumina_demo_address';
const DEMO_ADDRESS = '0x0b5161f61c09d8617525cd194ff6d731d0c715c998f20d2f55856425ab60eee6';

export function useDemoMode() {
  const [isDemoMode, setIsDemoMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(DEMO_MODE_KEY) === 'true';
  });

  const [demoAddress, setDemoAddress] = useState<string>(() => {
    if (typeof window === 'undefined') return DEMO_ADDRESS;
    return localStorage.getItem(DEMO_ADDRESS_KEY) || DEMO_ADDRESS;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isDemoMode) {
      localStorage.setItem(DEMO_MODE_KEY, 'true');
      localStorage.setItem(DEMO_ADDRESS_KEY, demoAddress);
    } else {
      localStorage.removeItem(DEMO_MODE_KEY);
      localStorage.removeItem(DEMO_ADDRESS_KEY);
    }
  }, [isDemoMode, demoAddress]);

  const enableDemoMode = () => {
    setIsDemoMode(true);
    setDemoAddress(DEMO_ADDRESS);
  };

  const disableDemoMode = () => {
    setIsDemoMode(false);
  };

  return {
    isDemoMode,
    demoAddress,
    enableDemoMode,
    disableDemoMode,
  };
}

