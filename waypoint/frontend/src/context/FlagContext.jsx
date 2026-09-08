import { createContext, useContext, useEffect, useState } from 'react';
import { flagsApi } from '../services/api.js';

// Defaults mirror api/seed.js — used when the API call returns null
// (preview mode) so the UI still renders something sensible without a
// live backend. See FR-002 for what each flag controls.
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
    flagsApi.list().then((result) => {
      if (cancelled) return;
      setFlags(result?.flags ?? DEFAULT_FLAGS);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  // Boolean coercion handled server-side (flagService.js) already returns
  // real booleans/strings over JSON, so flag() here is mostly a safe
  // accessor with a documented fallback — kept for parity with the
  // app-builder convention and to absorb any legacy '0'/'1' string values.
  function flag(key, fallback = false) {
    const value = flags[key];
    if (value === undefined) return fallback;
    if (value === '0' || value === 'false') return false;
    if (value === '1' || value === 'true') return true;
    return value; // enum value — passes through as-is
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
