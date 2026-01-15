/**
 * Tori Wallet - Theme Store
 * 라이트/다크 모드 테마 상태 관리
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance, ColorSchemeName } from 'react-native';
import { ThemeMode, darkTheme, lightTheme, Theme } from '@/styles/theme';

const THEME_STORAGE_KEY = 'tori-theme-mode';

interface ThemeState {
  // 사용자가 선택한 테마 모드
  themeMode: ThemeMode;

  // 실제 적용되는 테마 (system일 경우 시스템 설정에 따라 결정)
  activeTheme: Theme;

  // 현재 다크 모드인지 여부
  isDarkMode: boolean;

  // 초기화 완료 여부
  isHydrated: boolean;

  // Actions
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  updateSystemTheme: (colorScheme: ColorSchemeName) => void;
  hydrate: () => Promise<void>;
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

export const useThemeStore = create<ThemeState>()((set, get) => ({
  themeMode: 'system',
  activeTheme: getSystemTheme(),
  isDarkMode: getSystemTheme().isDark,
  isHydrated: false,

  setThemeMode: (mode: ThemeMode) => {
    const activeTheme = resolveTheme(mode);
    console.log('🎨 setThemeMode:', mode, 'isDark:', activeTheme.isDark);

    // 상태 업데이트
    set({
      themeMode: mode,
      activeTheme,
      isDarkMode: activeTheme.isDark,
    });

    // 디버깅: set 호출 후 상태 확인
    const newState = get();
    console.log(
      '🎨 After set - state:',
      newState.themeMode,
      newState.isDarkMode,
    );
    console.log('🎨 Listeners count:', useThemeStore.getState() === newState);

    // AsyncStorage에 저장 (비동기, 에러 무시)
    AsyncStorage.setItem(THEME_STORAGE_KEY, mode).catch(err => {
      console.warn('Failed to save theme mode:', err);
    });
  },

  toggleTheme: () => {
    const currentMode = get().themeMode;
    const newMode: ThemeMode = currentMode === 'dark' ? 'light' : 'dark';
    get().setThemeMode(newMode);
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

  hydrate: async () => {
    try {
      const savedMode = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      if (savedMode && ['light', 'dark', 'system'].includes(savedMode)) {
        const mode = savedMode as ThemeMode;
        const activeTheme = resolveTheme(mode);
        set({
          themeMode: mode,
          activeTheme,
          isDarkMode: activeTheme.isDark,
          isHydrated: true,
        });
      } else {
        set({ isHydrated: true });
      }
    } catch (err) {
      console.warn('Failed to load theme mode:', err);
      set({ isHydrated: true });
    }
  },
}));

// 앱 시작 시 테마 로드
useThemeStore.getState().hydrate();

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
