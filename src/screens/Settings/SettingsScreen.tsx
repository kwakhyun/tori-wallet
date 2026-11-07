/**
 * 설정 화면
 *
 * 현재 지갑(계정) · 네트워크 · 표시 · 자산 · 보안 · 지원 · 위험 영역.
 * 보안 관련 항목(복구 구문, PIN, 생체 인증, 자동 잠금, 거래 승인)은
 * 보안 화면(SecuritySettings) 하나로 모았다.
 */

import React, { useCallback, useState } from 'react';
import { ScrollView, StatusBar } from 'react-native';
import styled from 'styled-components/native';
import { useShallow } from 'zustand/react/shallow';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { TabScreen } from '@/components/common/Screen';
import { useTheme } from '@/hooks/useTheme';
import { APP_VERSION } from '@/config/appInfo';
import { useWalletStore } from '@/store/walletStore';
import { useThemeStore } from '@/store/themeStore';
import {
  usePreferencesStore,
  type FiatCurrency,
} from '@/store/preferencesStore';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import type { ThemeMode } from '@/styles/theme';
import { shortenAddress } from '@/utils/address';
import {
  Group,
  Section,
  SectionTitle,
  SettingRow,
  SwitchRow,
} from './components/SettingsUI';
import {
  CurrencyModal,
  THEME_ICON,
  ThemeModal,
  themeLabelOf,
} from './components/DisplayModals';
import { SettingsNetworkModal } from './components/SettingsNetworkModal';
import {
  DeleteWalletModal,
  type DeleteWalletMode,
} from './components/DeleteWalletModal';
import {
  SUPPORT_EMAIL,
  openLegalDocument,
  openSupportEmail,
} from './settingsLinks';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ActiveModal = 'network' | 'theme' | 'currency' | null;

const CURRENCY_SHORT_LABEL: Record<FiatCurrency, string> = {
  KRW: '원 (₩)',
  USD: '달러 ($)',
};

