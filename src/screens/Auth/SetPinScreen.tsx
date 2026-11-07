/**
 * PIN 설정 및 지갑 생성/가져오기 완료 화면
 *
 * 1단계(create)에서 PIN을 입력하고 2단계(confirm)에서 다시 입력한다.
 * 확인 단계의 뒤로 가기는 화면을 떠나지 않고 1단계로 돌아간다.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import styled from 'styled-components/native';
import { useShallow } from 'zustand/react/shallow';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
} from 'react-native';
import { CommonActions, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '@/navigation/AuthNavigator';
import { useTheme } from '@/hooks/useTheme';
import { walletService } from '@/services/walletService';
import { signerVault } from '@/services/signerVault';
import { useWalletStore } from '@/store/walletStore';
import { onboardingVault } from '@/services/onboardingVault';
import { isWeakPin } from '@/services/pinAttemptService';
import { PinPad } from '@/components/common/PinPad';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { showToast } from '@/store/toastStore';
import { errorFeedback, successFeedback } from '@/utils/haptics';
import { createLogger } from '@/utils/logger';

const logger = createLogger('SetPin');

type NavigationProp = NativeStackNavigationProp<AuthStackParamList, 'SetPin'>;

type Step = 'create' | 'confirm';

const PIN_LENGTH = 6;
export const WEAK_PIN_MESSAGE =
  '추측하기 쉬운 PIN입니다. 같은 숫자 반복(111111), 연속된 숫자(123456, 654321), 반복 패턴(121212)은 사용할 수 없습니다.';
export const PIN_MISMATCH_MESSAGE =
  'PIN이 일치하지 않습니다. 처음부터 다시 입력해주세요.';

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1 },
});

/** 지갑 저장이 끝난 뒤 생체인증 등록을 한 번 제안한다. 건너뛸 수 있다. */
function offerBiometricEnrollment(mnemonic: string): void {
  Alert.alert(
    '생체인증 사용',
    '다음부터 Face ID 또는 지문으로 지갑 잠금을 해제하고 거래를 승인할 수 있습니다.\n설정에서 언제든 변경할 수 있습니다.',
    [
      { text: '나중에', style: 'cancel' },
      {
        text: '사용하기',
        onPress: async () => {
          // 그 사이 잠기거나 초기화되었다면 등록하지 않는다.
          if (!signerVault.isUnlocked()) {
            showToast(
              '지갑이 잠겨 생체인증을 설정하지 않았습니다. 설정에서 다시 시도해주세요.',
              'info',
            );
            return;
          }
          try {
            await walletService.enableBiometric(mnemonic);
            showToast('생체인증을 설정했습니다.', 'success');
          } catch (error) {
            logger.warn('Biometric enrollment failed', error);
            showToast(
              '생체인증을 설정하지 못했습니다. 설정에서 다시 시도해주세요.',
              'error',
            );
          }
        },
      },
    ],
    { cancelable: true },
  );
}

async function canOfferBiometric(): Promise<boolean> {
  try {
    return await walletService.isBiometricSupported();
  } catch {
    return false;
  }
}

