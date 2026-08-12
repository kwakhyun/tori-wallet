/**
 * 홈 화면 (잔액 조회, 토큰 전송)
 */

import React, { useCallback, useState, useEffect } from 'react';
import styled from 'styled-components/native';
import { useTheme } from '@/hooks/useTheme';
import {
  StatusBar,
  RefreshControl,
  ScrollView,
  Alert,
  Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { useWalletStore } from '@/store/walletStore';
import { useBalance } from '@/hooks/useBalance';
import { coinService } from '@/services/coinService';
import { showBuyProviderAlert } from '@/services/buyService';
import { HomeScreenSkeleton } from '@/components/common/Skeleton';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

function HomeScreen(): React.JSX.Element {
  const { theme, isDarkMode } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const { wallets, activeWalletIndex, activeNetworkChainId, networks } =
    useWalletStore();

  const activeWallet = wallets[activeWalletIndex];
  const activeNetwork = networks.find(n => n.chainId === activeNetworkChainId);

  const {
    data: balance,
    refetch,
    isLoading,
    isRefetching,
  } = useBalance(activeWallet?.address, activeNetworkChainId);

  // USD 가격 상태
  const [usdPrice, setUsdPrice] = useState<number>(0);
  const [usdValue, setUsdValue] = useState<string>('$0.00');
  const [isPriceLoading, setIsPriceLoading] = useState(true);

  // 가격 조회
  useEffect(() => {
    const fetchPrice = async () => {
      setIsPriceLoading(true);
      try {
        const price = await coinService.getNativeTokenPrice(
          activeNetworkChainId,
        );
        setUsdPrice(price);
      } catch (error) {
        console.warn('Failed to fetch price:', error);
      } finally {
        setIsPriceLoading(false);
      }
    };
    fetchPrice();
  }, [activeNetworkChainId]);

  // USD 가치 계산
  useEffect(() => {
    if (balance?.formatted && usdPrice > 0) {
      const amount = parseFloat(balance.formatted);
      setUsdValue(coinService.calculateUsdValue(amount, usdPrice));
    } else {
      setUsdValue('$0.00');
    }
  }, [balance?.formatted, usdPrice]);

  // 초기 로딩 상태
  const isInitialLoading = isLoading || isPriceLoading;

  const formatBalance = (value: string | undefined) => {
    if (!value) return '0.0000';
    const num = parseFloat(value);
    if (num === 0) return '0.0000';
    if (num < 0.0001) return '< 0.0001';
    return num.toFixed(4);
  };

  const truncateAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const handleCopyAddress = useCallback(() => {
    if (activeWallet?.address) {
      Clipboard.setString(activeWallet.address);
      Alert.alert('복사 완료', '지갑 주소가 클립보드에 복사되었습니다.');
    }
  }, [activeWallet?.address]);

  const handleSend = useCallback(() => {
    navigation.navigate('SendTransaction', {});
  }, [navigation]);

  const handleReceive = useCallback(() => {
    navigation.navigate('ReceiveToken');
  }, [navigation]);

  const handleWalletConnect = useCallback(() => {
    navigation.navigate('WalletConnect', {});
  }, [navigation]);

  const handleSwap = useCallback(() => {
    navigation.navigate('Swap');
  }, [navigation]);

  const handleBuy = useCallback(() => {
    if (!activeWallet?.address) {
      Alert.alert('오류', '지갑 주소를 찾을 수 없습니다.');
      return;
    }

    // 네트워크에 따른 암호화폐 코드 설정
    const cryptoSymbol = activeNetwork?.isTestnet
      ? 'eth'
      : activeNetworkChainId === 1
      ? 'eth'
      : activeNetworkChainId === 137
      ? 'matic'
      : 'eth';

    showBuyProviderAlert(cryptoSymbol, activeWallet.address);
  }, [activeWallet?.address, activeNetwork, activeNetworkChainId]);

  // 토큰 상세 화면으로 이동
  const handleTokenPress = useCallback(
    (token: {
      symbol: string;
      name: string;
      balance: string;
      value: string;
      icon: string;
    }) => {
      navigation.navigate('TokenDetail', {
        symbol: token.symbol,
        name: token.name,
        balance: token.balance,
        value: token.value,
        contractAddress: undefined, // 네이티브 토큰
      });
    },
    [navigation],
  );

  if (!activeWallet) {
    return (
      <Container>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <EmptyContainer>
          <EmptyText>지갑이 없습니다</EmptyText>
        </EmptyContainer>
      </Container>
    );
  }

  // 초기 로딩 시 스켈레톤 UI 표시
  if (isInitialLoading) {
    return (
      <Container>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <HomeScreenSkeleton />
      </Container>
    );
  }

  return (
    <Container testID="home-screen">
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScrollView
        testID="home-scroll-view"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={theme.colors.primary}
          />
        }
      >
        <Content>
          {/* Network Badge */}
          <NetworkBadge testID="home-network-badge">
            <NetworkDot $isTestnet={activeNetwork?.isTestnet} />
            <NetworkName testID="home-network-name">
              {activeNetwork?.name || 'Unknown'}
            </NetworkName>
          </NetworkBadge>

          {/* Wallet Card */}
          <WalletCard testID="home-wallet-card">
            <AddressRow onPress={handleCopyAddress} testID="home-address-row">
              <AddressText testID="home-address-text">
                {truncateAddress(activeWallet.address)}
              </AddressText>
              <CopyIcon>📋</CopyIcon>
            </AddressRow>

            <BalanceContainer testID="home-balance-container">
              <BalanceRow>
                <BalanceValue testID="home-balance-value">
                  {formatBalance(balance?.formatted)}{' '}
                  {activeNetwork?.symbol || 'ETH'}
                </BalanceValue>
                {isRefetching && (
                  <RefreshingDot testID="home-refreshing-indicator" />
                )}
              </BalanceRow>
              <BalanceLabel testID="home-balance-usd">
                ≈ {usdValue} USD
              </BalanceLabel>
            </BalanceContainer>

            <ActionRow testID="home-action-row">
              <ActionButton onPress={handleBuy} testID="home-buy-button">
                <ActionIcon>
                  <ActionIconText>+</ActionIconText>
                </ActionIcon>
                <ActionText>구매</ActionText>
              </ActionButton>
              <ActionButton onPress={handleSend} testID="home-send-button">
                <ActionIcon>
                  <ActionIconText>↑</ActionIconText>
                </ActionIcon>
                <ActionText>보내기</ActionText>
              </ActionButton>
              <ActionButton
                onPress={handleReceive}
                testID="home-receive-button"
              >
                <ActionIcon>
                  <ActionIconText>↓</ActionIconText>
                </ActionIcon>
                <ActionText>받기</ActionText>
              </ActionButton>
              <ActionButton onPress={handleSwap} testID="home-swap-button">
                <ActionIcon>
                  <ActionIconText>⇄</ActionIconText>
                </ActionIcon>
                <ActionText>스왑</ActionText>
              </ActionButton>
              <ActionButton
                onPress={handleWalletConnect}
                testID="home-connect-button"
              >
                <ActionIcon>
                  <ActionIconText>⊙</ActionIconText>
                </ActionIcon>
                <ActionText>연결</ActionText>
              </ActionButton>
            </ActionRow>
          </WalletCard>

          {/* Tokens Section */}
          <SectionHeader>
            <SectionTitle>토큰</SectionTitle>
          </SectionHeader>

          <TokenItem
            onPress={() =>
              handleTokenPress({
                symbol: activeNetwork?.symbol || 'ETH',
                name: activeNetwork?.name || 'Ethereum',
                balance: formatBalance(balance?.formatted),
                value: '$0.00',
                icon: 'Ξ',
              })
            }
          >
            <TokenIconContainer>
              <TokenIconText>Ξ</TokenIconText>
            </TokenIconContainer>
            <TokenInfo>
              <TokenName>{activeNetwork?.symbol || 'ETH'}</TokenName>
              <TokenNetwork>{activeNetwork?.name}</TokenNetwork>
            </TokenInfo>
            <TokenBalanceContainer>
              <TokenBalance>
                {formatBalance(balance?.formatted)}{' '}
                {activeNetwork?.symbol || 'ETH'}
              </TokenBalance>
              <TokenValue>≈ $0.00</TokenValue>
            </TokenBalanceContainer>
            <ArrowIcon>›</ArrowIcon>
          </TokenItem>

          {/* Info Box for Testnet */}
          {activeNetwork?.isTestnet && (
            <InfoBox>
              <InfoIcon>💡</InfoIcon>
              <InfoText>
                {activeNetwork.name}에서 테스트 중입니다.{'\n'}
                Faucet에서 테스트 ETH를 받을 수 있습니다.
              </InfoText>
            </InfoBox>
          )}

          {/* Warning Box for Mainnet */}
          {!activeNetwork?.isTestnet && (
            <MainnetWarningBox>
              <InfoIcon>⚠️</InfoIcon>
              <InfoText>
                {activeNetwork?.name}은 실제 자산이 사용됩니다.{'\n'}
                전송 시 주의하세요.
              </InfoText>
            </MainnetWarningBox>
          )}
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

const EmptyContainer = styled.View`
  flex: 1;
  justify-content: center;
  align-items: center;
`;

const EmptyText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
`;

const NetworkBadge = styled.View`
  flex-direction: row;
  align-items: center;
  align-self: center;
  background-color: ${({ theme }) => theme.colors.surface};
  padding: ${({ theme }) => theme.spacing.xs}px
    ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.full}px;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const NetworkDot = styled.View<{ $isTestnet?: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 4px;
  background-color: ${({ theme, $isTestnet }) =>
    $isTestnet ? theme.colors.warning : theme.colors.success};
  margin-right: ${({ theme }) => theme.spacing.xs}px;
`;

const NetworkName = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
`;

const WalletCard = styled.View`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.xl}px;
  padding: ${({ theme }) => theme.spacing.xl}px;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const AddressRow = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const AddressText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  font-family: monospace;
`;

const CopyIcon = styled.Text`
  margin-left: ${({ theme }) => theme.spacing.xs}px;
  font-size: 14px;
`;

const BalanceContainer = styled.View`
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.xl}px;
`;

const BalanceRow = styled.View`
  flex-direction: row;
  align-items: center;
`;

const BalanceValue = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 36px;
  font-weight: 700;
`;

const RefreshingDot = styled.View`
  width: 8px;
  height: 8px;
  border-radius: 4px;
  background-color: ${({ theme }) => theme.colors.primary};
  margin-left: ${({ theme }) => theme.spacing.sm}px;
  opacity: 0.7;
`;

const BalanceLabel = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
`;

const ActionRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  padding: 0 ${({ theme }) => theme.spacing.sm}px;
`;

const ActionButton = styled.TouchableOpacity`
  align-items: center;
  flex: 1;
`;

const ActionIcon = styled.View`
  width: 44px;
  height: 44px;
  border-radius: 22px;
  background-color: ${({ theme }) => theme.colors.primary};
  align-items: center;
  justify-content: center;
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
`;

const ActionIconText = styled.Text`
  font-size: 20px;
  color: #fff;
`;

const ActionText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 11px;
  font-weight: 500;
`;

const SectionHeader = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const SectionTitle = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.h3.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.h3.fontWeight};
`;

const TokenItem = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.lg}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const TokenIconContainer = styled.View`
  width: 44px;
  height: 44px;
  border-radius: 22px;
  background-color: ${({ theme }) => theme.colors.primaryLight};
  align-items: center;
  justify-content: center;
  margin-right: ${({ theme }) => theme.spacing.md}px;
`;

const TokenIconText = styled.Text`
  font-size: 24px;
  color: #ffffff;
`;

const TokenInfo = styled.View`
  flex: 1;
`;

const TokenName = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  font-weight: 600;
`;

const TokenNetwork = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
`;

const TokenBalanceContainer = styled.View`
  align-items: flex-end;
`;

const TokenBalance = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  font-weight: 500;
`;

const TokenValue = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
`;

const InfoBox = styled.View`
  flex-direction: row;
  background-color: ${({ theme }) => theme.colors.backgroundSecondary};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-top: ${({ theme }) => theme.spacing.lg}px;
  border-left-width: 4px;
  border-left-color: ${({ theme }) => theme.colors.warning};
`;

const MainnetWarningBox = styled.View`
  flex-direction: row;
  background-color: rgba(239, 68, 68, 0.1);
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-top: ${({ theme }) => theme.spacing.lg}px;
  border-left-width: 4px;
  border-left-color: ${({ theme }) => theme.colors.error};
`;

const InfoIcon = styled.Text`
  font-size: 20px;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const InfoText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  flex: 1;
  line-height: 20px;
`;

const ArrowIcon = styled.Text`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 24px;
  margin-left: ${({ theme }) => theme.spacing.sm}px;
`;

export default HomeScreen;
