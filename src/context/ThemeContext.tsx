import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'react-native';

export type ThemeColors = {
  background: string;
  surface: string;
  text: string;
  textDim: string;
  border: string;
  danger: string;
};

const LightColors: ThemeColors = {
  background: '#f0f4f8',
  surface: '#ffffff',
  text: '#0f172a',
  textDim: '#64748b',
  border: '#cbd5e1',
  danger: '#dc2626',
};

const DarkColors: ThemeColors = {
  background: '#0f172a',
  surface: '#1e293b',
  text: '#f8fafc',
  textDim: '#94a3b8',
  border: '#334155',
  danger: '#ef4444',
};

type FontSize = 'small' | 'normal' | 'large';
export const FONT_SCALES: Record<FontSize, number> = { small: 0.85, normal: 1.0, large: 1.15 };

type ThemeContextType = {
  primaryColor: string;
  setPrimaryColor: (color: string) => void;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  isCalendarView: boolean;
  toggleCalendarView: () => void;
  autoApproveTournament: boolean;
  toggleAutoApproveTournament: () => void;
  openMatchCreation: boolean;
  toggleOpenMatchCreation: () => void;
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
  fontScale: number;
  colors: ThemeColors;
};

const DEFAULT_COLOR = '#0ea5e9';

export const ThemeContext = createContext<ThemeContextType>({
  primaryColor: DEFAULT_COLOR,
  setPrimaryColor: () => {},
  isDarkMode: true,
  toggleDarkMode: () => {},
  isCalendarView: false,
  toggleCalendarView: () => {},
  autoApproveTournament: false,
  toggleAutoApproveTournament: () => {},
  openMatchCreation: false,
  toggleOpenMatchCreation: () => {},
  fontSize: 'normal',
  setFontSize: () => {},
  fontScale: 1.0,
  colors: DarkColors,
});

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [primaryColor, setPrimaryColorState] = useState<string>(DEFAULT_COLOR);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [isCalendarView, setIsCalendarView] = useState<boolean>(false);
  const [autoApproveTournament, setAutoApproveTournament] = useState<boolean>(false);
  const [openMatchCreation, setOpenMatchCreation] = useState<boolean>(false);
  const [fontSize, setFontSizeState] = useState<FontSize>('normal');

  useEffect(() => {
    const loadTheme = async () => {
      try {
         const savedColor = await AsyncStorage.getItem('themeColor');
         if (savedColor) setPrimaryColorState(savedColor);

         const savedMode = await AsyncStorage.getItem('themeMode');
         if (savedMode !== null) {
           setIsDarkMode(savedMode === 'dark');
         }

         const savedCal = await AsyncStorage.getItem('calendarView');
         if (savedCal !== null) setIsCalendarView(savedCal === 'true');

         const savedAutoApprove = await AsyncStorage.getItem('autoApproveTournament');
         if (savedAutoApprove !== null) setAutoApproveTournament(savedAutoApprove === 'true');

         const savedOpen = await AsyncStorage.getItem('openMatchCreation');
         if (savedOpen !== null) setOpenMatchCreation(savedOpen === 'true');

         const savedFont = await AsyncStorage.getItem('fontSize') as FontSize | null;
         if (savedFont) setFontSizeState(savedFont);
      } catch (e) {}
    };
    loadTheme();
  }, []);

  const setPrimaryColor = async (color: string) => {
    setPrimaryColorState(color);
    try {
      await AsyncStorage.setItem('themeColor', color);
    } catch (e) {}
  };

  const toggleDarkMode = async () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    try {
      await AsyncStorage.setItem('themeMode', newMode ? 'dark' : 'light');
    } catch (e) {}
  };

  const toggleCalendarView = async () => {
    const newVal = !isCalendarView;
    setIsCalendarView(newVal);
    try {
      await AsyncStorage.setItem('calendarView', newVal ? 'true' : 'false');
    } catch (e) {}
  };

  const toggleAutoApproveTournament = async () => {
    const newVal = !autoApproveTournament;
    setAutoApproveTournament(newVal);
    try { await AsyncStorage.setItem('autoApproveTournament', newVal ? 'true' : 'false'); } catch (e) {}
  };

  const toggleOpenMatchCreation = async () => {
    const newVal = !openMatchCreation;
    setOpenMatchCreation(newVal);
    try { await AsyncStorage.setItem('openMatchCreation', newVal ? 'true' : 'false'); } catch (e) {}
  };

  const setFontSize = async (size: FontSize) => {
    setFontSizeState(size);
    try { await AsyncStorage.setItem('fontSize', size); } catch (e) {}
  };

  const currentColors = isDarkMode ? DarkColors : LightColors;
  const fontScale = FONT_SCALES[fontSize];

  return (
    <ThemeContext.Provider value={{ primaryColor, setPrimaryColor, isDarkMode, toggleDarkMode, isCalendarView, toggleCalendarView, autoApproveTournament, toggleAutoApproveTournament, openMatchCreation, toggleOpenMatchCreation, fontSize, setFontSize, fontScale, colors: currentColors }}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} backgroundColor={currentColors.background} />
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
