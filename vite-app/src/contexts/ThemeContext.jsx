import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { THEME_ORDER, THEME_META } from '../utils/utils.js';

const ThemeContext = createContext({ theme: 'dark', toggleTheme: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.content = THEME_META[theme] || '#111111';
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const idx = THEME_ORDER.indexOf(prev);
      return THEME_ORDER[(idx + 1) % THEME_ORDER.length];
    });
  }, []);

  return (
    <ThemeContext.Provider value={useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme])}>
      {children}
    </ThemeContext.Provider>
  );
}

export { ThemeContext };
export default ThemeContext;
