/**
 * Tori Wallet - Theme Store
 * 라이트/다크 모드 테마 상태 관리
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance, ColorSchemeName } from 'react-native';
import { ThemeMode, darkTheme, lightTheme, Theme } from '@/styles/theme';

interface ThemeState {
  // 사용자가 선택한 테마 모드
  themeMode: ThemeMode;

  // 실제 적용되는 테마 (system일 경우 시스템 설정에 따라 결정)
  activeTheme: Theme;

  // 현재 다크 모드인지 여부
  isDarkMode: boolean;

  // Actions
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  updateSystemTheme: (colorScheme: ColorSchemeName) => void;
}

// 시스템 테마 가져오기
const getSystemTheme = (): Theme => {
  const colorScheme = Appearance.getColorScheme();
  return colorScheme === 'light' ? lightTheme : darkTheme;
};

// 테마 모드에 따른 실제 테마 결정
const resolveTheme = (
  mode: ThemeMode,
  systemColorScheme?: ColorSchemeName,
): Theme => {
  switch (mode) {
    case 'light':
      return lightTheme;
    case 'dark':
      return darkTheme;
    case 'system':
    default:
      if (systemColorScheme) {
        return systemColorScheme === 'light' ? lightTheme : darkTheme;
      }
      return getSystemTheme();
  }
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      themeMode: 'system',
      activeTheme: getSystemTheme(),
      isDarkMode: getSystemTheme().isDark,

      setThemeMode: (mode: ThemeMode) => {
        const activeTheme = resolveTheme(mode);
        set({
          themeMode: mode,
          activeTheme,
          isDarkMode: activeTheme.isDark,
        });
      },

      toggleTheme: () => {
        const currentMode = get().themeMode;
        const newMode: ThemeMode = currentMode === 'dark' ? 'light' : 'dark';
        const activeTheme = resolveTheme(newMode);
        set({
          themeMode: newMode,
          activeTheme,
          isDarkMode: activeTheme.isDark,
        });
      },

      updateSystemTheme: (colorScheme: ColorSchemeName) => {
        const { themeMode } = get();
        if (themeMode === 'system') {
          const activeTheme = resolveTheme('system', colorScheme);
          set({
            activeTheme,
            isDarkMode: activeTheme.isDark,
          });
        }
      },
    }),
    {
      name: 'tori-theme-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: state => ({
        themeMode: state.themeMode,
      }),
      onRehydrateStorage: () => state => {
        if (state) {
          // 저장된 테마 모드에 따라 activeTheme 재설정
          const activeTheme = resolveTheme(state.themeMode);
          state.activeTheme = activeTheme;
          state.isDarkMode = activeTheme.isDark;
        }
      },
    },
  ),
);

// 테마 모드 옵션 (설정 화면에서 사용)
export const themeModeOptions = [
  {
    value: 'system' as const,
    label: '시스템 설정',
    icon: 'phone-portrait-outline',
  },
  { value: 'light' as const, label: '라이트 모드', icon: 'sunny-outline' },
  { value: 'dark' as const, label: '다크 모드', icon: 'moon-outline' },
];
