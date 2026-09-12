import { createContext, useContext, useState, useEffect } from 'react';
import { meApi } from '../services/api.js';
import { useRole } from './RoleContext.jsx';

/**
 * Provides the active theme to the whole app and persists it. Themes
 * are defined in themes.css as [data-theme="..."] variable blocks; this
 * context only chooses which one is active by setting that attribute on
 * <html> — same split as MedBroker's ThemeContext.jsx.
 *
 * Persistence: sessionStorage before login / in preview mode (no
 * account to save to yet). Once RoleContext's profile-enrichment fetch
 * lands `user.theme` (see RoleContext.jsx), this context adopts it as
 * the active theme. Writes (setTheme) go straight to PATCH /api/me —
 * this is the "once a Users API exists, load from the user's profile
 * instead" MedBroker's own ThemeContext flagged as the next step;
 * WayPoint has that API now, so it starts there instead of repeating
 * the same interim sessionStorage-only state.
 */

export const THEMES = [
  { id: 'light', name: 'Light', swatch: ['#2E8CF0', '#1A5FD0'] },
  { id: 'dark', name: 'Dark', swatch: ['#4F9EFF', '#111827'] },
];

const THEME_IDS = THEMES.map((t) => t.id);
const DEFAULT_THEME = 'light';
const THEME_STORAGE_KEY = 'waypoint.theme';

const ThemeContext = createContext(null);

function getInitialTheme() {
  try {
    const saved = sessionStorage.getItem(THEME_STORAGE_KEY);
    if (saved && THEME_IDS.includes(saved)) return saved;
  } catch {
    // sessionStorage unavailable — fall back to default
  }
  return DEFAULT_THEME;
}

export function ThemeProvider({ children }) {
  const { user } = useRole();
  const [theme, setThemeState] = useState(getInitialTheme);

  // Adopts the saved theme once RoleContext's own GET /api/me lands it
  // on `user` — this context doesn't fetch independently, to avoid two
  // components racing their own GET /api/me on the same login.
  useEffect(() => {
    if (user?.theme && THEME_IDS.includes(user.theme)) setThemeState(user.theme);
  }, [user?.theme]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      sessionStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore — this fallback is best-effort
    }
  }, [theme]);

  function setTheme(nextTheme) {
    setThemeState(nextTheme);
    if (user && !user.passwordMustChange && user.id !== 'preview-user') {
      meApi.update({ theme: nextTheme }).catch(() => {}); // best-effort — local state already updated
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
