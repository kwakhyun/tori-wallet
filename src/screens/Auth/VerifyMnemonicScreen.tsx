/**
 * 니모닉 검증 화면 (백업 확인)
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import styled from 'styled-components/native';
import { useTheme } from '@/hooks/useTheme';
import {
  SafeAreaView,
  StatusBar,
  ScrollView,
  Alert,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '@/navigation/AuthNavigator';
import { walletService } from '@/services/walletService';
import { onboardingVault } from '@/services/onboardingVault';

type NavigationProp = NativeStackNavigationProp<
  AuthStackParamList,
  'VerifyMnemonic'
>;
const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1 },
});

function VerifyMnemonicScreen(): React.JSX.Element {
  const { isDarkMode } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const mnemonic = onboardingVault.getSnapshot()?.mnemonic || '';

  useEffect(() => {
    if (!mnemonic) navigation.navigate('Welcome');
  }, [mnemonic, navigation]);

  const words = useMemo(() => mnemonic.split(' '), [mnemonic]);

  // 랜덤으로 3개 단어 선택 (검증용)
  const verificationIndices = useMemo(() => {
    const indices: number[] = [];
    while (indices.length < 3) {
      const idx = Math.floor(Math.random() * words.length);
      if (!indices.includes(idx)) {
        indices.push(idx);
      }
    }
    return indices.sort((a, b) => a - b);
  }, [words.length]);

  const [inputs, setInputs] = useState<string[]>(['', '', '']);
  const [errors, setErrors] = useState<boolean[]>([false, false, false]);

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
  }, []);

  const handleVerify = useCallback(() => {
    const newErrors = verificationIndices.map(
      (wordIdx, inputIdx) => inputs[inputIdx] !== words[wordIdx],
    );

    if (newErrors.some(e => e)) {
      setErrors(newErrors);
      Alert.alert(
        '오류',
        '입력한 단어가 올바르지 않습니다. 다시 확인해주세요.',
      );
      return;
    }

    // 검증 성공 - 지갑 주소 생성하고 PIN 설정으로 이동
    const account = walletService.deriveAccount(mnemonic, 0);
    onboardingVault.setWalletAddress(account.address);
    navigation.navigate('SetPin');
  }, [inputs, verificationIndices, words, mnemonic, navigation]);

  const isComplete = inputs.every(input => input.length > 0);

  return (
    <Container>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Content>
          <Header>
            <BackButton onPress={() => navigation.goBack()}>
              <BackButtonText>←</BackButtonText>
            </BackButton>
          </Header>

          <Title>복구 구문 확인</Title>
          <Description>
            백업이 올바르게 되었는지 확인합니다.{'\n'}
            아래 빈칸에 해당하는 단어를 입력해주세요.
          </Description>

          <VerificationContainer>
            {verificationIndices.map((wordIdx, inputIdx) => (
              <InputRow key={wordIdx}>
                <WordNumber>{wordIdx + 1}번째 단어</WordNumber>
                <WordInput
                  value={inputs[inputIdx]}
                  onChangeText={text => handleInputChange(inputIdx, text)}
                  placeholder="단어를 입력하세요"
                  placeholderTextColor="#71717A"
                  autoCapitalize="none"
                  autoCorrect={false}
                  $hasError={errors[inputIdx]}
                />
                {errors[inputIdx] && (
                  <ErrorText>올바른 단어를 입력해주세요</ErrorText>
                )}
              </InputRow>
            ))}
          </VerificationContainer>

          <HintBox>
            <HintIcon>💡</HintIcon>
            <HintText>
              힌트: 이전 화면에서 적어둔 복구 구문을 확인하세요.
            </HintText>
          </HintBox>

          <Spacer />

          <VerifyButton onPress={handleVerify} disabled={!isComplete}>
            <VerifyButtonText>확인</VerifyButtonText>
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
  padding: ${({ theme }) => theme.spacing.lg}px;
`;

const Header = styled.View`
  flex-direction: row;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const BackButton = styled.TouchableOpacity`
  padding: ${({ theme }) => theme.spacing.sm}px;
`;

const BackButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 24px;
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
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
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
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
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
`;

const VerifyButton = styled.TouchableOpacity<{ disabled: boolean }>`
  background-color: ${({ theme, disabled }) =>
    disabled ? theme.colors.border : theme.colors.primary};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  align-items: center;
`;

const VerifyButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.button.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.button.fontWeight};
`;

export default VerifyMnemonicScreen;
