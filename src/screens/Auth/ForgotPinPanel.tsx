/**
 * PIN 분실 안내 및 지갑 초기화 패널
 *
 * PIN은 기기에서 복구 구문을 암호화하는 데에만 쓰이므로 찾거나 재설정할 수 없다.
 * 유일한 방법은 지갑을 초기화하고 복구 구문으로 다시 가져오는 것이다.
 * 실수로 지갑을 지우지 않도록 확인 문구를 직접 입력해야 초기화할 수 있다.
 *
 * 잠금 오버레이(Modal) 안에서도 동작해야 하므로 별도 Modal 없이 잠금 화면
 * 내용 자리에 렌더링한다.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from 'react-native';
import styled from 'styled-components/native';
import { useTheme } from '@/hooks/useTheme';
import { errorFeedback } from '@/utils/haptics';

export const RESET_CONFIRM_WORD = '초기화';

interface ForgotPinPanelProps {
  onCancel: () => void;
  /** 지갑 초기화. 실패하면 reject 한다. */
  onReset: () => Promise<void>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
});

export function ForgotPinPanel({
  onCancel,
  onReset,
}: ForgotPinPanelProps): React.JSX.Element {
  const { theme } = useTheme();
  const [confirmText, setConfirmText] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const canReset = confirmText.trim() === RESET_CONFIRM_WORD && !isResetting;

  const handleReset = useCallback(async () => {
    if (confirmText.trim() !== RESET_CONFIRM_WORD || isResetting) return;
    setIsResetting(true);
    setError(null);
    try {
      await onReset();
    } catch (reason) {
      if (!mounted.current) return;
      errorFeedback();
      setError(
        reason instanceof Error && reason.message
          ? reason.message
          : '지갑을 초기화하지 못했습니다. 다시 시도해주세요.',
      );
    } finally {
      if (mounted.current) setIsResetting(false);
    }
  }, [confirmText, isResetting, onReset]);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        testID="forgot-pin-panel"
      >
        <Content>
          <Title accessibilityRole="header">PIN을 잊으셨나요?</Title>
          <Body>
            PIN은 이 기기에서 지갑을 암호화하는 데에만 사용되며 어디에도
            전송되거나 보관되지 않습니다. 그래서 PIN을 찾거나 재설정할 수
            없습니다.
          </Body>
          <Body>
            유일한 방법은 이 기기에서 지갑을 초기화한 뒤, 백업해 둔 복구
            구문으로 지갑을 다시 가져오고 새 PIN을 설정하는 것입니다.
          </Body>

          <WarningBox accessibilityRole="alert">
            <WarningTitle>복구 구문이 있는지 먼저 확인하세요</WarningTitle>
            <WarningText>
              복구 구문 없이 초기화하면 이 지갑의 자산에 영구적으로 접근할 수
              없습니다. 초기화는 되돌릴 수 없습니다.
            </WarningText>
          </WarningBox>

          <StepList>
            <StepText>1. 아래에서 지갑을 초기화합니다.</StepText>
            <StepText>
              2. ‘기존 지갑 가져오기’에서 복구 구문을 입력합니다.
            </StepText>
            <StepText>3. 새 PIN을 설정합니다.</StepText>
          </StepList>

          <InputLabel nativeID="forgot-pin-confirm-label">
            계속하려면 ‘{RESET_CONFIRM_WORD}’를 입력하세요
          </InputLabel>
          <ConfirmInput
            testID="forgot-pin-confirm-input"
            value={confirmText}
            onChangeText={text => {
              setConfirmText(text);
              setError(null);
            }}
            placeholder={RESET_CONFIRM_WORD}
            placeholderTextColor={theme.colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isResetting}
            returnKeyType="done"
            onSubmitEditing={handleReset}
            accessibilityLabel={`확인 문구 입력. ${RESET_CONFIRM_WORD}를 입력하세요`}
            accessibilityLabelledBy="forgot-pin-confirm-label"
          />

          {error ? (
            <ErrorText accessibilityRole="alert" testID="forgot-pin-error">
              {error}
            </ErrorText>
          ) : null}

          <ResetButton
            testID="forgot-pin-reset"
            onPress={handleReset}
            disabled={!canReset}
            $enabled={canReset}
            accessibilityRole="button"
            accessibilityLabel="지갑 초기화"
            accessibilityState={{ disabled: !canReset, busy: isResetting }}
          >
            {isResetting ? (
              <ActivityIndicator color={theme.colors.onError} />
            ) : (
              <ResetButtonText $enabled={canReset}>지갑 초기화</ResetButtonText>
            )}
          </ResetButton>

          <CancelButton
            testID="forgot-pin-cancel"
            onPress={onCancel}
            disabled={isResetting}
            accessibilityRole="button"
            accessibilityLabel="취소하고 PIN 입력으로 돌아가기"
          >
            <CancelButtonText>취소</CancelButtonText>
          </CancelButton>
        </Content>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const Content = styled.View`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.lg}px;
  justify-content: center;
`;

const Title = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.h2.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.h2.fontWeight};
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const Body = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  line-height: 21px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const WarningBox = styled.View`
  background-color: ${({ theme }) => theme.colors.errorSubtle};
  border: 1px solid ${({ theme }) => theme.colors.error};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin: ${({ theme }) => theme.spacing.sm}px 0;
`;

const WarningTitle = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  font-weight: 700;
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
`;

const WarningText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  line-height: 20px;
`;

const StepList = styled.View`
  margin: ${({ theme }) => theme.spacing.sm}px 0
    ${({ theme }) => theme.spacing.md}px;
`;

const StepText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  line-height: 22px;
`;

const InputLabel = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  font-weight: 600;
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
`;

const ConfirmInput = styled.TextInput`
  min-height: ${({ theme }) => theme.touchTarget + 4}px;
  background-color: ${({ theme }) => theme.colors.inputBackground};
  border: 1px solid ${({ theme }) => theme.colors.inputBorder};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: 0 ${({ theme }) => theme.spacing.md}px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
`;

const ErrorText = styled.Text`
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  margin-top: ${({ theme }) => theme.spacing.sm}px;
`;

const ResetButton = styled.TouchableOpacity<{ $enabled: boolean }>`
  min-height: ${({ theme }) => theme.touchTarget + 8}px;
  margin-top: ${({ theme }) => theme.spacing.lg}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme, $enabled }) =>
    $enabled ? theme.colors.error : theme.colors.disabledBackground};
`;

const ResetButtonText = styled.Text<{ $enabled: boolean }>`
  color: ${({ theme, $enabled }) =>
    $enabled ? theme.colors.onError : theme.colors.disabledText};
  font-size: ${({ theme }) => theme.typography.button.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.button.fontWeight};
`;

const CancelButton = styled.TouchableOpacity`
  min-height: ${({ theme }) => theme.touchTarget}px;
  margin-top: ${({ theme }) => theme.spacing.sm}px;
  align-items: center;
  justify-content: center;
`;

const CancelButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.button.fontSize}px;
`;

export default ForgotPinPanel;
