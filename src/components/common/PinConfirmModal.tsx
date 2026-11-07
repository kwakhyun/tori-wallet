/**
 * 트랜잭션/서명 전 PIN 확인 모달
 *
 * onConfirm은 서명 세션이 시작된 뒤(signerVault 잠금 해제)에만 호출된다.
 * 생체인증이 설정되어 있으면 PIN 대신 생체인증으로도 승인할 수 있으며,
 * 이 경우에도 같은 signerVault 세션이 시작되므로 호출부 입장에서는 결과가 같다.
 *
 * 지갑이 잠긴 동안에는 표시되지 않고 서명 세션도 시작하지 않는다. 열려 있는 중에
 * 잠기면 onCancel이 호출된다.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import styled from 'styled-components/native';
import { ActivityIndicator } from 'react-native';
import {
  isBiometricUnlockAvailable,
  useAuthentication,
  usePinLockout,
} from '@/hooks/useAuthentication';
import {
  describePinAttemptWarning,
  PinLockedError,
} from '@/services/pinAttemptService';
import { errorFeedback } from '@/utils/haptics';
import { useTheme } from '@/hooks/useTheme';
import { AppModal } from './AppModal';
import { PinPad } from './PinPad';

const PIN_LENGTH = 6;

interface Props {
  visible: boolean;
  /** PIN 또는 생체인증으로 서명 세션이 열린 뒤 한 번 호출된다. */
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  message?: string;
  /**
   * 생체인증이 설정·지원되는 기기에서 생체인증 승인을 허용할지 (기본값 true).
   * 허용되면 모달을 열 때 한 번 자동으로 프롬프트를 띄우고, 키패드의 🔐 키로
   * 다시 시도할 수 있다.
   */
  allowBiometric?: boolean;
}

