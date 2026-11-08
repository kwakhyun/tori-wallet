/**
 * 설정 화면 PIN 확인 단계 (공용 PinPad + usePinVerification)
 *
 * 6자리를 모두 입력하면 자동으로 확인한다. 실패/잠금 메시지는 화면 낭독기에 알린다.
 * 잠금 해제 화면·거래 승인 PIN과 같은 영구 실패 제한 UX를 쓴다: 제한 중에는 남은 시간을
 * 1초마다 갱신해 보여 주고 키패드를 막으며, 실패 기록이 있으면 남은 시도 횟수를 경고한다.
 * (실제 제한은 pinAttemptService가 강제하며 여기서는 표시만 담당한다)
 */

import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import styled, { useTheme } from 'styled-components/native';
import { AppModal } from '@/components/common/AppModal';
import { PinPad } from '@/components/common/PinPad';
import { Screen } from '@/components/common/Screen';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { usePinLockout } from '@/hooks/useAuthentication';
import { describePinAttemptWarning } from '@/services/pinAttemptService';
import { errorFeedback } from '@/utils/haptics';
import { PIN_LENGTH, usePinVerification } from '../hooks/usePinVerification';
import { ErrorMessage } from './SettingsUI';

interface PinPromptProps {
  description: string;
  /** PIN 확인 성공. mnemonic은 꼭 필요한 경우에만 보관하고 즉시 폐기한다. */
  onVerified: (mnemonic: string, pin: string) => void;
  testIDPrefix?: string;
  busyLabel?: string;
}

export function PinPrompt({
  description,
  onVerified,
  testIDPrefix = 'settings-pin',
  busyLabel = '확인 중...',
}: PinPromptProps): React.JSX.Element {
  const theme = useTheme();
  const [pin, setPinState] = useState('');
  // 빠른 연속 입력에서도 자릿수가 빠지지 않도록 최신 값을 ref로 추적한다.
  const pinRef = useRef('');
  const setPin = useCallback((value: string) => {
    pinRef.current = value;
    setPinState(value);
  }, []);
  const { verify, isVerifying, error, clearError } = usePinVerification();
  const lockout = usePinLockout();
  const { refresh: refreshLockout, lockUntil } = lockout;

  const submit = useCallback(
    async (value: string) => {
      const result = await verify(value);
      setPin('');
      if (result.status === 'verified') {
        onVerified(result.mnemonic, value);
        return;
      }
      if (result.status !== 'failed') return;
      if (result.reason === 'locked') {
        errorFeedback();
        // 고정된 시각이 담긴 오류 문구 대신 실시간 카운트다운을 표시한다.
        if (result.retryAt) lockUntil(result.retryAt);
        clearError();
        refreshLockout();
      } else if (result.reason === 'invalid') {
        errorFeedback();
        refreshLockout();
      }
    },
    [clearError, lockUntil, onVerified, refreshLockout, setPin, verify],
  );

  const keypadDisabled = isVerifying || lockout.isLocked;

  const handleDigit = useCallback(
    (digit: string) => {
      if (keypadDisabled || pinRef.current.length >= PIN_LENGTH) return;
      clearError();
      const next = pinRef.current + digit;
      setPin(next);
      if (next.length === PIN_LENGTH) submit(next);
    },
    [clearError, keypadDisabled, setPin, submit],
  );

  const handleDelete = useCallback(() => {
    setPin(pinRef.current.slice(0, -1));
  }, [setPin]);

  const attemptWarning =
    !lockout.isLocked && !isVerifying
      ? describePinAttemptWarning(lockout.failures)
      : null;

  return (
    <Wrapper testID={`${testIDPrefix}-prompt`}>
      <Description>{description}</Description>
      {lockout.isLocked ? (
        // 1초마다 바뀌는 문구라 라이브 영역으로 두지 않는다 (매초 낭독 방지).
        <LockoutText testID={`${testIDPrefix}-error`} accessibilityRole="alert">
          {`PIN 입력이 제한되었습니다. ${lockout.countdown} 후 다시 시도해주세요.`}
        </LockoutText>
      ) : error ? (
        <ErrorMessage testID={`${testIDPrefix}-error`}>{error}</ErrorMessage>
      ) : null}
      {attemptWarning ? (
        <WarningText
          testID={`${testIDPrefix}-attempts-warning`}
          $strong={lockout.remainingAttempts <= 2}
        >
          {attemptWarning}
        </WarningText>
      ) : null}
      {isVerifying ? (
        <Busy accessibilityLiveRegion="polite" testID={`${testIDPrefix}-busy`}>
          <ActivityIndicator color={theme.colors.primary} />
          <BusyText>{busyLabel}</BusyText>
        </Busy>
      ) : null}
      <PinPad
        value={pin}
        onDigit={handleDigit}
        onDelete={handleDelete}
        disabled={keypadDisabled}
        error={!!error || lockout.isLocked}
        testIDPrefix={testIDPrefix}
        maxKeySize={68}
      />
    </Wrapper>
  );
}

interface PinVerifyModalProps {
  visible: boolean;
  title: string;
  description: string;
  onVerified: (mnemonic: string, pin: string) => void;
  onCancel: () => void;
  testID?: string;
}

/** PIN 확인만 하는 시트 (보안 약화 설정 변경, 생체인증 활성화 등) */
export function PinVerifyModal({
  visible,
  title,
  description,
  onVerified,
  onCancel,
  testID = 'pin-verify-modal',
}: PinVerifyModalProps): React.JSX.Element {
  return (
    // 잠기면 PIN 확인을 취소한다 (진행 중인 검증 결과는 usePinVerification이 폐기한다).
    <AppModal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
      onLock={onCancel}
    >
      {/* PIN 확인은 네트워크와 무관하므로 오프라인 배너로 키패드 공간을 줄이지 않는다. */}
      <Screen testID={testID} offlineBanner={false}>
        <ScreenHeader
          title={title}
          leftIcon="close"
          onBack={onCancel}
          backTestID={`${testID}-close`}
        />
        {visible ? (
          <Body>
            <PinPrompt
              description={description}
              onVerified={onVerified}
              testIDPrefix={`${testID}-pin`}
            />
          </Body>
        ) : null}
      </Screen>
    </AppModal>
  );
}

const Wrapper = styled.View`
  align-items: center;
  width: 100%;
`;

const Description = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 15px;
  line-height: 22px;
  text-align: center;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const LockoutText = styled.Text`
  color: ${({ theme }) => theme.colors.error};
  font-size: 14px;
  text-align: center;
  margin: ${({ theme }) => theme.spacing.sm}px 0;
`;

// 잠금 해제 화면과 같은 표현: 제한이 가까우면 경고색으로 강조한다.
const WarningText = styled.Text<{ $strong: boolean }>`
  color: ${({ theme, $strong }) =>
    $strong ? theme.colors.warning : theme.colors.textSecondary};
  font-size: 13px;
  text-align: center;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const Busy = styled.View`
  flex-direction: row;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const BusyText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
  margin-left: ${({ theme }) => theme.spacing.sm}px;
`;

const Body = styled.View`
  flex: 1;
  padding: 20px;
  justify-content: center;
`;
