/**
 * 표시 설정 선택 모달 (테마, 표시 통화)
 */

import React from 'react';
import { themeModeOptions } from '@/store/themeStore';
import {
  FIAT_CURRENCY_OPTIONS,
  type FiatCurrency,
} from '@/store/preferencesStore';
import type { ThemeMode } from '@/styles/theme';
import { HintText, OptionRow, SheetModal } from './SettingsUI';

export const THEME_ICON: Record<ThemeMode, string> = {
  system: '📱',
  light: '☀️',
  dark: '🌙',
};

const THEME_DESCRIPTION: Record<ThemeMode, string> = {
  system: '기기 설정에 따라 자동 변경',
  light: '밝은 배경의 라이트 모드',
  dark: '어두운 배경의 다크 모드',
};

export function themeLabelOf(mode: ThemeMode): string {
  return (
    themeModeOptions.find(option => option.value === mode)?.label ??
    '시스템 설정'
  );
}

interface ThemeModalProps {
  visible: boolean;
  value: ThemeMode;
  onSelect: (mode: ThemeMode) => void;
  onClose: () => void;
}

export function ThemeModal({
  visible,
  value,
  onSelect,
  onClose,
}: ThemeModalProps): React.JSX.Element {
  return (
    <SheetModal
      visible={visible}
      title="테마"
      onClose={onClose}
      testID="theme-modal"
    >
      {themeModeOptions.map(option => (
        <OptionRow
          key={option.value}
          icon={THEME_ICON[option.value]}
          label={option.label}
          description={THEME_DESCRIPTION[option.value]}
          selected={value === option.value}
          onPress={() => onSelect(option.value)}
          testID={`theme-option-${option.value}`}
        />
      ))}
    </SheetModal>
  );
}

export function currencyLabelOf(currency: FiatCurrency): string {
  return (
    FIAT_CURRENCY_OPTIONS.find(option => option.value === currency)?.label ??
    currency
  );
}

interface CurrencyModalProps {
  visible: boolean;
  value: FiatCurrency;
  onSelect: (currency: FiatCurrency) => void;
  onClose: () => void;
}

export function CurrencyModal({
  visible,
  value,
  onSelect,
  onClose,
}: CurrencyModalProps): React.JSX.Element {
  return (
    <SheetModal
      visible={visible}
      title="표시 통화"
      onClose={onClose}
      testID="currency-modal"
    >
      {FIAT_CURRENCY_OPTIONS.map(option => (
        <OptionRow
          key={option.value}
          label={option.label}
          selected={value === option.value}
          onPress={() => onSelect(option.value)}
          testID={`currency-option-${option.value}`}
        />
      ))}
      <HintText>
        자산 가치와 시세를 선택한 통화로 표시합니다. 환율을 불러오지 못하면 미국
        달러로 표시됩니다.
      </HintText>
    </SheetModal>
  );
}
