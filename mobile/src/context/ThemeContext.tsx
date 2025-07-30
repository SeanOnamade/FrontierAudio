/**
 * Theme Context for JARVIS Mobile App
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme, Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  themeMode: ThemeMode;
  isDarkMode: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  theme: {
    colors: {
      primary: string;
      primaryContainer: string;
      secondary: string;
      secondaryContainer: string;
      tertiary: string;
      tertiaryContainer: string;
      surface: string;
      surfaceVariant: string;
      background: string;
      error: string;
      errorContainer: string;
      onPrimary: string;
      onPrimaryContainer: string;
      onSecondary: string;
      onSecondaryContainer: string;
      onTertiary: string;
      onTertiaryContainer: string;
      onSurface: string;
      onSurfaceVariant: string;
      onError: string;
      onErrorContainer: string;
      onBackground: string;
      outline: string;
      outlineVariant: string;
      shadow: string;
      scrim: string;
    };
  };
}

const lightTheme = {
  colors: {
    primary: '#4CAF50',
    primaryContainer: '#E8F5E8',
    secondary: '#2196F3',
    secondaryContainer: '#E3F2FD',
    tertiary: '#FF9800',
    tertiaryContainer: '#FFF3E0',
    surface: '#FFFFFF',
    surfaceVariant: '#F5F5F5',
    background: '#FAFAFA',
    error: '#F44336',
    errorContainer: '#FFEBEE',
    onPrimary: '#FFFFFF',
    onPrimaryContainer: '#1B5E20',
    onSecondary: '#FFFFFF',
    onSecondaryContainer: '#0D47A1',
    onTertiary: '#FFFFFF',
    onTertiaryContainer: '#E65100',
    onSurface: '#1C1B1F',
    onSurfaceVariant: '#49454F',
    onError: '#FFFFFF',
    onErrorContainer: '#5F2120',
    onBackground: '#1C1B1F',
    outline: '#79747E',
    outlineVariant: '#CAC4D0',
    shadow: '#000000',
    scrim: '#000000',
  },
};

const darkTheme = {
  colors: {
    primary: '#4CAF50',
    primaryContainer: '#2E7D32',
    secondary: '#64B5F6',
    secondaryContainer: '#1565C0',
    tertiary: '#FFB74D',
    tertiaryContainer: '#F57C00',
    surface: '#121212',
    surfaceVariant: '#1E1E1E',
    background: '#0F0F0F',
    error: '#CF6679',
    errorContainer: '#8C1D18',
    onPrimary: '#FFFFFF',
    onPrimaryContainer: '#E8F5E8',
    onSecondary: '#FFFFFF',
    onSecondaryContainer: '#E3F2FD',
    onTertiary: '#FFFFFF',
    onTertiaryContainer: '#FFF3E0',
    onSurface: '#E6E1E5',
    onSurfaceVariant: '#CAC4D0',
    onError: '#FFFFFF',
    onErrorContainer: '#F2B8B5',
    onBackground: '#E6E1E5',
    outline: '#938F99',
    outlineVariant: '#49454F',
    shadow: '#000000',
    scrim: '#000000',
  },
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    loadStoredTheme();
  }, []);

  const loadStoredTheme = async () => {
    try {
      const stored = await AsyncStorage.getItem('jarvis-theme-mode');
      if (stored && ['light', 'dark', 'system'].includes(stored)) {
        setThemeModeState(stored as ThemeMode);
      }
    } catch (error) {
      console.warn('Failed to load stored theme:', error);
    }
  };

  const setThemeMode = async (mode: ThemeMode) => {
    try {
      setThemeModeState(mode);
      await AsyncStorage.setItem('jarvis-theme-mode', mode);
    } catch (error) {
      console.warn('Failed to save theme mode:', error);
    }
  };

  const isDarkMode = themeMode === 'dark' || (themeMode === 'system' && systemColorScheme === 'dark');
  const theme = isDarkMode ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider 
      value={{
        themeMode,
        isDarkMode,
        setThemeMode,
        theme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};
