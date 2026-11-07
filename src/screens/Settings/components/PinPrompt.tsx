/**
 * 설정 화면 PIN 확인 단계 (공용 PinPad + usePinVerification)
 *
 * 6자리를 모두 입력하면 자동으로 확인한다. 실패/잠금 메시지는 화면 낭독기에 알린다.
 */

import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import styled, { useTheme } from 'styled-components/native';
import { AppModal } from '@/components/common/AppModal';
import { PinPad } from '@/components/common/PinPad';
import { Screen } from '@/components/common/Screen';
import { ScreenHeader } from '@/components/common/ScreenHeader';
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

  const submit = useCallback(
    async (value: string) => {
      const result = await verify(value);
      setPin('');
      if (result.status === 'verified') onVerified(result.mnemonic, value);
    },
    [verify, onVerified, setPin],
  );

  const handleDigit = useCallback(
    (digit: string) => {
      if (isVerifying || pinRef.current.length >= PIN_LENGTH) return;
      clearError();
      const next = pinRef.current + digit;
      setPin(next);
      if (next.length === PIN_LENGTH) submit(next);
    },
    [clearError, isVerifying, setPin, submit],
  );

  const handleDelete = useCallback(() => {
    setPin(pinRef.current.slice(0, -1));
  }, [setPin]);

  return (
    <Wrapper testID={`${testIDPrefix}-prompt`}>
      <Description>{description}</Description>
      {error ? (
        <ErrorMessage testID={`${testIDPrefix}-error`}>{error}</ErrorMessage>
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
        disabled={isVerifying}
        error={!!error}
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
      <Screen testID={testID}>
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
