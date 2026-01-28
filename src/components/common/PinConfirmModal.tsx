/**
 * 트랜잭션 전 PIN 확인 모달
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import styled from 'styled-components/native';
import { Modal, Alert, Vibration, Animated } from 'react-native';
import { walletService } from '@/services/walletService';

interface Props {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  message?: string;
}

export function PinConfirmModal({
  visible,
  onConfirm,
  onCancel,
  title = 'PIN 확인',
  message = '계속하려면 PIN을 입력하세요.',
}: Props) {
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [displayProgress, setDisplayProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);

  const MAX_ATTEMPTS = 5;

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

  useEffect(() => {
    if (visible) {
      setPin('');
      animatedProgress.setValue(0);
      setDisplayProgress(0);
      setError(null);
    }
  }, [visible, animatedProgress]);

  const handleVerify = useCallback(
    async (pinToVerify: string) => {
      if (pinToVerify.length !== 6) {
        setError('PIN은 6자리입니다.');
        return;
      }

      if (attempts >= MAX_ATTEMPTS) {
        Alert.alert(
          '접근 제한',
          '너무 많은 시도가 있었습니다. 잠시 후 다시 시도해주세요.',
          [{ text: '확인', onPress: onCancel }],
        );
        return;
      }

      setIsLoading(true);
      setError(null);
      setProgress(10);

      // 진행률 업데이트 간 딜레이
      await new Promise(resolve => setTimeout(resolve, 200));
      setProgress(30);
      await new Promise(resolve => setTimeout(resolve, 200));
      setProgress(50);

      try {
        const mnemonic = await walletService.retrieveMnemonicWithPin(
          pinToVerify,
        );

        await new Promise(resolve => setTimeout(resolve, 150));
        setProgress(70);
        await new Promise(resolve => setTimeout(resolve, 150));
        setProgress(85);

        if (mnemonic && walletService.validateMnemonic(mnemonic)) {
          await new Promise(resolve => setTimeout(resolve, 100));
          setProgress(100);
          setAttempts(0);
          onConfirm();
        } else {
          setProgress(0);
          const remainingAttempts = MAX_ATTEMPTS - attempts - 1;
          setAttempts(prev => prev + 1);
          setError(`PIN이 올바르지 않습니다. (${remainingAttempts}회 남음)`);
          Vibration.vibrate(200);
          setPin('');
        }
      } catch {
        setProgress(0);
        setError('PIN 확인에 실패했습니다.');
        setPin('');
      } finally {
        setIsLoading(false);
      }
    },
    [attempts, onConfirm, onCancel, setProgress],
  );

  const handleKeyPress = useCallback(
    (key: string) => {
      if (key === 'delete') {
        setPin(prev => prev.slice(0, -1));
      } else if (pin.length < 6) {
        const newPin = pin + key;
        setPin(newPin);

        // 6자리가 되면 자동 확인
        if (newPin.length === 6) {
          setTimeout(() => {
            handleVerify(newPin);
          }, 100);
        }
      }
    },
    [pin, handleVerify],
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onCancel}
    >
      <Overlay testID="pin-confirm-overlay">
        <Container testID="pin-confirm-container">
          <Title testID="pin-confirm-title">{title}</Title>
          <Message testID="pin-confirm-message">{message}</Message>

          {/* PIN 표시 */}
          <PinDisplay testID="pin-confirm-display">
            {[...Array(6)].map((_, index) => (
              <PinDot
                key={index}
                $filled={index < pin.length}
                testID={`pin-dot-${index}`}
              />
            ))}
          </PinDisplay>

          {error && <ErrorText testID="pin-confirm-error">{error}</ErrorText>}

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
              <LoadingText>확인 중...</LoadingText>
            </LoadingContainer>
          ) : (
            <>
              {/* 숫자 키패드 */}
              <Keypad testID="pin-confirm-keypad">
                {[
                  ['1', '2', '3'],
                  ['4', '5', '6'],
                  ['7', '8', '9'],
                  ['', '0', 'delete'],
                ].map((row, rowIndex) => (
                  <KeypadRow key={rowIndex}>
                    {row.map(key => (
                      <KeyButton
                        key={key || `empty-${rowIndex}`}
                        onPress={() => key && handleKeyPress(key)}
                        disabled={!key}
                        activeOpacity={0.7}
                        testID={key ? `pin-key-${key}` : undefined}
                      >
                        {key === 'delete' ? (
                          <KeyText>⌫</KeyText>
                        ) : (
                          <KeyText>{key}</KeyText>
                        )}
                      </KeyButton>
                    ))}
                  </KeypadRow>
                ))}
              </Keypad>

              <ButtonContainer>
                <CancelButton onPress={onCancel} testID="pin-confirm-cancel">
                  <CancelButtonText>취소</CancelButtonText>
                </CancelButton>
              </ButtonContainer>
            </>
          )}
        </Container>
      </Overlay>
    </Modal>
  );
}

// Styled Components
const Overlay = styled.View`
  flex: 1;
  background-color: rgba(0, 0, 0, 0.8);
  justify-content: center;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.lg}px;
`;

const Container = styled.View`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.xl}px;
  padding: ${({ theme }) => theme.spacing.xl}px;
  width: 100%;
  max-width: 340px;
  align-items: center;
`;

const Title = styled.Text`
  font-size: 22px;
  font-weight: bold;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const Message = styled.Text`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const PinDisplay = styled.View`
  flex-direction: row;
  justify-content: center;
  gap: 12px;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const PinDot = styled.View<{ $filled: boolean }>`
  width: 16px;
  height: 16px;
  border-radius: 8px;
  background-color: ${({ $filled, theme }) =>
    $filled ? theme.colors.primary : theme.colors.border};
`;

const ErrorText = styled.Text`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.error};
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const LoadingContainer = styled.View`
  padding: ${({ theme }) => theme.spacing.xl}px;
  align-items: center;
`;

const LoadingPercentText = styled.Text`
  color: ${({ theme }) => theme.colors.primary};
  font-size: 32px;
  font-weight: 700;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const LoadingBarContainer = styled.View`
  width: 180px;
  height: 6px;
  background-color: ${({ theme }) => theme.colors.border};
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

const Keypad = styled.View`
  width: 100%;
  margin-top: ${({ theme }) => theme.spacing.md}px;
`;

const KeypadRow = styled.View`
  flex-direction: row;
  justify-content: center;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const KeyButton = styled.TouchableOpacity`
  width: 70px;
  height: 54px;
  justify-content: center;
  align-items: center;
  margin: 0 ${({ theme }) => theme.spacing.sm}px;
  background-color: ${({ theme }) => theme.colors.backgroundSecondary};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
`;

const KeyText = styled.Text`
  font-size: 24px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const ButtonContainer = styled.View`
  width: 100%;
  margin-top: ${({ theme }) => theme.spacing.lg}px;
`;

const CancelButton = styled.TouchableOpacity`
  padding: ${({ theme }) => theme.spacing.md}px;
  align-items: center;
`;

const CancelButtonText = styled.Text`
  font-size: 16px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export default PinConfirmModal;
