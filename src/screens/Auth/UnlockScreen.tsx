/**
 * 잠금 해제 PIN 입력 화면
 *
 * 콜드 스타트에서는 일반 라우트로, 자동 잠금 후에는 RootNavigator의 잠금 오버레이
 * (Modal) 안에서 렌더링된다. 두 경우 모두 동작해야 하므로 라우트 파라미터나
 * 네비게이션에 의존하지 않고, 오버레이 위에 보이지 않는 토스트 대신 화면 안에
 * 오류를 표시한다.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import styled from 'styled-components/native';
import { useShallow } from 'zustand/react/shallow';
import {
  ActivityIndicator,
  AppState,
  ScrollView,
  StatusBar,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { useWalletStore } from '@/store/walletStore';
import {
  isBiometricUnlockAvailable,
  useAuthentication,
  usePinLockout,
} from '@/hooks/useAuthentication';
import {
  describePinAttemptWarning,
  PinLockedError,
} from '@/services/pinAttemptService';
import { walletResetService } from '@/services/walletResetService';
import { ToriCatFace } from '@/components/common/Logo';
import { PinPad } from '@/components/common/PinPad';
import { showToast } from '@/store/toastStore';
import { errorFeedback } from '@/utils/haptics';
import { ForgotPinPanel } from './ForgotPinPanel';

const PIN_LENGTH = 6;
export const WRONG_PIN_MESSAGE = 'PIN이 올바르지 않습니다.';

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1, justifyContent: 'center' },
});

function UnlockScreen(): React.JSX.Element {
  const { theme, isDarkMode } = useTheme();
  const { height } = useWindowDimensions();
  const compact = height < 720;
  const { unlock } = useWalletStore(
    useShallow(state => ({ unlock: state.unlock })),
  );
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [showForgotPin, setShowForgotPin] = useState(false);
  const {
    authenticate,
    cancel,
    isAuthenticating: isLoading,
  } = useAuthentication();
  const lockout = usePinLockout();
  const { refresh: refreshLockout, lockUntil } = lockout;
  const mounted = useRef(true);
  const showForgotPinRef = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    showForgotPinRef.current = showForgotPin;
  }, [showForgotPin]);

  useEffect(() => {
    if (!isLoading) setPin('');
  }, [isLoading]);

  useEffect(() => {
    let cancelled = false;
    isBiometricUnlockAvailable().then(available => {
      if (!cancelled) setBiometricAvailable(available);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const tryBiometric = useCallback(async () => {
    if (!(await isBiometricUnlockAvailable())) return;
    if (!mounted.current || showForgotPinRef.current) return;
    try {
      if (await authenticate()) unlock();
    } catch {
      // 생체인증 취소/실패 후에는 PIN을 사용할 수 있다.
    }
  }, [authenticate, unlock]);

  const tryBiometricRef = useRef(tryBiometric);
  useEffect(() => {
    tryBiometricRef.current = tryBiometric;
  }, [tryBiometric]);

  // 생체인증 자동 시도
  //  - 앱이 보이는 상태에서 화면이 열리면 즉시 시도한다.
  //  - '즉시' 자동 잠금은 백그라운드 전환 시 잠그므로 이 화면이 백그라운드에서
  //    마운트된다. 그때의 시도는 폐기되므로 앱이 다시 active가 될 때 시도한다.
  //  - Face ID 프롬프트 자체가 active → inactive → active 전환을 만들므로
  //    백그라운드를 거친 경우에만 다시 시도해 취소 후 반복 프롬프트를 막는다.
  useEffect(() => {
    let wasInBackground = AppState.currentState === 'background';
    if (!wasInBackground) tryBiometricRef.current();
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'background') {
        wasInBackground = true;
      } else if (next === 'active' && wasInBackground) {
        wasInBackground = false;
        tryBiometricRef.current();
      }
    });
    return () => subscription.remove();
  }, []);

  const submitPin = useCallback(
    async (value: string) => {
      try {
        const authenticated = await authenticate(value);
        if (authenticated === null) {
          setPin('');
          return;
        }
        if (authenticated) {
          unlock();
          return;
        }
        errorFeedback();
        setError(WRONG_PIN_MESSAGE);
        refreshLockout();
      } catch (reason) {
        errorFeedback();
        if (reason instanceof PinLockedError) {
          setError(null);
          lockUntil(reason.retryAt);
          refreshLockout();
        } else {
          setError('PIN 확인에 실패했습니다. 다시 시도해주세요.');
        }
      }
    },
    [authenticate, lockUntil, refreshLockout, unlock],
  );

  const keypadDisabled = isLoading || lockout.isLocked;

  const handleDigit = useCallback(
    (digit: string) => {
      if (keypadDisabled || pin.length >= PIN_LENGTH) return;
      const next = pin + digit;
      setError(null);
      setPin(next);
      if (next.length === PIN_LENGTH) submitPin(next);
    },
    [keypadDisabled, pin, submitPin],
  );

  const handleDelete = useCallback(() => {
    setPin(previous => previous.slice(0, -1));
  }, []);

  const handleBiometric = useCallback(() => {
    tryBiometric();
  }, [tryBiometric]);

  const openForgotPin = useCallback(() => {
    // 진행 중인 생체인증 결과가 초기화 안내 위에서 지갑을 열지 않게 한다.
    cancel();
    setPin('');
    setError(null);
    setShowForgotPin(true);
  }, [cancel]);

  const closeForgotPin = useCallback(() => {
    setShowForgotPin(false);
    refreshLockout();
  }, [refreshLockout]);

  const handleReset = useCallback(async () => {
    cancel();
    try {
      await walletResetService.reset();
      showToast(
        '지갑을 초기화했습니다. 복구 구문으로 지갑을 다시 가져오세요.',
        'success',
        4000,
      );
    } catch (reason) {
      // 지갑 저장소가 지워졌다면 이 화면은 이미 사라졌으므로 토스트로 알린다.
      if (!mounted.current) {
        showToast(
          reason instanceof Error
            ? reason.message
            : '지갑 초기화 중 일부 정리에 실패했습니다.',
          'warning',
          4000,
        );
      }
      throw reason;
    }
  }, [cancel]);

  const renderStatus = () => {
    if (isLoading) {
      return (
        <StatusRow accessibilityLiveRegion="polite">
          <ActivityIndicator color={theme.colors.primary} />
          <LoadingText>잠금 해제 중...</LoadingText>
        </StatusRow>
      );
    }
    if (lockout.isLocked) {
      return (
        <LockoutBox testID="unlock-lockout">
          <LockoutTitle accessibilityRole="alert">
            PIN 입력이 일시적으로 제한되었습니다
          </LockoutTitle>
          <LockoutCountdown
            testID="unlock-lockout-countdown"
            accessibilityLabel={`남은 시간 ${lockout.countdown}`}
          >
            {lockout.countdown}
          </LockoutCountdown>
          <LockoutHint>후에 다시 시도할 수 있습니다.</LockoutHint>
        </LockoutBox>
      );
    }
    const warning = describePinAttemptWarning(lockout.failures);
    return (
      <StatusRow>
        {error ? (
          <ErrorText
            testID="unlock-error"
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
          >
            {error}
          </ErrorText>
        ) : null}
        {warning ? (
          <WarningText
            testID="unlock-attempts-warning"
            $strong={lockout.remainingAttempts <= 2}
          >
            {warning}
          </WarningText>
        ) : null}
      </StatusRow>
    );
  };

  if (showForgotPin) {
    return (
      <Container testID="unlock-screen">
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <ForgotPinPanel onCancel={closeForgotPin} onReset={handleReset} />
      </Container>
    );
  }

  return (
    <Container testID="unlock-screen">
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        bounces={false}
        keyboardShouldPersistTaps="handled"
      >
        <Content>
          <LogoContainer $compact={compact}>
            <ToriCatFace size={compact ? 64 : 96} />
            <AppName $compact={compact}>Tori Wallet</AppName>
          </LogoContainer>

          <Title accessibilityRole="header">PIN 입력</Title>
          <Subtitle>지갑 잠금을 해제하려면 PIN을 입력하세요</Subtitle>

          {renderStatus()}

          <PinPad
            value={pin}
            length={PIN_LENGTH}
            onDigit={handleDigit}
            onDelete={handleDelete}
            disabled={keypadDisabled}
            error={!!error}
            testIDPrefix="unlock"
            leftAction={
              biometricAvailable
                ? {
                    label: '🔐',
                    accessibilityLabel: '생체인증으로 잠금 해제',
                    onPress: handleBiometric,
                    testID: 'unlock-biometric',
                  }
                : null
            }
          />

          {lockout.isLocked && biometricAvailable ? (
            <SecondaryButton
              testID="unlock-biometric-during-lockout"
              onPress={handleBiometric}
              disabled={isLoading}
              accessibilityRole="button"
              accessibilityLabel="생체인증으로 잠금 해제"
            >
              <SecondaryButtonText>생체인증으로 잠금 해제</SecondaryButtonText>
            </SecondaryButton>
          ) : null}

          <LinkButton
            testID="unlock-forgot-pin"
            onPress={openForgotPin}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel="PIN을 잊으셨나요? 지갑 초기화 안내 보기"
          >
            <LinkText>PIN을 잊으셨나요?</LinkText>
          </LinkButton>
        </Content>
      </ScrollView>
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
`;

const Content = styled.View`
  padding: ${({ theme }) => theme.spacing.lg}px
    ${({ theme }) => theme.spacing.md}px;
  align-items: center;
`;

const LogoContainer = styled.View<{ $compact: boolean }>`
  align-items: center;
  margin-bottom: ${({ theme, $compact }) =>
    $compact ? theme.spacing.md : theme.spacing.xl}px;
`;

const AppName = styled.Text<{ $compact: boolean }>`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ $compact }) => ($compact ? 20 : 24)}px;
  font-weight: bold;
  margin-top: ${({ theme }) => theme.spacing.sm}px;
`;

const Title = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 20px;
  font-weight: 600;
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
`;

const Subtitle = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
  text-align: center;
`;

const StatusRow = styled.View`
  min-height: 56px;
  width: 100%;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.sm}px 0;
`;

const LoadingText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
`;

const ErrorText = styled.Text`
  color: ${({ theme }) => theme.colors.error};
  font-size: 14px;
  font-weight: 600;
  text-align: center;
`;

const WarningText = styled.Text<{ $strong: boolean }>`
  color: ${({ theme, $strong }) =>
    $strong ? theme.colors.warning : theme.colors.textSecondary};
  font-size: 13px;
  text-align: center;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
`;

const LockoutBox = styled.View`
  width: 100%;
  align-items: center;
  background-color: ${({ theme }) => theme.colors.warningSubtle};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.sm}px
    ${({ theme }) => theme.spacing.md}px;
  margin: ${({ theme }) => theme.spacing.sm}px 0
    ${({ theme }) => theme.spacing.md}px;
`;

const LockoutTitle = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 14px;
  font-weight: 600;
  text-align: center;
`;

const LockoutCountdown = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 28px;
  font-weight: 700;
  font-variant: tabular-nums;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
`;

const LockoutHint = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
`;

const SecondaryButton = styled.TouchableOpacity`
  min-height: ${({ theme }) => theme.touchTarget}px;
  padding: 0 ${({ theme }) => theme.spacing.lg}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  border: 1px solid ${({ theme }) => theme.colors.primary};
  align-items: center;
  justify-content: center;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const SecondaryButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 15px;
  font-weight: 600;
`;

const LinkButton = styled.TouchableOpacity`
  min-height: ${({ theme }) => theme.touchTarget}px;
  padding: 0 ${({ theme }) => theme.spacing.md}px;
  align-items: center;
  justify-content: center;
`;

const LinkText = styled.Text`
  color: ${({ theme }) => theme.colors.primary};
  font-size: 15px;
  font-weight: 600;
  text-decoration-line: underline;
`;

export default UnlockScreen;
