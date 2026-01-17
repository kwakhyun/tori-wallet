/**
 * 로고 미리보기 화면 (개발용)
 */

import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import styled from 'styled-components/native';
import {
  ToriLogo,
  ToriIcon,
  ToriText,
  ToriSplashLogo,
  ToriMiniIcon,
  ToriCircleIcon,
} from '../../components/common/Logo';

export function LogoPreviewScreen() {
  return (
    <Container>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Title>Tori Wallet Logo Preview</Title>

        {/* Icon - 앱 아이콘 */}
        <Section>
          <SectionTitle>ToriIcon (앱 아이콘)</SectionTitle>
          <Row>
            <LogoBox dark>
              <ToriIcon size={100} />
            </LogoBox>
            <LogoBox>
              <ToriIcon size={64} />
            </LogoBox>
            <LogoBox dark>
              <ToriIcon size={48} />
            </LogoBox>
          </Row>
        </Section>

        {/* Mini Icon - 탭바 */}
        <Section>
          <SectionTitle>ToriMiniIcon (탭바/헤더)</SectionTitle>
          <Row>
            <LogoBox dark>
              <ToriMiniIcon size={32} />
            </LogoBox>
            <LogoBox>
              <ToriMiniIcon size={24} />
            </LogoBox>
            <LogoBox dark>
              <ToriMiniIcon size={20} />
            </LogoBox>
          </Row>
        </Section>

        {/* Circle Icon - 프로필 */}
        <Section>
          <SectionTitle>ToriCircleIcon (프로필)</SectionTitle>
          <Row>
            <LogoBox dark>
              <ToriCircleIcon size={64} />
            </LogoBox>
            <LogoBox>
              <ToriCircleIcon size={48} />
            </LogoBox>
            <LogoBox dark>
              <ToriCircleIcon size={32} />
            </LogoBox>
          </Row>
        </Section>

        {/* Text Logo */}
        <Section>
          <SectionTitle>ToriText (헤더)</SectionTitle>
          <Row>
            <LogoBox dark style={{ flex: 1 }}>
              <ToriText size={40} theme="dark" />
            </LogoBox>
          </Row>
          <Row>
            <LogoBox style={{ flex: 1 }}>
              <ToriText size={40} theme="light" />
            </LogoBox>
          </Row>
        </Section>

        {/* Full Logo */}
        <Section>
          <SectionTitle>ToriLogo (full)</SectionTitle>
          <Row>
            <LogoBox dark style={{ flex: 1 }}>
              <ToriLogo size={80} variant="full" theme="dark" />
            </LogoBox>
          </Row>
          <Row>
            <LogoBox style={{ flex: 1 }}>
              <ToriLogo size={80} variant="full" theme="light" />
            </LogoBox>
          </Row>
        </Section>

        {/* Splash Logo */}
        <Section>
          <SectionTitle>ToriSplashLogo (스플래시)</SectionTitle>
          <Row>
            <LogoBox dark style={{ flex: 1, paddingVertical: 40 }}>
              <ToriSplashLogo size={150} showSubtitle={true} />
            </LogoBox>
          </Row>
          <Row>
            <LogoBox dark style={{ flex: 1, paddingVertical: 30 }}>
              <ToriSplashLogo size={120} showSubtitle={false} />
            </LogoBox>
          </Row>
        </Section>
      </ScrollView>
    </Container>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
});

const Container = styled.SafeAreaView`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
`;

const Title = styled.Text`
  font-size: 24px;
  font-weight: bold;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: 24px;
  text-align: center;
`;

const Section = styled.View`
  margin-bottom: 32px;
`;

const SectionTitle = styled.Text`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 12px;
`;

const Row = styled.View`
  flex-direction: row;
  gap: 12px;
  margin-bottom: 12px;
`;

const LogoBox = styled.View<{ dark?: boolean }>`
  background-color: ${({ dark, theme }) =>
    dark ? '#1F2937' : theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.lg}px;
  padding: 20px;
  align-items: center;
  justify-content: center;
  border-width: 1px;
  border-color: ${({ theme }) => theme.colors.border};
`;

export default LogoPreviewScreen;
