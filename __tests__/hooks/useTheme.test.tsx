/**
 * 테마 훅 테스트
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { ThemeProvider } from 'styled-components/native';
import { darkTheme, lightTheme } from '../../src/styles/theme';
import { useThemeStore } from '../../src/store/themeStore';
import { useTheme, themeUtils } from '../../src/hooks/useTheme';

// AsyncStorage 모킹
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
}));

// 테스트 전에 리셋
beforeEach(() => {
  jest.clearAllMocks();
  // themeStore 리셋 - isDarkMode도 함께 설정
  useThemeStore.setState({ themeMode: 'dark', isDarkMode: true });
});

describe('useTheme Hook', () => {
  const createWrapper = (theme: typeof darkTheme) => {
    return function Wrapper({ children }: { children: React.ReactNode }) {
      return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
    };
  };

  describe('useTheme hook return values', () => {
    it('should return theme object', () => {
      const { result } = renderHook(() => useTheme(), {
        wrapper: createWrapper(darkTheme),
      });

      expect(result.current.theme).toBeDefined();
      expect(result.current.theme.colors).toBeDefined();
    });

    it('should return isDarkMode', () => {
      const { result } = renderHook(() => useTheme(), {
        wrapper: createWrapper(darkTheme),
      });

      expect(result.current.isDarkMode).toBe(true);
    });

    it('should return themeMode', () => {
      const { result } = renderHook(() => useTheme(), {
        wrapper: createWrapper(darkTheme),
      });

      expect(result.current.themeMode).toBe('dark');
    });

    it('should return toggleTheme function', () => {
      const { result } = renderHook(() => useTheme(), {
        wrapper: createWrapper(darkTheme),
      });

      expect(typeof result.current.toggleTheme).toBe('function');
    });

    it('should return setThemeMode function', () => {
      const { result } = renderHook(() => useTheme(), {
        wrapper: createWrapper(darkTheme),
      });

      expect(typeof result.current.setThemeMode).toBe('function');
    });

    it('should return palette', () => {
      const { result } = renderHook(() => useTheme(), {
        wrapper: createWrapper(darkTheme),
      });

      expect(result.current.palette).toBeDefined();
    });

    it('should return themeModeOptions', () => {
      const { result } = renderHook(() => useTheme(), {
        wrapper: createWrapper(darkTheme),
      });

      expect(result.current.themeModeOptions).toBeDefined();
      expect(Array.isArray(result.current.themeModeOptions)).toBe(true);
    });
  });

  describe('useTheme hook actions', () => {
    it('should toggle theme', () => {
      const { result } = renderHook(() => useTheme(), {
        wrapper: createWrapper(darkTheme),
      });

      expect(result.current.isDarkMode).toBe(true);

      act(() => {
        result.current.toggleTheme();
      });

      expect(result.current.isDarkMode).toBe(false);
    });

    it('should set theme mode to light', () => {
      const { result } = renderHook(() => useTheme(), {
        wrapper: createWrapper(darkTheme),
      });

      act(() => {
        result.current.setThemeMode('light');
      });

      expect(result.current.themeMode).toBe('light');
      expect(result.current.isDarkMode).toBe(false);
    });

    it('should set theme mode to dark', () => {
      useThemeStore.setState({ themeMode: 'light', isDarkMode: false });

      const { result } = renderHook(() => useTheme(), {
        wrapper: createWrapper(lightTheme),
      });

      act(() => {
        result.current.setThemeMode('dark');
      });

      expect(result.current.themeMode).toBe('dark');
      expect(result.current.isDarkMode).toBe(true);
    });

    it('should set theme mode to system', () => {
      const { result } = renderHook(() => useTheme(), {
        wrapper: createWrapper(darkTheme),
      });

      act(() => {
        result.current.setThemeMode('system');
      });

      expect(result.current.themeMode).toBe('system');
    });
  });

  describe('theme store access', () => {
    it('should return current theme from store', () => {
      const { result } = renderHook(() => useThemeStore(), {
        wrapper: createWrapper(darkTheme),
      });

      expect(result.current.themeMode).toBe('dark');
      expect(result.current.isDarkMode).toBe(true);
    });

    it('should return light mode when set', () => {
      useThemeStore.setState({ themeMode: 'light', isDarkMode: false });

      const { result } = renderHook(() => useThemeStore(), {
        wrapper: createWrapper(lightTheme),
      });

      expect(result.current.themeMode).toBe('light');
      expect(result.current.isDarkMode).toBe(false);
    });
  });

  describe('theme colors', () => {
    it('should have correct dark theme colors', () => {
      expect(darkTheme.colors.background).toBeDefined();
      expect(darkTheme.colors.primary).toBeDefined();
      expect(darkTheme.colors.textPrimary).toBeDefined();
    });

    it('should have correct light theme colors', () => {
      expect(lightTheme.colors.background).toBeDefined();
      expect(lightTheme.colors.primary).toBeDefined();
      expect(lightTheme.colors.textPrimary).toBeDefined();
    });

    it('should have different background colors for dark and light', () => {
      expect(darkTheme.colors.background).not.toBe(
        lightTheme.colors.background,
      );
    });
  });
});

describe('themeUtils', () => {
  describe('withOpacity', () => {
    it('should convert hex color to rgba with opacity', () => {
      const result = themeUtils.withOpacity('#FF0000', 0.5);
      expect(result).toBe('rgba(255, 0, 0, 0.5)');
    });

    it('should handle black color', () => {
      const result = themeUtils.withOpacity('#000000', 0.3);
      expect(result).toBe('rgba(0, 0, 0, 0.3)');
    });

    it('should handle white color', () => {
      const result = themeUtils.withOpacity('#FFFFFF', 1);
      expect(result).toBe('rgba(255, 255, 255, 1)');
    });

    it('should handle mixed colors', () => {
      const result = themeUtils.withOpacity('#1E90FF', 0.8);
      expect(result).toBe('rgba(30, 144, 255, 0.8)');
    });

    it('should handle zero opacity', () => {
      const result = themeUtils.withOpacity('#FF0000', 0);
      expect(result).toBe('rgba(255, 0, 0, 0)');
    });
  });

  describe('adjustBrightness', () => {
    it('should increase brightness', () => {
      const result = themeUtils.adjustBrightness('#808080', 32);
      expect(result.toLowerCase()).toBe('#a0a0a0');
    });

    it('should decrease brightness', () => {
      const result = themeUtils.adjustBrightness('#808080', -32);
      expect(result.toLowerCase()).toBe('#606060');
    });

    it('should clamp to max 255', () => {
      const result = themeUtils.adjustBrightness('#FFFFFF', 50);
      expect(result.toLowerCase()).toBe('#ffffff');
    });

    it('should clamp to min 0', () => {
      const result = themeUtils.adjustBrightness('#000000', -50);
      expect(result.toLowerCase()).toBe('#000000');
    });

    it('should handle each channel independently', () => {
      const result = themeUtils.adjustBrightness('#FF8000', 16);
      expect(result.toLowerCase()).toBe('#ff9010');
    });

    it('should handle small positive adjustments', () => {
      const result = themeUtils.adjustBrightness('#101010', 5);
      expect(result.toLowerCase()).toBe('#151515');
    });
  });

  describe('linearGradient', () => {
    it('should create linear gradient with default angle', () => {
      const result = themeUtils.linearGradient(['#FF0000', '#0000FF']);
      expect(result).toBe('linear-gradient(135deg, #FF0000, #0000FF)');
    });

    it('should create linear gradient with custom angle', () => {
      const result = themeUtils.linearGradient(['#FF0000', '#0000FF'], 90);
      expect(result).toBe('linear-gradient(90deg, #FF0000, #0000FF)');
    });

    it('should handle 0 degree angle', () => {
      const result = themeUtils.linearGradient(['#FFFFFF', '#000000'], 0);
      expect(result).toBe('linear-gradient(0deg, #FFFFFF, #000000)');
    });

    it('should handle 180 degree angle', () => {
      const result = themeUtils.linearGradient(['#123456', '#654321'], 180);
      expect(result).toBe('linear-gradient(180deg, #123456, #654321)');
    });

    it('should handle 45 degree angle', () => {
      const result = themeUtils.linearGradient(['#AABBCC', '#CCBBAA'], 45);
      expect(result).toBe('linear-gradient(45deg, #AABBCC, #CCBBAA)');
    });
  });
});
