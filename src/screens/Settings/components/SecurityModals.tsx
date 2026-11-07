/**
 * 보안 화면 모달 (자동 잠금 시간, PIN 없이 허용할 거래 한도)
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Input } from '@/components/common/Input';
import { Button } from '@/components/common/Button';
import { useFiat } from '@/hooks/useFiat';
import {
  AUTO_LOCK_LABELS,
  AUTO_LOCK_OPTIONS,
  formatTransactionLimitUsd,
  isTransactionLimitWeakening,
  parseTransactionLimitInput,
  type AutoLockOption,
} from '@/store/securityStore';
import { PinPrompt } from './PinPrompt';
import {
  ButtonStack,
  HintText,
  InfoBox,
  InfoText,
  OptionRow,
  SheetModal,
} from './SettingsUI';

interface AutoLockModalProps {
  visible: boolean;
  value: AutoLockOption;
  onSelect: (option: AutoLockOption) => void;
  onClose: () => void;
}

export function AutoLockModal({
  visible,
  value,
  onSelect,
  onClose,
}: AutoLockModalProps): React.JSX.Element {
  return (
    <SheetModal
      visible={visible}
      title="자동 잠금 시간"
      onClose={onClose}
      testID="auto-lock-modal"
    >
      {(Object.keys(AUTO_LOCK_OPTIONS) as AutoLockOption[]).map(option => (
        <OptionRow
          key={option}
          label={AUTO_LOCK_LABELS[option]}
          selected={value === option}
          onPress={() => onSelect(option)}
          testID={`auto-lock-option-${option}`}
        />
      ))}
      <HintText>
        앱을 사용하지 않거나 다른 앱으로 전환한 뒤 이 시간이 지나면 지갑이
        잠깁니다. 짧을수록 안전합니다.
      </HintText>
    </SheetModal>
  );
}

/** USD 한도를 선택한 표시 통화로 환산한 보조 문구 (USD거나 환율을 모르면 null) */
export function useLimitInSelectedCurrency() {
  const { currency, usingFallback, formatFiat } = useFiat();
  return useCallback(
    (usd: number | null): string | null => {
      if (usd === null || currency === 'USD' || usingFallback) return null;
      return `≈ ${formatFiat(usd, { ignoreHidden: true })}`;
    },
    [currency, formatFiat, usingFallback],
  );
}

interface TransactionLimitModalProps {
  visible: boolean;
  currentLimit: number | null;
  onSave: (limit: number | null) => void;
  onClose: () => void;
}

export function TransactionLimitModal({
  visible,
  currentLimit,
  onSave,
  onClose,
}: TransactionLimitModalProps): React.JSX.Element {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pendingLimit, setPendingLimit] = useState<number | null | undefined>(
    undefined,
  );
  const toSelectedCurrency = useLimitInSelectedCurrency();

  useEffect(() => {
    if (!visible) return;
    setInput(currentLimit === null ? '' : String(currentLimit));
    setError(undefined);
    setPendingLimit(undefined);
  }, [visible, currentLimit]);

  const parsed = parseTransactionLimitInput(input);
  const preview = parsed.ok ? toSelectedCurrency(parsed.value) : null;

  const handleSave = useCallback(() => {
    const result = parseTransactionLimitInput(input);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // 한도를 없애거나 올리면 PIN을 다시 확인한다.
    if (isTransactionLimitWeakening(currentLimit, result.value)) {
      setPendingLimit(result.value);
      return;
    }
    onSave(result.value);
  }, [currentLimit, input, onSave]);

  const handleVerified = useCallback(() => {
    if (pendingLimit === undefined) return;
    onSave(pendingLimit);
  }, [onSave, pendingLimit]);

  return (
    <SheetModal
      visible={visible}
      title="PIN 없이 허용할 한도"
      onClose={onClose}
      testID="transaction-limit-modal"
    >
      {pendingLimit !== undefined ? (
        <PinPrompt
          description={`한도를 ${formatTransactionLimitUsd(
            pendingLimit,
          )}(으)로 바꾸면 PIN 없이 보낼 수 있는 범위가 넓어집니다. 계속하려면 PIN을 입력하세요.`}
          onVerified={handleVerified}
          testIDPrefix="transaction-limit-pin"
        />
      ) : (
        <>
          <InfoBox>
            <InfoText>
              {
                '"PIN 항상 요구"를 끈 경우에만 적용됩니다.\n• 거래 금액(USD 환산)이 한도 이하이면 PIN 없이 진행합니다.\n• 한도를 넘거나 금액을 확인할 수 없는 거래는 PIN이 필요합니다.\n• 0으로 두면 금액이 있는 모든 거래에 PIN이 필요합니다.\n• 비워 두면 한도 없이 모든 거래가 PIN 없이 진행됩니다.'
              }
            </InfoText>
          </InfoBox>
          <Input
            label="한도 (USD)"
            value={input}
            onChangeText={text => {
              setInput(text);
              setError(undefined);
            }}
            placeholder="비워 두면 한도 없음"
            keyboardType="decimal-pad"
            error={error}
            helper={
              preview ??
              `현재: ${formatTransactionLimitUsd(currentLimit)}${
                toSelectedCurrency(currentLimit)
                  ? ` (${toSelectedCurrency(currentLimit)})`
                  : ''
              }`
            }
            testID="transaction-limit-input"
          />
          <ButtonStack>
            <Button
              title="저장"
              onPress={handleSave}
              fullWidth
              testID="transaction-limit-save"
            />
          </ButtonStack>
        </>
      )}
    </SheetModal>
  );
}
