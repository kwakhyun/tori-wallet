/**
 * Tori Wallet - Welcome Screen
 */

import React from 'react';
import styled from 'styled-components/native';
import { SafeAreaView, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '@/navigation/AuthNavigator';
import { ToriCatFace } from '@/components/common/Logo';

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
`;

const Content = styled.View`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.xl}px;
  justify-content: center;
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
  padding: ${({ theme }) => theme.spacing.md}px;
  align-items: center;
`;

const PrimaryButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.button.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.button.fontWeight};
`;

const SecondaryButton = styled.TouchableOpacity`
  background-color: transparent;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  align-items: center;
`;

const SecondaryButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.button.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.button.fontWeight};
`;

type NavigationProp = NativeStackNavigationProp<AuthStackParamList, 'Welcome'>;

function WelcomeScreen(): React.JSX.Element {
  const navigation = useNavigation<NavigationProp>();

  return (
    <Container>
      <StatusBar barStyle="light-content" />
      <Content>
        <LogoContainer>
          <ToriCatFace size={140} />
          <AppName>Tori Wallet</AppName>
          <Tagline>안전하고 간편한 Web3 지갑</Tagline>
        </LogoContainer>

        <ButtonContainer>
          <PrimaryButton onPress={() => navigation.navigate('CreateWallet')}>
            <PrimaryButtonText>새 지갑 만들기</PrimaryButtonText>
          </PrimaryButton>

          <SecondaryButton onPress={() => navigation.navigate('ImportWallet')}>
            <SecondaryButtonText>기존 지갑 가져오기</SecondaryButtonText>
          </SecondaryButton>
        </ButtonContainer>
      </Content>
    </Container>
  );
}

export default WelcomeScreen;
