/**
 * 니모닉 백업 화면
 */

import React, { useEffect, useState, useMemo } from 'react';
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
import { onboardingVault } from '@/services/onboardingVault';

type NavigationProp = NativeStackNavigationProp<
  AuthStackParamList,
  'BackupMnemonic'
>;
const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1 },
});

function BackupMnemonicScreen(): React.JSX.Element {
  const { isDarkMode } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const mnemonic = onboardingVault.getSnapshot()?.mnemonic || '';

  useEffect(() => {
    if (!mnemonic) navigation.navigate('Welcome');
  }, [mnemonic, navigation]);

  const [isRevealed, setIsRevealed] = useState(false);
  const [hasConfirmedBackup, setHasConfirmedBackup] = useState(false);

  const words = useMemo(() => mnemonic.split(' '), [mnemonic]);

  const handleReveal = () => {
    Alert.alert(
      '주의',
      '복구 구문을 다른 사람에게 보여주거나 공유하지 마세요.\n이 화면을 촬영하지 마세요.',
      [
        { text: '취소', style: 'cancel' },
        { text: '확인', onPress: () => setIsRevealed(true) },
      ],
    );
  };

  const handleContinue = () => {
    if (!hasConfirmedBackup) {
      Alert.alert('백업 확인', '복구 구문을 안전한 곳에 적어두셨나요?', [
        { text: '아니요', style: 'cancel' },
        {
          text: '네, 적어뒀습니다',
          onPress: () => {
            setHasConfirmedBackup(true);
            navigation.navigate('VerifyMnemonic');
          },
        },
      ]);
    } else {
      navigation.navigate('VerifyMnemonic');
    }
  };

  return (
    <Container>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Content>
          <Header>
            <BackButton onPress={() => onboardingVault.clear()}>
              <BackButtonText>←</BackButtonText>
            </BackButton>
          </Header>

          <Title>복구 구문 백업</Title>
          <Description>
            아래 {words.length}개의 단어를 순서대로 안전한 곳에 적어두세요.
            {'\n'}이 구문은 지갑을 복구하는 유일한 방법입니다.
          </Description>

          <MnemonicContainer>
            {!isRevealed ? (
              <BlurOverlay>
                <RevealButton onPress={handleReveal}>
                  <RevealIcon>👁️</RevealIcon>
                  <RevealText>탭하여 복구 구문 보기</RevealText>
                </RevealButton>
              </BlurOverlay>
            ) : (
              <WordsGrid>
                {words.map((word, index) => (
                  <WordItem key={index}>
                    <WordNumber>{index + 1}</WordNumber>
                    <WordText>{word}</WordText>
                  </WordItem>
                ))}
              </WordsGrid>
            )}
          </MnemonicContainer>

          {isRevealed && (
            <WarningBox>
              <WarningIcon>⚠️</WarningIcon>
              <WarningText>
                • 종이에 적어서 안전한 곳에 보관하세요{'\n'}• 스크린샷을 찍지
                마세요{'\n'}• 누구에게도 공유하지 마세요
              </WarningText>
            </WarningBox>
          )}

          <Spacer />

          <ContinueButton onPress={handleContinue} disabled={!isRevealed}>
            <ContinueButtonText>
              {isRevealed ? '다음 단계로' : '복구 구문을 먼저 확인하세요'}
            </ContinueButtonText>
          </ContinueButton>
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

const MnemonicContainer = styled.View`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.lg}px;
  padding: ${({ theme }) => theme.spacing.lg}px;
  min-height: 200px;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const BlurOverlay = styled.View`
  flex: 1;
  justify-content: center;
  align-items: center;
  min-height: 180px;
`;

const RevealButton = styled.TouchableOpacity`
  align-items: center;
`;

const RevealIcon = styled.Text`
  font-size: 48px;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const RevealText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
`;

const WordsGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: space-between;
`;

const WordItem = styled.View`
  width: 48%;
  flex-direction: row;
  align-items: center;
  background-color: ${({ theme }) => theme.colors.backgroundTertiary};
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  padding: ${({ theme }) => theme.spacing.sm}px
    ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const WordNumber = styled.Text`
  color: ${({ theme }) => theme.colors.textTertiary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  width: 24px;
`;

const WordText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  font-weight: 500;
`;

const WarningBox = styled.View`
  flex-direction: row;
  background-color: ${({ theme }) => theme.colors.error}15;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  border: 1px solid ${({ theme }) => theme.colors.error}30;
`;

const WarningIcon = styled.Text`
  font-size: 20px;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const WarningText = styled.Text`
  flex: 1;
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  line-height: 20px;
`;

const Spacer = styled.View`
  flex: 1;
  min-height: 20px;
`;

const ContinueButton = styled.TouchableOpacity<{ disabled?: boolean }>`
  background-color: ${({ theme, disabled }) =>
    disabled ? theme.colors.border : theme.colors.primary};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  align-items: center;
  margin-top: ${({ theme }) => theme.spacing.lg}px;
`;

const ContinueButtonText = styled.Text`
  color: #ffffff;
  font-size: ${({ theme }) => theme.typography.button.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.button.fontWeight};
`;

export default BackupMnemonicScreen;
