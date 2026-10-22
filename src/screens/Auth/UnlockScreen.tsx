/**
 * 잠금 해제 PIN 입력 화면
 */

import React, { useState, useCallback, useEffect } from 'react';
import styled from 'styled-components/native';
import { useShallow } from 'zustand/react/shallow';
import { useTheme } from '@/hooks/useTheme';
import {
  SafeAreaView,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useWalletStore } from '@/store/walletStore';
import { walletService } from '@/services/walletService';
import { useAuthentication } from '@/hooks/useAuthentication';
import { PinLockedError } from '@/services/pinAttemptService';
import { ToriCatFace } from '@/components/common/Logo';

function UnlockScreen(): React.JSX.Element {
  const { isDarkMode } = useTheme();
  const { unlock } = useWalletStore(
    useShallow(state => ({ unlock: state.unlock })),
  );
  const [pin, setPin] = useState('');
  const { authenticate, isAuthenticating: isLoading } = useAuthentication();

  useEffect(() => {
    if (!isLoading) setPin('');
  }, [isLoading]);

  const tryBiometric = useCallback(async () => {
    try {
      if (
        !(await walletService.isBiometricEnabled()) ||
        !(await walletService.isBiometricSupported())
      )
        return;
      if (await authenticate()) unlock();
    } catch {
      // 생체인증 취소/실패 후에는 PIN을 사용할 수 있다.
    }
  }, [authenticate, unlock]);

  useEffect(() => {
    tryBiometric();
  }, [tryBiometric]);

  const handlePinInput = useCallback(
    async (digit: string) => {
      if (isLoading || pin.length >= 6) return;
      const next = pin + digit;
      setPin(next);
      if (next.length !== 6) return;
      try {
        const authenticated = await authenticate(next);
        if (authenticated === null) return;
        setPin('');
        if (authenticated) unlock();
        else Alert.alert('오류', 'PIN이 올바르지 않습니다.');
      } catch (error) {
        setPin('');
        Alert.alert(
          error instanceof PinLockedError ? '접근 제한' : '오류',
          error instanceof PinLockedError
            ? error.message
            : 'PIN 확인에 실패했습니다.',
        );
      }
    },
    [authenticate, isLoading, pin, unlock],
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
                  <KeypadButton
                    key={key}
                    onPress={handleBiometric}
                    disabled={isLoading}
                  >
                    <KeypadButtonText>🔐</KeypadButtonText>
                  </KeypadButton>
                );
              }
              if (key === 'del') {
                return (
                  <KeypadButton
                    key={key}
                    onPress={handleDelete}
                    disabled={isLoading}
                  >
                    <KeypadButtonText>⌫</KeypadButtonText>
                  </KeypadButton>
                );
              }
              return (
                <KeypadButton
                  key={key}
                  testID={`unlock-key-${key}`}
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
    <Container testID="unlock-screen">
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <Content>
        <LogoContainer>
          <ToriCatFace size={100} />
          <AppName>Tori Wallet</AppName>
        </LogoContainer>

        <Title>PIN 입력</Title>
        <Subtitle>지갑 잠금을 해제하려면 PIN을 입력하세요</Subtitle>

        {isLoading ? (
          <LoadingContainer>
            <ActivityIndicator />
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