function SettingsScreen(): React.JSX.Element {
  const navigation = useNavigation<NavigationProp>();
  const { isDarkMode } = useTheme();
  const { wallets, activeWalletIndex, networks, activeNetworkChainId, lock } =
    useWalletStore(
      useShallow(state => ({
        wallets: state.wallets,
        activeWalletIndex: state.activeWalletIndex,
        networks: state.networks,
        activeNetworkChainId: state.activeNetworkChainId,
        lock: state.lock,
      })),
    );
  const { themeMode, setThemeMode } = useThemeStore(
    useShallow(state => ({
      themeMode: state.themeMode,
      setThemeMode: state.setThemeMode,
    })),
  );
  const { currency, setCurrency, hideBalances, setHideBalances } =
    usePreferencesStore(
      useShallow(state => ({
        currency: state.currency,
        setCurrency: state.setCurrency,
        hideBalances: state.hideBalances,
        setHideBalances: state.setHideBalances,
      })),
    );

  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [deleteMode, setDeleteMode] = useState<DeleteWalletMode | null>(null);
  const closeModal = useCallback(() => setActiveModal(null), []);

  const activeWallet = wallets[activeWalletIndex];
  const activeNetwork = networks.find(n => n.chainId === activeNetworkChainId);
  const networkKind = activeNetwork?.isCustom
    ? '직접 추가한 네트워크'
    : activeNetwork?.isTestnet
    ? '테스트넷 · 실제 가치 없음'
    : '메인넷 · 실제 자산';

  const handleSelectTheme = useCallback(
    (mode: ThemeMode) => {
      setThemeMode(mode);
      closeModal();
    },
    [closeModal, setThemeMode],
  );

  const handleSelectCurrency = useCallback(
    (value: FiatCurrency) => {
      setCurrency(value);
      closeModal();
    },
    [closeModal, setCurrency],
  );

  return (
    <TabScreen testID="settings-screen">
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={contentStyle}>
        <Title accessibilityRole="header">설정</Title>

        {activeWallet ? (
          <Section>
            <SectionTitle>현재 지갑</SectionTitle>
            <AccountCard
              onPress={() => navigation.navigate('Accounts')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`현재 계정 ${
                activeWallet.name
              }, ${shortenAddress(activeWallet.address)}`}
              accessibilityHint="계정을 추가하거나 전환합니다"
              testID="settings-account-card"
            >
              <Avatar importantForAccessibility="no">
                <AvatarText>
                  {activeWallet.name.trim().charAt(0).toUpperCase() || '?'}
                </AvatarText>
              </Avatar>
              <AccountInfo>
                <AccountName numberOfLines={1}>{activeWallet.name}</AccountName>
                <AccountAddress>
                  {shortenAddress(activeWallet.address, 8, 6)}
                </AccountAddress>
              </AccountInfo>
              <AccountMeta>
                <AccountMetaText>계정 {wallets.length}개</AccountMetaText>
                <AccountMetaText>관리 ›</AccountMetaText>
              </AccountMeta>
            </AccountCard>
          </Section>
        ) : null}

        <Section>
          <SectionTitle>네트워크</SectionTitle>
          <Group>
            <SettingRow
              icon={activeNetwork?.isTestnet ? '🧪' : '🌐'}
              title={activeNetwork?.name ?? '알 수 없는 네트워크'}
              subtitle={networkKind}
              value="변경"
              onPress={() => setActiveModal('network')}
              testID="settings-network"
            />
          </Group>
        </Section>

        <Section>
          <SectionTitle>표시</SectionTitle>
          <Group>
            <SettingRow
              icon={THEME_ICON[themeMode]}
              title="테마"
              value={themeLabelOf(themeMode)}
              onPress={() => setActiveModal('theme')}
              divider
              testID="settings-theme"
            />
            <SettingRow
              icon="💱"
              title="표시 통화"
              value={CURRENCY_SHORT_LABEL[currency]}
              onPress={() => setActiveModal('currency')}
              divider
              testID="settings-currency"
            />
            <SwitchRow
              icon="🙈"
              title="잔액 숨기기"
              subtitle="자산 금액을 ••••로 가립니다"
              value={hideBalances}
              onValueChange={setHideBalances}
              testID="settings-hide-balances"
            />
          </Group>
        </Section>

        <Section>
          <SectionTitle>자산</SectionTitle>
          <Group>
            <SettingRow
              icon="🪙"
              title="토큰 관리"
              subtitle="표시할 토큰 선택, 커스텀 토큰 추가"
              onPress={() => navigation.navigate('TokenManagement')}
              divider
              testID="settings-token-management"
            />
            <SettingRow
              icon="🛡️"
              title="토큰 승인 관리"
              subtitle="dApp에 허용한 토큰 사용 권한 확인·취소"
              onPress={() => navigation.navigate('TokenApprovals')}
              divider
              testID="settings-token-approvals"
            />
            <SettingRow
              icon="📇"
              title="주소록"
              subtitle="자주 보내는 주소 저장"
              onPress={() => navigation.navigate('AddressBook')}
              testID="settings-address-book"
            />
          </Group>
        </Section>

        <Section>
          <SectionTitle>보안</SectionTitle>
          <Group>
            <SettingRow
              icon="🔐"
              title="보안"
              subtitle="복구 구문, PIN, 생체 인증, 자동 잠금, 거래 승인"
              onPress={() => navigation.navigate('SecuritySettings')}
              divider
              testID="settings-security"
            />
            <SettingRow
              icon="🔒"
              title="지금 잠그기"
              subtitle="다시 사용하려면 PIN 또는 생체 인증이 필요합니다"
              onPress={lock}
              showChevron={false}
              testID="settings-lock-now"
            />
          </Group>
        </Section>

        <Section>
          <SectionTitle>지원 및 정보</SectionTitle>
          <Group>
            <SettingRow
              icon="📧"
              title="문의하기"
              subtitle={SUPPORT_EMAIL}
              onPress={openSupportEmail}
              divider
              testID="settings-contact"
            />
            <SettingRow
              icon="📄"
              title="개인정보 처리방침"
              subtitle="한국어 / English"
              onPress={() => openLegalDocument('privacy')}
              divider
              testID="settings-privacy"
            />
            <SettingRow
              icon="📋"
              title="이용약관"
              subtitle="한국어 / English"
              onPress={() => openLegalDocument('terms')}
              divider
              testID="settings-terms"
            />
            <SettingRow
              icon="ℹ️"
              title="앱 버전"
              value={APP_VERSION}
              testID="settings-app-version"
            />
          </Group>
        </Section>

        <Section>
          <SectionTitle>위험 영역</SectionTitle>
          <Group>
            <SettingRow
              icon="📥"
              title="다른 지갑 가져오기 (현재 지갑 삭제)"
              subtitle="현재 지갑을 삭제한 뒤 다른 복구 구문을 가져옵니다"
              onPress={() => setDeleteMode('replace')}
              danger
              divider
              testID="settings-replace-wallet"
            />
            <SettingRow
              icon="🗑️"
              title="지갑 완전 삭제"
              subtitle="복구 구문이 없으면 자산을 되찾을 수 없습니다"
              onPress={() => setDeleteMode('delete')}
              danger
              testID="settings-delete-wallet"
            />
          </Group>
        </Section>
      </ScrollView>

      <SettingsNetworkModal
        visible={activeModal === 'network'}
        onClose={closeModal}
      />
      <ThemeModal
        visible={activeModal === 'theme'}
        value={themeMode}
        onSelect={handleSelectTheme}
        onClose={closeModal}
      />
      <CurrencyModal
        visible={activeModal === 'currency'}
        value={currency}
        onSelect={handleSelectCurrency}
        onClose={closeModal}
      />
      <DeleteWalletModal
        mode={deleteMode}
        onClose={() => setDeleteMode(null)}
      />
    </TabScreen>
  );
}

const contentStyle = { padding: 20, paddingBottom: 40 };

const Title = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.h2.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.h2.fontWeight};
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const AccountCard = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  min-height: 72px;
  padding: ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  background-color: ${({ theme }) => theme.colors.surface};
`;

const Avatar = styled.View`
  width: 40px;
  height: 40px;
  border-radius: 20px;
  align-items: center;
  justify-content: center;
  margin-right: ${({ theme }) => theme.spacing.md}px;
  background-color: ${({ theme }) => theme.colors.primary};
`;

const AvatarText = styled.Text`
  color: ${({ theme }) => theme.colors.onPrimary};
  font-size: 18px;
  font-weight: 700;
`;

const AccountInfo = styled.View`
  flex: 1;
`;

const AccountName = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 16px;
  font-weight: 600;
`;

const AccountAddress = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  font-family: monospace;
  margin-top: 2px;
`;

const AccountMeta = styled.View`
  align-items: flex-end;
`;

const AccountMetaText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
`;

export default SettingsScreen;
