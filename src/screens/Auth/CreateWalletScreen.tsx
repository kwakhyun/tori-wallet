/**
 * Tori Wallet - Create Wallet Screen
 * 새 지갑 생성 - 니모닉 생성 화면
 */

import React, { useState, useCallback } from 'react';
import styled from 'styled-components/native';
import {
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '@/navigation/AuthNavigator';
import { walletService } from '@/services/walletService';

type NavigationProp = NativeStackNavigationProp<
  AuthStackParamList,
  'CreateWallet'
>;

function CreateWalletScreen(): React.JSX.Element {
  const navigation = useNavigation<NavigationProp>();
  const [isLoading, setIsLoading] = useState(false);
  const [wordCount, setWordCount] = useState<12 | 24>(12);

  const handleCreateWallet = useCallback(async () => {
    setIsLoading(true);
    try {
      // 니모닉 생성
      const mnemonic = walletService.generateMnemonic(wordCount);

      // 백업 화면으로 이동
      navigation.navigate('BackupMnemonic', { mnemonic });
    } catch (error) {
      console.error('Failed to create wallet:', error);
      Alert.alert('오류', '지갑 생성에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
  }, [navigation, wordCount]);

  return (
    <Container>
      <StatusBar barStyle="light-content" />
      <Content>
        <Header>
          <BackButton onPress={() => navigation.goBack()}>
            <BackButtonText>←</BackButtonText>
          </BackButton>
        </Header>

        <Title>새 지갑 만들기</Title>
        <Description>
          새로운 지갑을 생성합니다.{'\n'}
          복구 구문은 지갑을 복구하는 유일한 방법이므로{'\n'}
          안전하게 보관해야 합니다.
        </Description>

        <OptionSection>
          <OptionLabel>복구 구문 길이</OptionLabel>
          <OptionRow>
            <OptionButton
              $selected={wordCount === 12}
              onPress={() => setWordCount(12)}
            >
              <OptionButtonText $selected={wordCount === 12}>
                12 단어
              </OptionButtonText>
            </OptionButton>
            <OptionButton
              $selected={wordCount === 24}
              onPress={() => setWordCount(24)}
            >
              <OptionButtonText $selected={wordCount === 24}>
                24 단어
              </OptionButtonText>
            </OptionButton>
          </OptionRow>
          <OptionDescription>
            {wordCount === 12
              ? '일반적인 보안 수준에 적합합니다.'
              : '더 높은 보안 수준을 원하시면 선택하세요.'}
          </OptionDescription>
        </OptionSection>

        <WarningBox>
          <WarningIcon>⚠️</WarningIcon>
          <WarningText>
            복구 구문을 분실하면 지갑에 있는 자산을 영구적으로 잃게 됩니다.
            절대로 다른 사람과 공유하지 마세요.
          </WarningText>
        </WarningBox>

        <Spacer />

        <CreateButton onPress={handleCreateWallet} disabled={isLoading}>
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <CreateButtonText>지갑 생성하기</CreateButtonText>
          )}
        </CreateButton>
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

const OptionSection = styled.View`
  margin-bottom: ${({ theme }) => theme.spacing.xl}px;
`;

const OptionLabel = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  font-weight: 600;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const OptionRow = styled.View`
  flex-direction: row;
  gap: ${({ theme }) => theme.spacing.md}px;
`;

const OptionButton = styled.TouchableOpacity<{ $selected: boolean }>`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  border: 2px solid
    ${({ theme, $selected }) =>
      $selected ? theme.colors.primary : theme.colors.border};
  background-color: ${({ theme, $selected }) =>
    $selected ? theme.colors.primary + '20' : 'transparent'};
  align-items: center;
`;

const OptionButtonText = styled.Text<{ $selected: boolean }>`
  color: ${({ theme, $selected }) =>
    $selected ? theme.colors.primary : theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  font-weight: 600;
`;

const OptionDescription = styled.Text`
  color: ${({ theme }) => theme.colors.textTertiary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  margin-top: ${({ theme }) => theme.spacing.sm}px;
`;

const WarningBox = styled.View`
  flex-direction: row;
  background-color: ${({ theme }) => theme.colors.warning}20;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  border: 1px solid ${({ theme }) => theme.colors.warning}40;
`;

const WarningIcon = styled.Text`
  font-size: 20px;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const WarningText = styled.Text`
  flex: 1;
  color: ${({ theme }) => theme.colors.warning};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  line-height: 20px;
`;

const Spacer = styled.View`
  flex: 1;
`;

const CreateButton = styled.TouchableOpacity`
  background-color: ${({ theme }) => theme.colors.primary};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  align-items: center;
  opacity: ${({ disabled }) => (disabled ? 0.6 : 1)};
`;

const CreateButtonText = styled.Text`
  color: #ffffff;
  font-size: ${({ theme }) => theme.typography.button.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.button.fontWeight};
`;

export default CreateWalletScreen;