export function PinConfirmModal({
  visible,
  onConfirm,
  onCancel,
  title = 'PIN 확인',
  message = '계속하려면 PIN을 입력하세요.',
  allowBiometric = true,
}: Props) {
  const { theme } = useTheme();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const {
    authenticate,
    cancel,
    isAuthenticating: isLoading,
  } = useAuthentication({ requireUnlockedWallet: true });
  const lockout = usePinLockout(visible);
  const { refresh: refreshLockout, lockUntil } = lockout;

  useEffect(() => {
    cancel();
    setPin('');
    setError(null);
    setNotice(null);
  }, [visible, cancel]);

  useEffect(() => {
    if (!isLoading) setPin('');
  }, [isLoading]);

  const handleCancel = useCallback(() => {
    cancel();
    setPin('');
    onCancel();
  }, [cancel, onCancel]);

  const confirmWithBiometric = useCallback(async () => {
    setError(null);
    setNotice(null);
    try {
      const authenticated = await authenticate();
      if (authenticated === null) return;
      if (authenticated) {
        onConfirm();
        return;
      }
      setNotice('생체인증을 완료하지 못했습니다. PIN을 입력해주세요.');
    } catch {
      setNotice('생체인증을 사용할 수 없습니다. PIN을 입력해주세요.');
    }
  }, [authenticate, onConfirm]);

  const confirmWithBiometricRef = useRef(confirmWithBiometric);
  useEffect(() => {
    confirmWithBiometricRef.current = confirmWithBiometric;
  }, [confirmWithBiometric]);

  // 모달이 열릴 때 생체인증 사용 가능 여부를 확인하고 한 번만 자동으로 시도한다.
  useEffect(() => {
    if (!visible || !allowBiometric) {
      setBiometricAvailable(false);
      return;
    }
    let cancelled = false;
    isBiometricUnlockAvailable().then(available => {
      if (cancelled) return;
      setBiometricAvailable(available);
      if (available) confirmWithBiometricRef.current();
    });
    return () => {
      cancelled = true;
    };
  }, [visible, allowBiometric]);

  const handleVerify = useCallback(
    async (value: string) => {
      try {
        const authenticated = await authenticate(value);
        if (authenticated === null) {
          setPin('');
          return;
        }
        setPin('');
        if (authenticated) {
          onConfirm();
          return;
        }
        errorFeedback();
        setError('PIN이 올바르지 않습니다.');
        refreshLockout();
      } catch (reason) {
        setPin('');
        errorFeedback();
        if (reason instanceof PinLockedError) {
          setError(null);
          lockUntil(reason.retryAt);
          refreshLockout();
        } else {
          setError('PIN 확인에 실패했습니다.');
        }
      }
    },
    [authenticate, lockUntil, onConfirm, refreshLockout],
  );

  const keypadDisabled = isLoading || !visible || lockout.isLocked;

  const handleDigit = useCallback(
    (digit: string) => {
      if (keypadDisabled || pin.length >= PIN_LENGTH) return;
      const next = pin + digit;
      setPin(next);
      setError(null);
      setNotice(null);
      if (next.length === PIN_LENGTH) handleVerify(next);
    },
    [handleVerify, keypadDisabled, pin],
  );

  const handleDelete = useCallback(() => {
    setPin(previous => previous.slice(0, -1));
  }, []);

  const attemptWarning =
    error && !lockout.isLocked
      ? describePinAttemptWarning(lockout.failures)
      : null;

  return (
    // 지갑이 잠기면 진행 중인 인증을 폐기하고 취소한다 (잠금 화면 위에 남지 않는다).
    <AppModal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleCancel}
      onLock={handleCancel}
    >
      <Overlay testID="pin-confirm-overlay">
        <Container testID="pin-confirm-container">
          <Title testID="pin-confirm-title" accessibilityRole="header">
            {title}
          </Title>
          <Message testID="pin-confirm-message">{message}</Message>

          <StatusArea>
            {isLoading ? (
              <LoadingRow accessibilityLiveRegion="polite">
                <ActivityIndicator color={theme.colors.primary} />
                <LoadingText>확인 중...</LoadingText>
              </LoadingRow>
            ) : lockout.isLocked ? (
              <ErrorText testID="pin-confirm-error" accessibilityRole="alert">
                {`PIN 입력이 제한되었습니다. ${lockout.countdown} 후 다시 시도해주세요.`}
              </ErrorText>
            ) : error ? (
              <ErrorText
                testID="pin-confirm-error"
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
              >
                {error}
              </ErrorText>
            ) : notice ? (
              <NoticeText testID="pin-confirm-notice">{notice}</NoticeText>
            ) : null}
            {attemptWarning ? (
              <WarningText testID="pin-confirm-attempts-warning">
                {attemptWarning}
              </WarningText>
            ) : null}
          </StatusArea>

          <KeypadArea testID="pin-confirm-keypad">
            <PinPad
              value={pin}
              length={PIN_LENGTH}
              onDigit={handleDigit}
              onDelete={handleDelete}
              disabled={keypadDisabled}
              error={!!error}
              maxKeySize={64}
              testIDPrefix="pin"
              leftAction={
                biometricAvailable
                  ? {
                      label: '🔐',
                      accessibilityLabel: '생체인증으로 승인',
                      onPress: () => {
                        confirmWithBiometric();
                      },
                      testID: 'pin-confirm-biometric',
                    }
                  : null
              }
            />
          </KeypadArea>

          <CancelButton
            onPress={handleCancel}
            testID="pin-confirm-cancel"
            accessibilityRole="button"
            accessibilityLabel="취소"
          >
            <CancelButtonText>취소</CancelButtonText>
          </CancelButton>
        </Container>
      </Overlay>
    </AppModal>
  );
}

// Styled Components
const Overlay = styled.View`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.overlay};
  justify-content: center;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.md}px;
`;

const Container = styled.View`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.xl}px;
  padding: ${({ theme }) => theme.spacing.lg}px
    ${({ theme }) => theme.spacing.md}px;
  width: 100%;
  max-width: 360px;
  align-items: center;
`;

const Title = styled.Text`
  font-size: 20px;
  font-weight: bold;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
`;

const Message = styled.Text`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
`;

const StatusArea = styled.View`
  min-height: 44px;
  width: 100%;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.xs}px 0;
`;

const ErrorText = styled.Text`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.error};
  text-align: center;
`;

const NoticeText = styled.Text`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
`;

const WarningText = styled.Text`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.warning};
  text-align: center;
  margin-top: 2px;
`;

const LoadingRow = styled.View`
  flex-direction: row;
  align-items: center;
`;

const LoadingText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
  margin-left: ${({ theme }) => theme.spacing.sm}px;
`;

const KeypadArea = styled.View`
  width: 100%;
`;

const CancelButton = styled.TouchableOpacity`
  min-height: ${({ theme }) => theme.touchTarget}px;
  min-width: 120px;
  padding: 0 ${({ theme }) => theme.spacing.md}px;
  align-items: center;
  justify-content: center;
`;

const CancelButtonText = styled.Text`
  font-size: 16px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export default PinConfirmModal;
