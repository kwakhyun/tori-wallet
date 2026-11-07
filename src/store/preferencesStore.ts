/**
 * 표시 환경설정 스토어 (통화, 잔액 숨기기)
 *
 * 여러 화면이 동시에 구독해야 하는 값이라 동기적으로 읽히는 zustand persist를 사용한다.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type FiatCurrency = 'USD' | 'KRW';

export const FIAT_CURRENCY_OPTIONS: { value: FiatCurrency; label: string }[] = [
  { value: 'KRW', label: '대한민국 원 (₩)' },
  { value: 'USD', label: '미국 달러 ($)' },
];

interface PreferencesState {
  currency: FiatCurrency;
  hideBalances: boolean;
  setCurrency: (currency: FiatCurrency) => void;
  setHideBalances: (hide: boolean) => void;
  toggleHideBalances: () => void;
  resetPreferences: () => void;
}

const initialState = {
  currency: 'KRW' as FiatCurrency,
  hideBalances: false,
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    set => ({
      ...initialState,
      setCurrency: currency => set({ currency }),
      setHideBalances: hideBalances => set({ hideBalances }),
      toggleHideBalances: () =>
        set(state => ({ hideBalances: !state.hideBalances })),
      resetPreferences: () => set(initialState),
    }),
    {
      name: 'tori-display-preferences',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: state => ({
        currency: state.currency,
        hideBalances: state.hideBalances,
      }),
    },
  ),
);
