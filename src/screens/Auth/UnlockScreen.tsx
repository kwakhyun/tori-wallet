/**
 * 잠금 해제 PIN 입력 화면
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import styled from 'styled-components/native';
import { SafeAreaView, StatusBar, Alert, Animated } from 'react-native';
import { useWalletStore } from '@/store/walletStore';
import { walletService } from '@/services/walletService';
import { ToriCatFace } from '@/components/common/Logo';
import EncryptedStorage from 'react-native-encrypted-storage';

const BIOMETRIC_ENABLED_KEY = 'tori_biometric_enabled';

function UnlockScreen(): React.JSX.Element {
  const { unlock } = useWalletStore();
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [displayProgress, setDisplayProgress] = useState(0);
  const [attempts, setAttempts] = useState(0);

  // 애니메이션 값
  const animatedProgress = useRef(new Animated.Value(0)).current;

  // 애니메이션 값 변화 리스너 (텍스트 동기화)
  useEffect(() => {
    const listenerId = animatedProgress.addListener(({ value }) => {
      setDisplayProgress(Math.round(value));
    });
    return () => {
      animatedProgress.removeListener(listenerId);
    };
  }, [animatedProgress]);

  // 구간별 진행률 표시 (부드러운 애니메이션)
  const setProgress = useCallback(
    (value: number) => {
      Animated.timing(animatedProgress, {
        toValue: value,
        duration: 300,
        useNativeDriver: false,
      }).start();
    },
    [animatedProgress],
  );

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    // cleanup if needed
  }, []);

  // 생체인증 시도
  const tryBiometric = useCallback(async () => {
    try {
      const biometricEnabled = await EncryptedStorage.getItem(
        BIOMETRIC_ENABLED_KEY,
      );
      if (biometricEnabled !== 'true') return;

      const supported = await walletService.isBiometricSupported();
      if (!supported) return;

      // Keychain의 생체인증으로 니모닉 조회 시도
      setIsLoading(true);
      const mnemonic = await walletService.retrieveMnemonic();

      if (mnemonic) {
        // 생체인증 성공 - 잠금 해제
        unlock();
      }
    } catch {
      // 생체인증 실패 시 무시 (PIN 입력으로 진행)
      // 사용자가 취소했거나 인증 실패
    } finally {
      setIsLoading(false);
    }
  }, [unlock]);

  // 컴포넌트 마운트 시 생체인증 시도
  React.useEffect(() => {
    tryBiometric();
  }, [tryBiometric]);

  const handlePinInput = useCallback(
    async (digit: string) => {
      if (pin.length >= 6) return;

      const newPin = pin + digit;
      setPin(newPin);

      if (newPin.length === 6) {
        setIsLoading(true);
        setProgress(10);

        // 진행률 업데이트 간 딜레이
        await new Promise(resolve => setTimeout(resolve, 200));
        setProgress(30);
        await new Promise(resolve => setTimeout(resolve, 200));
        setProgress(50);

        try {
          const mnemonic = await walletService.retrieveMnemonicWithPin(newPin);

          await new Promise(resolve => setTimeout(resolve, 150));
          setProgress(70);
          await new Promise(resolve => setTimeout(resolve, 150));
          setProgress(85);

          if (mnemonic && walletService.validateMnemonic(mnemonic)) {
            await new Promise(resolve => setTimeout(resolve, 100));
            setProgress(100);
            unlock();
            setPin('');
            setAttempts(0);
          } else {
            setProgress(0);
            setAttempts(prev => prev + 1);
            setPin('');
            if (attempts >= 4) {
              Alert.alert(
                '경고',
                `PIN을 ${
                  attempts + 1
                }회 틀렸습니다.\n10회 실패 시 지갑이 초기화됩니다.`,
              );
            } else {
              Alert.alert('오류', 'PIN이 올바르지 않습니다.');
            }
          }
        } catch {
          setProgress(0);
          setPin('');
          Alert.alert('오류', 'PIN 확인에 실패했습니다.');
        } finally {
          setIsLoading(false);
        }
      }
    },
    [pin, unlock, attempts, setProgress],
  );

  const handleDelete = useCallback(() => {
    setPin(prev => prev.slice(0, -1));
  }, []);

  const handleBiometric = useCallback(() => {
    tryBiometric();
  }, [tryBiometric]);

  const renderPinDots = () => {
    return (
      <PinDotsContainer>
        {[0, 1, 2, 3, 4, 5].map(i => (
          <PinDot key={i} $filled={i < pin.length} />
        ))}
      </PinDotsContainer>
    );
  };

  const renderKeypad = () => {
    const keys = [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
      ['bio', '0', 'del'],
    ];

    return (
      <KeypadContainer>
        {keys.map((row, rowIndex) => (
          <KeypadRow key={rowIndex}>
            {row.map(key => {
              if (key === 'bio') {
                return (
                  <KeypadButton key={key} onPress={handleBiometric}>
                    <KeypadButtonText>🔐</KeypadButtonText>
                  </KeypadButton>
                );
              }
              if (key === 'del') {
                return (
                  <KeypadButton key={key} onPress={handleDelete}>
                    <KeypadButtonText>⌫</KeypadButtonText>
                  </KeypadButton>
                );
              }
              return (
                <KeypadButton
                  key={key}
                  onPress={() => handlePinInput(key)}
                  disabled={isLoading}
                >
                  <KeypadButtonText>{key}</KeypadButtonText>
                </KeypadButton>
              );
            })}
          </KeypadRow>
        ))}
      </KeypadContainer>
    );
  };

  return (
    <Container>
      <StatusBar barStyle="light-content" />
      <Content>
        <LogoContainer>
          <ToriCatFace size={100} />
          <AppName>Tori Wallet</AppName>
        </LogoContainer>

        <Title>PIN 입력</Title>
        <Subtitle>지갑 잠금을 해제하려면 PIN을 입력하세요</Subtitle>

        {isLoading ? (
          <LoadingContainer>
            <LoadingPercentText>{displayProgress}%</LoadingPercentText>
            <LoadingBarContainer>
              <AnimatedLoadingBarFill
                style={{
                  width: animatedProgress.interpolate({
                    inputRange: [0, 100],
                    outputRange: ['0%', '100%'],
                  }),
                }}
              />
            </LoadingBarContainer>
            <LoadingText>잠금 해제 중...</LoadingText>
          </LoadingContainer>
        ) : (
          renderPinDots()
        )}

        {renderKeypad()}
      </Content>
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
`;

const Content = styled.View`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.xl}px;
  justify-content: center;
  align-items: center;
`;

const LogoContainer = styled.View`
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.xl}px;
`;

const AppName = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 24px;
  font-weight: bold;
  margin-top: ${({ theme }) => theme.spacing.md}px;
`;

const Title = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 20px;
  font-weight: 600;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const Subtitle = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
  text-align: center;
  margin-bottom: ${({ theme }) => theme.spacing.xl}px;
`;

const LoadingContainer = styled.View`
  height: 100px;
  justify-content: center;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const LoadingPercentText = styled.Text`
  color: ${({ theme }) => theme.colors.primary};
  font-size: 32px;
  font-weight: 700;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const LoadingBarContainer = styled.View`
  width: 200px;
  height: 6px;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: 3px;
  overflow: hidden;
`;

const LoadingBarFill = styled.View`
  height: 100%;
  background-color: ${({ theme }) => theme.colors.primary};
  border-radius: 3px;
`;

const AnimatedLoadingBarFill = Animated.createAnimatedComponent(LoadingBarFill);

const LoadingText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
  margin-top: ${({ theme }) => theme.spacing.sm}px;
`;

const PinDotsContainer = styled.View`
  flex-direction: row;
  justify-content: center;
  margin-bottom: ${({ theme }) => theme.spacing.xxl}px;
`;

const PinDot = styled.View<{ $filled: boolean }>`
  width: 16px;
  height: 16px;
  border-radius: 8px;
  background-color: ${({ theme, $filled }) =>
    $filled ? theme.colors.primary : theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.primary};
  margin: 0 8px;
`;

const KeypadContainer = styled.View`
  width: 100%;
  max-width: 300px;
`;

const KeypadRow = styled.View`
  flex-direction: row;
  justify-content: space-around;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const KeypadButton = styled.TouchableOpacity`
  width: 70px;
  height: 70px;
  border-radius: 35px;
  background-color: ${({ theme }) => theme.colors.surface};
  justify-content: center;
  align-items: center;
`;

const KeypadButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 24px;
  font-weight: 600;
`;

export default UnlockScreen;