function SetPinScreen(): React.JSX.Element {
  const { theme, isDarkMode } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const snapshot = onboardingVault.getSnapshot();
  const walletAddress = snapshot?.walletAddress || '';
  const isImport = snapshot?.source === 'import';

  useEffect(() => {
    if (!walletAddress) navigation.navigate('Welcome');
  }, [navigation, walletAddress]);

  const [step, setStep] = useState<Step>('create');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const firstPin = useRef('');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const { addWallet, setHasWallet, unlock } = useWalletStore(
    useShallow(state => ({
      addWallet: state.addWallet,
      setHasWallet: state.setHasWallet,
      unlock: state.unlock,
    })),
  );

  const resetToCreate = useCallback((message: string | null = null) => {
    firstPin.current = '';
    setStep('create');
    setPin('');
    setError(message);
  }, []);

  const handleBack = useCallback(() => {
    if (isLoading) return;
    if (step === 'confirm') {
      resetToCreate();
      return;
    }
    navigation.goBack();
  }, [isLoading, navigation, resetToCreate, step]);

  // Android 하드웨어 뒤로 가기도 헤더 뒤로 가기와 같게 동작한다.
  // (iOS 스와이프 뒤로 가기는 AuthNavigator에서 막는다)
  const allowLeave = useRef(false);
  const guard = useRef({ isLoading, step });
  useEffect(() => {
    guard.current = { isLoading, step };
  }, [isLoading, step]);

  useEffect(
    () =>
      navigation.addListener('beforeRemove', event => {
        if (allowLeave.current) return;
        if (guard.current.isLoading) {
          event.preventDefault();
          return;
        }
        if (guard.current.step === 'confirm') {
          event.preventDefault();
          resetToCreate();
        }
      }),
    [navigation, resetToCreate],
  );

  const handleComplete = useCallback(
    async (confirmedPin: string) => {
      if (firstPin.current !== confirmedPin) {
        errorFeedback();
        resetToCreate(PIN_MISMATCH_MESSAGE);
        return;
      }

      setIsLoading(true);
      setError(null);
      setLoadingMessage('PIN으로 복구 구문을 암호화하는 중…');

      let sessionId: number | null = null;
      try {
        const onboardingSecret = onboardingVault.getSnapshot();
        if (!onboardingSecret?.walletAddress) {
          throw new Error('지갑 생성 세션이 만료되었습니다.');
        }
        const { mnemonic } = onboardingSecret;
        sessionId = onboardingSecret.sessionId;

        await walletService.storeMnemonic(mnemonic, confirmedPin);

        if (!onboardingVault.isActive(sessionId)) {
          await walletService.clearAll();
          throw new Error(
            '앱이 백그라운드로 전환되어 지갑 생성을 취소했습니다.',
          );
        }

        if (mounted.current) setLoadingMessage('계정 정보 저장 중…');
        await walletService.storeAccounts([
          {
            address: onboardingSecret.walletAddress,
            derivationPath: "m/44'/60'/0'/0/0",
            name: 'Account 1',
          },
        ]);

        if (!onboardingVault.isActive(sessionId)) {
          await walletService.clearAll();
          throw new Error(
            '앱이 백그라운드로 전환되어 지갑 생성을 취소했습니다.',
          );
        }

        const offerBiometric = await canOfferBiometric();

        addWallet({
          address: onboardingSecret.walletAddress,
          name: 'Account 1',
          isHD: true,
          derivationPath: "m/44'/60'/0'/0/0",
        });

        signerVault.startSession(mnemonic);
        unlock();
        setHasWallet(true);
        onboardingVault.clear('completed');
        successFeedback();

        allowLeave.current = true;
        navigation.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [{ name: 'Welcome' }],
          }),
        );

        if (offerBiometric) offerBiometricEnrollment(mnemonic);
      } catch (reason) {
        logger.error('Failed to create wallet:', reason);
        // 백그라운드 전환/만료로 세션이 폐기되었다면 시작 화면이 이유를 설명한다.
        const interrupted =
          sessionId !== null && !onboardingVault.isActive(sessionId);
        if (!interrupted) {
          Alert.alert(
            '오류',
            isImport
              ? '지갑을 가져오지 못했습니다. 다시 시도해주세요.'
              : '지갑 생성에 실패했습니다. 다시 시도해주세요.',
          );
        }
        if (mounted.current) resetToCreate();
      } finally {
        if (mounted.current) {
          setIsLoading(false);
          setLoadingMessage('');
        }
      }
    },
    [addWallet, isImport, navigation, resetToCreate, setHasWallet, unlock],
  );

  const handleDigit = useCallback(
    (digit: string) => {
      if (isLoading || pin.length >= PIN_LENGTH) return;
      const next = pin + digit;
      setError(null);
      if (next.length < PIN_LENGTH) {
        setPin(next);
        return;
      }
      if (step === 'create') {
        if (isWeakPin(next)) {
          errorFeedback();
          setPin('');
          setError(WEAK_PIN_MESSAGE);
          return;
        }
        firstPin.current = next;
        setPin('');
        setStep('confirm');
        return;
      }
      setPin(next);
      handleComplete(next);
    },
    [handleComplete, isLoading, pin, step],
  );

  const handleDelete = useCallback(() => {
    setPin(previous => previous.slice(0, -1));
  }, []);

  return (
    <Container>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScreenHeader
        onBack={handleBack}
        backDisabled={isLoading}
        subtitle={step === 'create' ? '1/2 단계' : '2/2 단계'}
        backTestID="set-pin-back"
      />
      <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
        <Content>
          <Title accessibilityRole="header">
            {step === 'create' ? 'PIN 설정' : 'PIN 확인'}
          </Title>
          <Description>
            {step === 'create'
              ? '6자리 PIN을 입력해주세요.\n이 PIN은 지갑에 접근할 때 사용됩니다.'
              : '확인을 위해 같은 PIN을 한 번 더 입력해주세요.'}
          </Description>

          <StatusArea>
            {error ? (
              <ErrorText
                testID="set-pin-error"
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
              >
                {error}
              </ErrorText>
            ) : null}
          </StatusArea>

          {isLoading ? (
            <LoadingContainer
              testID="set-pin-loading"
              accessibilityLiveRegion="polite"
            >
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <LoadingTitle>
                {isImport ? '지갑 가져오는 중…' : '지갑 생성 중…'}
              </LoadingTitle>
              <LoadingText>{loadingMessage}</LoadingText>
              <LoadingSubText>
                보안 암호화에는 시간이 걸릴 수 있습니다. 앱을 닫지 마세요.
              </LoadingSubText>
            </LoadingContainer>
          ) : (
            <PinPad
              value={pin}
              length={PIN_LENGTH}
              onDigit={handleDigit}
              onDelete={handleDelete}
              error={!!error}
              label={step === 'create' ? '새 PIN' : 'PIN 확인'}
              testIDPrefix="set-pin"
            />
          )}

          <AddressPreview>
            <AddressLabel>
              {isImport ? '가져올 지갑 주소' : '지갑 주소'}
            </AddressLabel>
            <AddressText numberOfLines={1} ellipsizeMode="middle">
              {walletAddress}
            </AddressText>
          </AddressPreview>
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
  flex: 1;
  padding: 0 ${({ theme }) => theme.spacing.lg}px
    ${({ theme }) => theme.spacing.md}px;
`;

const Title = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.h2.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.h2.fontWeight};
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
  text-align: center;
`;

const Description = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  line-height: 21px;
  text-align: center;
`;

const StatusArea = styled.View`
  min-height: 48px;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.xs}px 0;
`;

const ErrorText = styled.Text`
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  line-height: 20px;
  text-align: center;
`;

const LoadingContainer = styled.View`
  flex: 1;
  min-height: 240px;
  justify-content: center;
  align-items: center;
`;

const LoadingTitle = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.h3.fontSize}px;
  font-weight: 600;
  margin-top: ${({ theme }) => theme.spacing.lg}px;
`;

const LoadingText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  margin-top: ${({ theme }) => theme.spacing.sm}px;
`;

const LoadingSubText = styled.Text`
  color: ${({ theme }) => theme.colors.textTertiary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  margin-top: ${({ theme }) => theme.spacing.sm}px;
  text-align: center;
`;

const AddressPreview = styled.View`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-top: auto;
`;

const AddressLabel = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
`;

const AddressText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  font-family: monospace;
`;

export default SetPinScreen;
