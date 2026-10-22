/**
 * 트랜잭션 전 PIN 확인 모달
 */

import React, { useState, useCallback, useEffect } from 'react';
import styled from 'styled-components/native';
import { Modal, Vibration, ActivityIndicator } from 'react-native';
import { useAuthentication } from '@/hooks/useAuthentication';
import { PinLockedError } from '@/services/pinAttemptService';

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
  const [error, setError] = useState<string | null>(null);
  const {
    authenticate,
    cancel,
    isAuthenticating: isLoading,
  } = useAuthentication();

  useEffect(() => {
    cancel();
    setPin('');
    setError(null);
  }, [visible, cancel]);

  useEffect(() => {
    if (!isLoading) setPin('');
  }, [isLoading]);

  const handleCancel = useCallback(() => {
    cancel();
    setPin('');
    onCancel();
  }, [cancel, onCancel]);

  const handleVerify = useCallback(
    async (value: string) => {
      try {
        const authenticated = await authenticate(value);
        if (authenticated === null) return;
        if (authenticated) {
          setPin('');
          onConfirm();
        } else {
          setError('PIN이 올바르지 않습니다.');
          Vibration.vibrate(200);
          setPin('');
        }
      } catch (reason) {
        setPin('');
        setError(
          reason instanceof PinLockedError
            ? reason.message
            : 'PIN 확인에 실패했습니다.',
        );
      }
    },
    [authenticate, onConfirm],
  );

  const handleKeyPress = useCallback(
    (key: string) => {
      if (isLoading || !visible) return;
      if (key === 'delete') {
        setPin(prev => prev.slice(0, -1));
      } else if (pin.length < 6) {
        const next = pin + key;
        setPin(next);
        setError(null);
        if (next.length === 6) handleVerify(next);
      }
    },
    [handleVerify, isLoading, pin, visible],
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleCancel}
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
              <ActivityIndicator />
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
            </>
          )}
          <ButtonContainer>
            <CancelButton onPress={handleCancel} testID="pin-confirm-cancel">
              <CancelButtonText>취소</CancelButtonText>
            </CancelButton>
          </ButtonContainer>
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
