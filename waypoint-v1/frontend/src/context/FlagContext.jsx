import { createContext, useContext, useEffect, useState } from 'react';
import { flagsApi } from '../services/api.js';

const DEFAULT_FLAGS = {
  'billing.mode': 'manual',
  'auth.sso.enabled': false,
  'security.fieldEncryption.enabled': false,
  'ai.settingsMenu.enabled': false,
};

const FlagContext = createContext(null);

export function FlagProvider({ children }) {
  const [flags, setFlags] = useState(DEFAULT_FLAGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    flagsApi.list()
      .then((result) => { if (!cancelled) setFlags(result?.flags ?? DEFAULT_FLAGS); })
      .catch(() => { if (!cancelled) setFlags(DEFAULT_FLAGS); }) // not signed in yet, or flags not reachable
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function flag(key, fallback = false) {
    const value = flags[key];
    if (value === undefined) return fallback;
    if (value === '0' || value === 'false') return false;
    if (value === '1' || value === 'true') return true;
    return value;
  }

  return (
    <FlagContext.Provider value={{ flags, flag, loading }}>
      {children}
    </FlagContext.Provider>
  );
}

export function useFlags() {
  const ctx = useContext(FlagContext);
  if (!ctx) throw new Error('useFlags must be used within a FlagProvider');
  return ctx;
}
