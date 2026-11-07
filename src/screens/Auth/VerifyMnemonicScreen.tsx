/**
 * 복구 구문 확인 화면 (백업 검증)
 */

import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import styled from 'styled-components/native';
import {
  Keyboard,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextInput,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '@/navigation/AuthNavigator';
import { useTheme } from '@/hooks/useTheme';
import { walletService } from '@/services/walletService';
import { onboardingVault } from '@/services/onboardingVault';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { errorFeedback } from '@/utils/haptics';

type NavigationProp = NativeStackNavigationProp<
  AuthStackParamList,
  'VerifyMnemonic'
>;
const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1 },
});

const VERIFY_WORD_COUNT = 3;

/** 서로 다른 단어 위치를 최대 count개 무작위로 골라 오름차순으로 반환한다. */
export function pickVerificationIndices(
  wordCount: number,
  count: number = VERIFY_WORD_COUNT,
  random: () => number = Math.random,
): number[] {
  const total = Math.max(0, Math.floor(wordCount));
  const pool = Array.from({ length: total }, (_, index) => index);
  // Fisher–Yates 부분 셔플: 단어 수가 count보다 적어도 무한 루프에 빠지지 않는다.
  const picks = Math.min(count, total);
  for (let i = 0; i < picks; i += 1) {
    const j = i + Math.floor(random() * (total - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, picks).sort((a, b) => a - b);
}

function VerifyMnemonicScreen(): React.JSX.Element {
  const { theme, isDarkMode } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const mnemonic = onboardingVault.getSnapshot()?.mnemonic || '';

  useEffect(() => {
    if (!mnemonic) navigation.navigate('Welcome');
  }, [mnemonic, navigation]);

  const words = useMemo(
    () => (mnemonic ? mnemonic.split(' ') : []),
    [mnemonic],
  );

  // 무작위로 단어 3개 선택 (검증용)
  const verificationIndices = useMemo(
    () => pickVerificationIndices(words.length),
    [words.length],
  );

  const [inputs, setInputs] = useState<string[]>(() =>
    Array(VERIFY_WORD_COUNT).fill(''),
  );
  const [errors, setErrors] = useState<boolean[]>(() =>
    Array(VERIFY_WORD_COUNT).fill(false),
  );
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  const handleInputChange = useCallback((index: number, value: string) => {
    setInputs(prev => {
      const newInputs = [...prev];
      newInputs[index] = value.toLowerCase().trim();
      return newInputs;
    });
    setErrors(prev => {
      const newErrors = [...prev];
      newErrors[index] = false;
      return newErrors;
    });
    setSummaryError(null);
  }, []);

  const isComplete =
    verificationIndices.length > 0 &&
    verificationIndices.every((_, inputIdx) => inputs[inputIdx]?.length > 0);

  const handleVerify = useCallback(() => {
    if (!isComplete) return;
    const newErrors = verificationIndices.map(
      (wordIdx, inputIdx) => inputs[inputIdx] !== words[wordIdx],
    );

    if (newErrors.some(Boolean)) {
      setErrors(newErrors);
      setSummaryError('입력한 단어가 올바르지 않습니다. 다시 확인해주세요.');
      errorFeedback();
      const firstWrong = newErrors.findIndex(Boolean);
      inputRefs.current[firstWrong]?.focus();
      return;
    }

    Keyboard.dismiss();
    // 검증 성공 - 지갑 주소 생성하고 PIN 설정으로 이동
    const account = walletService.deriveAccount(mnemonic, 0);
    onboardingVault.setWalletAddress(account.address);
    navigation.navigate('SetPin');
  }, [inputs, isComplete, verificationIndices, words, mnemonic, navigation]);

  return (
    <Container>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScreenHeader
        onBack={() => navigation.goBack()}
        backTestID="verify-back"
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        keyboardDismissMode={Platform.OS === 'ios' ? 'on-drag' : undefined}
      >
        <Content>
          <Title accessibilityRole="header">복구 구문 확인</Title>
          <Description>
            백업이 올바르게 되었는지 확인합니다.{'\n'}
            아래 빈칸에 해당하는 단어를 입력해주세요.
          </Description>

          <VerificationContainer>
            {verificationIndices.map((wordIdx, inputIdx) => {
              const isLast = inputIdx === verificationIndices.length - 1;
              return (
                <InputRow key={wordIdx}>
                  <WordNumber nativeID={`verify-label-${inputIdx}`}>
                    {wordIdx + 1}번째 단어
                  </WordNumber>
                  <WordInput
                    ref={(ref: TextInput | null) => {
                      inputRefs.current[inputIdx] = ref;
                    }}
                    testID={`verify-word-${inputIdx}`}
                    value={inputs[inputIdx]}
                    onChangeText={text => handleInputChange(inputIdx, text)}
                    placeholder="단어를 입력하세요"
                    placeholderTextColor={theme.colors.textTertiary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    autoComplete="off"
                    importantForAutofill="no"
                    returnKeyType={isLast ? 'done' : 'next'}
                    submitBehavior={isLast ? 'blurAndSubmit' : 'submit'}
                    onSubmitEditing={() => {
                      if (isLast) handleVerify();
                      else inputRefs.current[inputIdx + 1]?.focus();
                    }}
                    accessibilityLabel={`${wordIdx + 1}번째 단어 입력`}
                    $hasError={errors[inputIdx]}
                  />
                  {errors[inputIdx] && (
                    <ErrorText>올바른 단어를 입력해주세요</ErrorText>
                  )}
                </InputRow>
              );
            })}
          </VerificationContainer>

          {summaryError ? (
            <SummaryError accessibilityRole="alert" testID="verify-error">
              {summaryError}
            </SummaryError>
          ) : null}

          <HintBox>
            <HintIcon importantForAccessibility="no">💡</HintIcon>
            <HintText>
              힌트: 이전 화면에서 적어둔 복구 구문을 확인하세요.
            </HintText>
          </HintBox>

          <Spacer />

          <VerifyButton
            testID="verify-confirm"
            onPress={handleVerify}
            disabled={!isComplete}
            $enabled={isComplete}
            accessibilityRole="button"
            accessibilityState={{ disabled: !isComplete }}
          >
            <VerifyButtonText $enabled={isComplete}>확인</VerifyButtonText>
          </VerifyButton>
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
    ${({ theme }) => theme.spacing.lg}px;
`;

const Title = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.h1.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.h1.fontWeight};
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const Description = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  line-height: 24px;
  margin-bottom: ${({ theme }) => theme.spacing.xl}px;
`;

const VerificationContainer = styled.View`
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const InputRow = styled.View`
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const WordNumber = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
`;

const WordInput = styled.TextInput<{ $hasError: boolean }>`
  min-height: ${({ theme }) => theme.touchTarget + 4}px;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.sm}px
    ${({ theme }) => theme.spacing.md}px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  border-width: 1px;
  border-color: ${({ theme, $hasError }) =>
    $hasError ? theme.colors.error : theme.colors.border};
`;

const ErrorText = styled.Text`
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
`;

const SummaryError = styled.Text`
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const HintBox = styled.View`
  flex-direction: row;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  align-items: center;
`;

const HintIcon = styled.Text`
  font-size: 20px;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const HintText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  flex: 1;
`;

const Spacer = styled.View`
  flex: 1;
  min-height: ${({ theme }) => theme.spacing.lg}px;
`;

const VerifyButton = styled.TouchableOpacity<{ $enabled: boolean }>`
  background-color: ${({ theme, $enabled }) =>
    $enabled ? theme.colors.primary : theme.colors.disabledBackground};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  min-height: ${({ theme }) => theme.touchTarget + 8}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  align-items: center;
  justify-content: center;
`;

const VerifyButtonText = styled.Text<{ $enabled: boolean }>`
  color: ${({ theme, $enabled }) =>
    $enabled ? theme.colors.onPrimary : theme.colors.disabledText};
  font-size: ${({ theme }) => theme.typography.button.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.button.fontWeight};
`;

export default VerifyMnemonicScreen;
