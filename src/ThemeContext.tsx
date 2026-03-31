import React, { createContext, useContext, useState, useEffect } from 'react';

export type Theme = 'light' | 'dark' | 'blue' | 'green' | 'purple';

export interface ThemeInfo {
  id: Theme;
  label: string;
  colors: { page: string; card: string; accent: string; text: string };
}

export const THEMES: ThemeInfo[] = [
  { id: 'light', label: 'Açık', colors: { page: '#f8fafc', card: '#ffffff', accent: '#4f46e5', text: '#0f172a' } },
  { id: 'dark', label: 'Koyu', colors: { page: '#0f172a', card: '#1e293b', accent: '#818cf8', text: '#f1f5f9' } },
  { id: 'blue', label: 'Mavi', colors: { page: '#f0f7ff', card: '#ffffff', accent: '#2563eb', text: '#0f172a' } },
  { id: 'green', label: 'Yeşil', colors: { page: '#f0fdf4', card: '#ffffff', accent: '#0d9488', text: '#0f172a' } },
  { id: 'purple', label: 'Mor', colors: { page: '#faf5ff', card: '#ffffff', accent: '#9333ea', text: '#0f172a' } },
];

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('app-theme');
    if (saved && ['light', 'dark', 'blue', 'green', 'purple'].includes(saved)) {
      return saved as Theme;
    }
    return 'light';
  });

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('app-theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
