/**
 * 사용자 설정 훅 테스트
 */

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// 서비스 모킹
jest.mock('../../../src/realm/services', () => ({
  userPreferencesService: {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue(undefined),
    getOrDefault: jest.fn().mockResolvedValue('USD'),
    loadAll: jest.fn().mockResolvedValue(undefined),
  },
  PREFERENCE_KEYS: {
    CURRENCY: 'display.currency',
    LANGUAGE: 'display.language',
    THEME: 'display.theme',
    HIDE_BALANCE: 'display.hideBalance',
    BIOMETRIC_ENABLED: 'security.biometricEnabled',
    AUTO_LOCK_TIMEOUT: 'security.autoLockTimeout',
    DEFAULT_CHAIN_ID: 'network.defaultChainId',
    GAS_PREFERENCE: 'network.gasPreference',
    DEV_SHOW_TESTNET: 'dev.showTestnet',
  },
}));

import {
  usePreference,
  useCurrency,
  useThemePreference,
  useBiometricPreference,
  useHideBalance,
  useDefaultChain,
  useTestnetPreference,
} from '../../../src/realm/hooks/usePreferences';
import {
  userPreferencesService,
  PREFERENCE_KEYS,
} from '../../../src/realm/services';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('usePreferences hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
  });

  describe('usePreference', () => {
    it('should return default value initially', async () => {
      (userPreferencesService.getOrDefault as jest.Mock).mockResolvedValue(
        'default',
      );

      const { result } = renderHook(
        () => usePreference(PREFERENCE_KEYS.CURRENCY, 'default'),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.value).toBe('default');
    });

    it('should update value when updateValue is called', async () => {
      (userPreferencesService.getOrDefault as jest.Mock).mockResolvedValue(
        'USD',
      );

      const { result } = renderHook(
        () => usePreference(PREFERENCE_KEYS.CURRENCY, 'USD'),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.updateValue('EUR');
      });

      expect(userPreferencesService.set).toHaveBeenCalledWith(
        PREFERENCE_KEYS.CURRENCY,
        'EUR',
      );
    });
  });

  describe('useCurrency', () => {
    it('should return currency value', async () => {
      (userPreferencesService.getOrDefault as jest.Mock).mockResolvedValue(
        'USD',
      );

      const { result } = renderHook(() => useCurrency(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.currency).toBe('USD');
      expect(typeof result.current.setCurrency).toBe('function');
    });
  });

  describe('useThemePreference', () => {
    it('should return theme value', async () => {
      (userPreferencesService.getOrDefault as jest.Mock).mockResolvedValue(
        'dark',
      );

      const { result } = renderHook(() => useThemePreference(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.theme).toBe('dark');
      expect(typeof result.current.setTheme).toBe('function');
    });
  });

  describe('useBiometricPreference', () => {
    it('should return biometric enabled value', async () => {
      (userPreferencesService.getOrDefault as jest.Mock).mockResolvedValue(
        false,
      );

      const { result } = renderHook(() => useBiometricPreference(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isEnabled).toBe(false);
      expect(typeof result.current.setEnabled).toBe('function');
    });
  });

  describe('useHideBalance', () => {
    it('should return hide balance value', async () => {
      (userPreferencesService.getOrDefault as jest.Mock).mockResolvedValue(
        false,
      );

      const { result } = renderHook(() => useHideBalance(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isHidden).toBe(false);
      expect(typeof result.current.toggle).toBe('function');
    });

    it('should toggle hide balance', async () => {
      (userPreferencesService.getOrDefault as jest.Mock).mockResolvedValue(
        false,
      );

      const { result } = renderHook(() => useHideBalance(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.toggle();
      });

      expect(userPreferencesService.set).toHaveBeenCalled();
    });
  });

  describe('useDefaultChain', () => {
    it('should return default chain id', async () => {
      (userPreferencesService.getOrDefault as jest.Mock).mockResolvedValue(1);

      const { result } = renderHook(() => useDefaultChain(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.chainId).toBe(1);
      expect(typeof result.current.setChainId).toBe('function');
    });
  });

  describe('useTestnetPreference', () => {
    it('should return testnet visibility value', async () => {
      (userPreferencesService.getOrDefault as jest.Mock).mockResolvedValue(
        false,
      );

      const { result } = renderHook(() => useTestnetPreference(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.showTestnet).toBe(false);
      expect(typeof result.current.setShowTestnet).toBe('function');
    });
  });
});
