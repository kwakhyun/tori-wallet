/**
 * 웰컴 화면
 *
 * 진행 중이던 지갑 생성/가져오기가 보안상 초기화되어 이 화면으로 돌아왔다면
 * (앱 백그라운드 전환 또는 10분 경과) 그 이유를 안내한다.
 */

import React, { useCallback, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import styled from 'styled-components/native';
import { ScrollView, StatusBar, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '@/navigation/AuthNavigator';
import { ToriCatFace } from '@/components/common/Logo';
import { IconButton } from '@/components/common/IconButton';
import { useTheme } from '@/hooks/useTheme';
import {
  onboardingVault,
  type OnboardingResetNotice,
} from '@/services/onboardingVault';

export function describeResetNotice(notice: OnboardingResetNotice): string {
  // 조사: '지갑 생성이' / '지갑 가져오기가'
  const flow = notice.source === 'import' ? '지갑 가져오기가' : '지갑 생성이';
  return notice.reason === 'expired'
    ? `보안을 위해 10분이 지나 진행 중이던 ${flow} 초기화되었습니다. 복구 구문은 기기에 저장되지 않았으니 처음부터 다시 진행해주세요.`
    : `보안을 위해 앱을 벗어나는 동안 진행 중이던 ${flow} 초기화되었습니다. 복구 구문은 기기에 저장되지 않았으니 처음부터 다시 진행해주세요.`;
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1 },
});

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
`;

const Content = styled.View`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.xl}px;
  justify-content: center;
`;

const NoticeBox = styled.View`
  flex-direction: row;
  align-items: flex-start;
  background-color: ${({ theme }) => theme.colors.warningSubtle};
  border: 1px solid ${({ theme }) => theme.colors.warning};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.sm}px
    ${({ theme }) => theme.spacing.xs}px ${({ theme }) => theme.spacing.sm}px
    ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.xl}px;
`;

const NoticeText = styled.Text`
  flex: 1;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  line-height: 20px;
  padding-top: ${({ theme }) => theme.spacing.sm}px;
`;

const LogoContainer = styled.View`
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.xxl}px;
`;

const AppName = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.h1.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.h1.fontWeight};
`;

const Tagline = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  text-align: center;
  margin-top: ${({ theme }) => theme.spacing.sm}px;
`;

const ButtonContainer = styled.View`
  margin-top: ${({ theme }) => theme.spacing.xxl}px;
  gap: ${({ theme }) => theme.spacing.md}px;
`;

const PrimaryButton = styled.TouchableOpacity`
  background-color: ${({ theme }) => theme.colors.primary};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  min-height: ${({ theme }) => theme.touchTarget + 8}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  align-items: center;
  justify-content: center;
`;

const PrimaryButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.onPrimary};
  font-size: ${({ theme }) => theme.typography.button.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.button.fontWeight};
`;

const SecondaryButton = styled.TouchableOpacity`
  background-color: transparent;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  min-height: ${({ theme }) => theme.touchTarget + 8}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  align-items: center;
  justify-content: center;
`;

const SecondaryButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.button.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.button.fontWeight};
`;

type NavigationProp = NativeStackNavigationProp<AuthStackParamList, 'Welcome'>;

function WelcomeScreen(): React.JSX.Element {
  const { isDarkMode } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  // AuthNavigator는 보관소가 비워질 때 다시 마운트되므로 마운트 시점에 읽으면 된다.
  const [notice, setNotice] = useState(() => onboardingVault.getResetNotice());

  const dismissNotice = useCallback(() => {
    onboardingVault.dismissResetNotice();
    setNotice(null);
  }, []);

  const goTo = useCallback(
    (route: 'CreateWallet' | 'ImportWallet') => {
      if (notice) dismissNotice();
      navigation.navigate(route);
    },
    [dismissNotice, navigation, notice],
  );

  return (
    <Container>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
        <Content>
          {notice ? (
            <NoticeBox testID="welcome-reset-notice" accessibilityRole="alert">
              <NoticeText>{describeResetNotice(notice)}</NoticeText>
              <IconButton
                icon="✕"
                accessibilityLabel="안내 닫기"
                onPress={dismissNotice}
                testID="welcome-reset-notice-dismiss"
              />
            </NoticeBox>
          ) : null}

          <LogoContainer>
            <ToriCatFace size={140} />
            <AppName>Tori Wallet</AppName>
            <Tagline>안전하고 간편한 Web3 지갑</Tagline>
          </LogoContainer>

          <ButtonContainer>
            <PrimaryButton
              onPress={() => goTo('CreateWallet')}
              accessibilityRole="button"
            >
              <PrimaryButtonText>새 지갑 만들기</PrimaryButtonText>
            </PrimaryButton>

            <SecondaryButton
              onPress={() => goTo('ImportWallet')}
              accessibilityRole="button"
            >
              <SecondaryButtonText>기존 지갑 가져오기</SecondaryButtonText>
            </SecondaryButton>
          </ButtonContainer>
        </Content>
      </ScrollView>
    </Container>
  );
}

export default WelcomeScreen;
