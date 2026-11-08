/**
 * PIN 변경: 현재 PIN 확인 → 새 PIN → 새 PIN 확인 → 재암호화 저장
 *
 * 현재 PIN 확인은 공용 실패 제한을 거친다. 확인 후 보관한 니모닉은 저장이 끝나거나
 * 창이 닫히거나 지갑이 잠기면 즉시 버린다.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import styled, { useTheme } from 'styled-components/native';
import { PinPad } from '@/components/common/PinPad';
import { walletService } from '@/services/walletService';
import { isWeakPin, WEAK_PIN_MESSAGE } from '@/services/pinAttemptService';
import { showToast } from '@/store/toastStore';
import { errorFeedback } from '@/utils/haptics';
import { createLogger } from '@/utils/logger';
import { PinPrompt } from './PinPrompt';
import { ErrorMessage, SheetModal } from './SettingsUI';
import { PIN_LENGTH } from '../hooks/usePinVerification';
import { useSecretAutoClear } from '../hooks/useSecretAutoClear';

const logger = createLogger('ChangePin');

type Step = 'verify' | 'new' | 'confirm' | 'saving';

const STEP_LABEL: Record<Exclude<Step, 'saving'>, string> = {
  verify: '현재 PIN을 입력하세요.',
  new: '새 PIN 6자리를 입력하세요.',
  confirm: '새 PIN을 한 번 더 입력하세요.',
};

interface ChangePinModalProps {
  visible: boolean;
  onClose: () => void;
}

export function ChangePinModal({
  visible,
  onClose,
}: ChangePinModalProps): React.JSX.Element {
  return (
    <SheetModal
      visible={visible}
      title="PIN 변경"
      onClose={onClose}
      testID="change-pin-modal"
      scrollable={false}
    >
      {visible ? <ChangePinFlow onClose={onClose} /> : null}
    </SheetModal>
  );
}

function ChangePinFlow({ onClose }: { onClose: () => void }) {
  const theme = useTheme();
  const [step, setStep] = useState<Step>('verify');
  const [entry, setEntry] = useState('');
  const [error, setError] = useState<string | null>(null);
  const secret = useRef<{ mnemonic: string; currentPin: string } | null>(null);
  const newPin = useRef('');
  const mounted = useRef(true);

  const wipe = useCallback(() => {
    secret.current = null;
    newPin.current = '';
  }, []);

  useEffect(
    () => () => {
      mounted.current = false;
      wipe();
    },
    [wipe],
  );

  const handleAutoClear = useCallback(() => {
    wipe();
    onClose();
  }, [onClose, wipe]);
  useSecretAutoClear(step !== 'verify', handleAutoClear);

  const handleVerified = useCallback((mnemonic: string, pin: string) => {
    secret.current = { mnemonic, currentPin: pin };
    setStep('new');
  }, []);

  const save = useCallback(
    async (pin: string) => {
      const current = secret.current;
      if (!current) {
        setError('세션이 만료되었습니다. 처음부터 다시 시도해주세요.');
        setStep('verify');
        return;
      }
      setStep('saving');
      try {
        await walletService.storeMnemonic(current.mnemonic, pin);
        wipe();
        showToast('PIN이 변경되었습니다.', 'success');
        if (mounted.current) onClose();
      } catch (reason) {
        logger.error('PIN change failed', reason);
        if (mounted.current) {
          setError('PIN 변경에 실패했습니다. 기존 PIN은 그대로 유지됩니다.');
          newPin.current = '';
          setStep('new');
        }
      }
    },
    [onClose, wipe],
  );

  const handleDigit = useCallback(
    (digit: string) => {
      const next = entry + digit;
      if (next.length > PIN_LENGTH) return;
      setError(null);
      setEntry(next);
      if (next.length < PIN_LENGTH) return;

      setEntry('');
      if (step === 'new') {
        // 온보딩(PIN 설정)과 같은 정책으로 추측하기 쉬운 PIN을 거부한다.
        if (isWeakPin(next)) {
          errorFeedback();
          setError(WEAK_PIN_MESSAGE);
          return;
        }
        if (next === secret.current?.currentPin) {
          errorFeedback();
          setError('현재 PIN과 다른 PIN을 입력해주세요.');
          return;
        }
        newPin.current = next;
        setStep('confirm');
      } else if (step === 'confirm') {
        if (next !== newPin.current) {
          errorFeedback();
          newPin.current = '';
          setError('PIN이 일치하지 않습니다. 새 PIN을 다시 입력해주세요.');
          setStep('new');
          return;
        }
        save(next);
      }
    },
    [entry, save, step],
  );

  const handleDelete = useCallback(
    () => setEntry(previous => previous.slice(0, -1)),
    [],
  );

  return (
    <Body>
      <Steps
        accessible
        accessibilityLabel={`3단계 중 ${
          step === 'verify' ? 1 : step === 'new' ? 2 : 3
        }단계`}
      >
        {(['verify', 'new', 'confirm'] as const).map(item => (
          <StepDot
            key={item}
            $active={item === step || (step === 'saving' && item === 'confirm')}
          />
        ))}
      </Steps>
      {step === 'verify' ? (
        <PinPrompt
          description={STEP_LABEL.verify}
          onVerified={handleVerified}
          testIDPrefix="change-pin-current"
        />
      ) : step === 'saving' ? (
        <Saving accessibilityLiveRegion="polite">
          <ActivityIndicator color={theme.colors.primary} size="large" />
          <SavingText>새 PIN으로 다시 암호화하는 중...</SavingText>
        </Saving>
      ) : (
        <>
          <Description>{STEP_LABEL[step]}</Description>
          {error ? (
            <ErrorMessage testID="change-pin-error">{error}</ErrorMessage>
          ) : null}
          <PinPad
            value={entry}
            onDigit={handleDigit}
            onDelete={handleDelete}
            error={!!error}
            label={step === 'new' ? '새 PIN' : '새 PIN 확인'}
            testIDPrefix={`change-pin-${step}`}
            maxKeySize={68}
          />
        </>
      )}
    </Body>
  );
}

const Body = styled.View`
  flex: 1;
  align-items: center;
`;

const Steps = styled.View`
  flex-direction: row;
  justify-content: center;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const StepDot = styled.View<{ $active: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 4px;
  margin: 0 4px;
  background-color: ${({ theme, $active }) =>
    $active ? theme.colors.primary : theme.colors.border};
`;

const Description = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 15px;
  text-align: center;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const Saving = styled.View`
  align-items: center;
  padding: ${({ theme }) => theme.spacing.xl}px;
`;

const SavingText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 15px;
  margin-top: ${({ theme }) => theme.spacing.md}px;
`;
