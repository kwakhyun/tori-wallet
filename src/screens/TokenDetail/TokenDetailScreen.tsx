/**
 * Tori Wallet - Token Detail Screen
 * 토큰 상세 화면 - 잔액, 가격 정보, 전송/수신 기능
 */

import React, { useCallback } from 'react';
import styled from 'styled-components/native';
import {
  SafeAreaView,
  StatusBar,
  ScrollView,
  RefreshControl,
  Linking,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { useWalletStore } from '@/store/walletStore';
import { useBalance } from '@/hooks/useBalance';
import { showBuyProviderAlert } from '@/services/buyService';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type TokenDetailRouteProp = RouteProp<RootStackParamList, 'TokenDetail'>;

function TokenDetailScreen(): React.JSX.Element {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<TokenDetailRouteProp>();
  const { symbol, name, balance, contractAddress } = route.params;

  const { wallets, activeWalletIndex, activeNetworkChainId, networks } =
    useWalletStore();
  const activeWallet = wallets[activeWalletIndex];
  const activeNetwork = networks.find(n => n.chainId === activeNetworkChainId);

  const {
    data: balanceData,
    isLoading,
    refetch,
    isRefetching,
  } = useBalance(activeWallet?.address, activeNetworkChainId);

  const formatBalance = (value: string | undefined) => {
    if (!value) return '0.0000';
    const num = parseFloat(value);
    if (num === 0) return '0.0000';
    if (num < 0.0001) return '< 0.0001';
    return num.toFixed(4);
  };

  const currentBalance = contractAddress
    ? balance
    : formatBalance(balanceData?.formatted);

  const handleSend = useCallback(() => {
    navigation.navigate('SendTransaction', {
      tokenAddress: contractAddress,
    });
  }, [navigation, contractAddress]);

  const handleReceive = useCallback(() => {
    navigation.navigate('ReceiveToken');
  }, [navigation]);

  const handleBuy = useCallback(() => {
    if (!activeWallet?.address) return;

    const cryptoSymbol =
      activeNetworkChainId === 1
        ? 'eth'
        : activeNetworkChainId === 137
        ? 'matic'
        : 'eth';

    showBuyProviderAlert(cryptoSymbol, activeWallet.address);
  }, [activeWallet?.address, activeNetworkChainId]);

  const handleViewExplorer = useCallback(() => {
    if (!activeWallet?.address) return;

    const explorerUrl = activeNetwork?.isTestnet
      ? `https://sepolia.etherscan.io/address/${activeWallet.address}`
      : activeNetworkChainId === 1
      ? `https://etherscan.io/address/${activeWallet.address}`
      : activeNetworkChainId === 137
      ? `https://polygonscan.com/address/${activeWallet.address}`
      : activeNetworkChainId === 42161
      ? `https://arbiscan.io/address/${activeWallet.address}`
      : `https://etherscan.io/address/${activeWallet.address}`;

    Linking.openURL(explorerUrl);
  }, [activeWallet?.address, activeNetwork, activeNetworkChainId]);

  return (
    <Container>
      <StatusBar barStyle="light-content" />
      <Header>
        <BackButton onPress={() => navigation.goBack()}>
          <BackButtonText>‹</BackButtonText>
        </BackButton>
        <HeaderTitle>{symbol}</HeaderTitle>
        <HeaderRight />
      </Header>

      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#6366F1"
          />
        }
      >
        <Content>
          {/* Token Icon & Balance */}
          <TokenHeader>
            <TokenIconLarge>
              <TokenIconText>
                {symbol === 'ETH' || symbol === 'SepoliaETH' ? 'Ξ' : symbol[0]}
              </TokenIconText>
            </TokenIconLarge>
            <TokenName>{name}</TokenName>
            <BalanceValue>
              {isLoading ? '로딩중...' : `${currentBalance} ${symbol}`}
            </BalanceValue>
            <BalanceUSD>≈ $0.00 USD</BalanceUSD>
          </TokenHeader>

          {/* Action Buttons */}
          <ActionRow>
            <ActionButton onPress={handleBuy}>
              <ActionIcon>
                <ActionIconText>+</ActionIconText>
              </ActionIcon>
              <ActionLabel>구매</ActionLabel>
            </ActionButton>
            <ActionButton onPress={handleSend}>
              <ActionIcon>
                <ActionIconText>↑</ActionIconText>
              </ActionIcon>
              <ActionLabel>보내기</ActionLabel>
            </ActionButton>
            <ActionButton onPress={handleReceive}>
              <ActionIcon>
                <ActionIconText>↓</ActionIconText>
              </ActionIcon>
              <ActionLabel>받기</ActionLabel>
            </ActionButton>
          </ActionRow>

          {/* Token Info */}
          <Section>
            <SectionTitle>토큰 정보</SectionTitle>
            <InfoCard>
              <InfoRow>
                <InfoLabel>네트워크</InfoLabel>
                <InfoValue>{activeNetwork?.name}</InfoValue>
              </InfoRow>
              <InfoRow>
                <InfoLabel>심볼</InfoLabel>
                <InfoValue>{symbol}</InfoValue>
              </InfoRow>
              {contractAddress && (
                <InfoRow>
                  <InfoLabel>컨트랙트</InfoLabel>
                  <InfoValue numberOfLines={1} ellipsizeMode="middle">
                    {contractAddress}
                  </InfoValue>
                </InfoRow>
              )}
            </InfoCard>
          </Section>

          {/* View on Explorer */}
          <ExplorerButton onPress={handleViewExplorer}>
            <ExplorerButtonText>블록 탐색기에서 보기 ↗</ExplorerButtonText>
          </ExplorerButton>
        </Content>
      </ScrollView>
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
`;

const Header = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.md}px;
  border-bottom-width: 1px;
  border-bottom-color: ${({ theme }) => theme.colors.border};
`;

const BackButton = styled.TouchableOpacity`
  width: 40px;
  height: 40px;
  align-items: center;
  justify-content: center;
`;

const BackButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 32px;
`;

const HeaderTitle = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.h3.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.h3.fontWeight};
`;

const HeaderRight = styled.View`
  width: 40px;
`;

const Content = styled.View`
  padding: ${({ theme }) => theme.spacing.lg}px;
`;

const TokenHeader = styled.View`
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.xl}px;
`;

const TokenIconLarge = styled.View`
  width: 80px;
  height: 80px;
  border-radius: 40px;
  background-color: ${({ theme }) => theme.colors.primaryLight};
  align-items: center;
  justify-content: center;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const TokenIconText = styled.Text`
  font-size: 36px;
  color: ${({ theme }) => theme.colors.primary};
`;

const TokenName = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const BalanceValue = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 32px;
  font-weight: 700;
`;

const BalanceUSD = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
`;

const ActionRow = styled.View`
  flex-direction: row;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.xl}px;
  margin-bottom: ${({ theme }) => theme.spacing.xl}px;
`;

const ActionButton = styled.TouchableOpacity`
  align-items: center;
  min-width: 70px;
`;

const ActionIcon = styled.View`
  width: 52px;
  height: 52px;
  border-radius: 26px;
  background-color: ${({ theme }) => theme.colors.primary};
  align-items: center;
  justify-content: center;
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
`;

const ActionIconText = styled.Text`
  font-size: 24px;
  color: #fff;
`;

const ActionLabel = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
`;

const Section = styled.View`
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const SectionTitle = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  text-transform: uppercase;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const InfoCard = styled.View`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
`;

const InfoRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding-top: ${({ theme }) => theme.spacing.sm}px;
  padding-bottom: ${({ theme }) => theme.spacing.sm}px;
  border-bottom-width: 1px;
  border-bottom-color: ${({ theme }) => theme.colors.border};
`;

const InfoLabel = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
`;

const InfoValue = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  flex: 1;
  text-align: right;
  margin-left: ${({ theme }) => theme.spacing.md}px;
`;

const ExplorerButton = styled.TouchableOpacity`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  align-items: center;
`;

const ExplorerButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.primary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  font-weight: 500;
`;

export default TokenDetailScreen;
