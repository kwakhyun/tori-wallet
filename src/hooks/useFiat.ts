/**
 * 법정화폐 표시 훅
 *
 * const { formatFiat, mask, hideBalances } = useFiat();
 * formatFiat(usdValue)   // 표시 통화로 변환, 조회 실패(null)는 '—'
 * mask('1.2345 ETH')     // 잔액 숨기기 모드면 '••••'
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { usePreferencesStore, FiatCurrency } from '@/store/preferencesStore';
import {
  fiatService,
  formatFiatValue,
  FormatFiatOptions,
  HIDDEN_VALUE,
} from '@/services/fiatService';

export interface UseFiatResult {
  currency: FiatCurrency;
  hideBalances: boolean;
  /** 환율을 몰라 USD로 대체 표시 중인지 */
  usingFallback: boolean;
  formatFiat: (
    usdValue: number | null | undefined,
    options?: FormatFiatOptions & { ignoreHidden?: boolean },
  ) => string;
  mask: (text: string) => string;
  toggleHideBalances: () => void;
}

export function useFiat(): UseFiatResult {
  const { currency, hideBalances, toggleHideBalances } = usePreferencesStore(
    useShallow(state => ({
      currency: state.currency,
      hideBalances: state.hideBalances,
      toggleHideBalances: state.toggleHideBalances,
    })),
  );

  const rate = useSyncExternalStore(
    useCallback(listener => fiatService.subscribe(listener), []),
    () => fiatService.getRate(currency),
    () => fiatService.getRate(currency),
  );

  useEffect(() => {
    if (currency !== 'USD') fiatService.refresh();
  }, [currency]);

  const formatFiat = useCallback<UseFiatResult['formatFiat']>(
    (usdValue, options = {}) => {
      if (hideBalances && !options.ignoreHidden) return HIDDEN_VALUE;
      return formatFiatValue(usdValue, currency, rate, options);
    },
    [currency, rate, hideBalances],
  );

  const mask = useCallback(
    (text: string) => (hideBalances ? HIDDEN_VALUE : text),
    [hideBalances],
  );

  return {
    currency,
    hideBalances,
    usingFallback: currency !== 'USD' && rate === null,
    formatFiat,
    mask,
    toggleHideBalances,
  };
}

export default useFiat;
