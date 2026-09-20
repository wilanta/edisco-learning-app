export type ThemePreference = 'LIGHT' | 'DARK';

const THEME_STORAGE_KEY = 'edisco_theme';

export function applyTheme(theme: ThemePreference) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme.toLowerCase();
}

export function storeTheme(theme: ThemePreference) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  applyTheme(theme);
}

export function syncThemeIfNeeded(serverTheme: ThemePreference) {
  if (typeof window === 'undefined') return;
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored) return;
  storeTheme(serverTheme);
}

export function getStoredTheme(): ThemePreference {
  if (typeof window === 'undefined') return 'LIGHT';
  return window.localStorage.getItem(THEME_STORAGE_KEY) === 'DARK'
    ? 'DARK'
    : 'LIGHT';
}
