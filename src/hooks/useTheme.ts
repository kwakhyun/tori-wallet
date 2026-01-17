/**
 * 테마 접근 및 변경 훅
 */

import { useCallback, useEffect } from 'react';
import { Appearance } from 'react-native';
import { useTheme as useStyledTheme } from 'styled-components/native';
import { useThemeStore, themeModeOptions } from '@/store/themeStore';
import { Theme, ThemeMode, palette } from '@/styles/theme';

interface UseThemeReturn {
  // 현재 테마 객체
  theme: Theme;

  // 현재 다크 모드 여부
  isDarkMode: boolean;

  // 현재 테마 모드 (light, dark, system)
  themeMode: ThemeMode;

  // 테마 모드 변경
  setThemeMode: (mode: ThemeMode) => void;

  // 라이트/다크 토글
  toggleTheme: () => void;

  // 색상 팔레트 직접 접근
  palette: typeof palette;

  // 테마 모드 옵션 (설정 UI용)
  themeModeOptions: typeof themeModeOptions;
}

export function useTheme(): UseThemeReturn {
  const styledTheme = useStyledTheme() as Theme;
  const {
    themeMode,
    isDarkMode,
    setThemeMode,
    toggleTheme,
    updateSystemTheme,
  } = useThemeStore();

  // 시스템 테마 변경 감지
  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      updateSystemTheme(colorScheme);
    });

    return () => {
      subscription.remove();
    };
  }, [updateSystemTheme]);

  const handleSetThemeMode = useCallback(
    (mode: ThemeMode) => {
      setThemeMode(mode);
    },
    [setThemeMode],
  );

  return {
    theme: styledTheme,
    isDarkMode,
    themeMode,
    setThemeMode: handleSetThemeMode,
    toggleTheme,
    palette,
    themeModeOptions,
  };
}

// 색상 유틸리티 함수들
export const themeUtils = {
  /**
   * 투명도가 적용된 색상 반환
   */
  withOpacity: (color: string, opacity: number): string => {
    // Hex → RGBA 변환
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  },

  /**
   * 색상 밝기 조정
   */
  adjustBrightness: (color: string, amount: number): string => {
    const hex = color.replace('#', '');
    const r = Math.max(
      0,
      Math.min(255, parseInt(hex.substring(0, 2), 16) + amount),
    );
    const g = Math.max(
      0,
      Math.min(255, parseInt(hex.substring(2, 4), 16) + amount),
    );
    const b = Math.max(
      0,
      Math.min(255, parseInt(hex.substring(4, 6), 16) + amount),
    );
    return `#${r.toString(16).padStart(2, '0')}${g
      .toString(16)
      .padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  },

  /**
   * 그라디언트 CSS 문자열 생성
   */
  linearGradient: (colors: [string, string], angle: number = 135): string => {
    return `linear-gradient(${angle}deg, ${colors[0]}, ${colors[1]})`;
  },
};

export default useTheme;
