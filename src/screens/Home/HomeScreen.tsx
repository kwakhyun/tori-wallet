/**
 * 홈 화면 (총 자산, 토큰 목록, 빠른 실행)
 *
 * - 네이티브 잔액(useBalance)과 토큰 목록(tokenService)을 따로 불러와
 *   시세 조회가 느려도 잔액은 먼저 보여 준다.
 * - 조회 실패는 0이 아니라 '—'와 다시 시도 버튼으로 표시한다.
 * - 총 자산은 포트폴리오와 같은 규칙(tokenValuation)으로 계산한다: 가치를 아는 자산이
 *   없으면 '—', 조회 실패/시세 정보 없음으로 빠진 자산은 아래에 안내한다.
 * - 테스트넷 자산은 법정화폐 가치를 표시하지 않는다.
 */

import React, { useCallback, useMemo, useState } from 'react';
import styled from 'styled-components/native';
import { useShallow } from 'zustand/react/shallow';
import {
  StatusBar,
  RefreshControl,
  ScrollView,
  Alert,
  Clipboard,
  Image,
  Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { useTheme } from '@/hooks/useTheme';
import { useWalletStore } from '@/store/walletStore';
import { useBalance } from '@/hooks/useBalance';
import { useFiat } from '@/hooks/useFiat';
import { tokenService, type Token } from '@/services/tokenService';
import {
  summarizeTokenTotal,
  totalNoteKind,
  TOTAL_NOTES,
} from '@/services/tokenValuation';
import { showBuyProviderAlert } from '@/services/buyService';
import { showToast } from '@/store/toastStore';
import { formatDisplayAmount } from '@/utils/format';
import { TabScreen } from '@/components/common/Screen';
import { IconButton } from '@/components/common/IconButton';
import { ErrorState } from '@/components/common/StateViews';
import {
  BalanceSkeleton,
  Skeleton,
  TokenItemSkeleton,
} from '@/components/common/Skeleton';
import { NetworkSelectorModal } from '@/components/network/NetworkSelectorModal';
import { tokenDetailParams } from '@/screens/TokenDetail/tokenDetailParams';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

/** 테스트넷 Faucet (무료 테스트 토큰) */
export const FAUCET_URLS: Record<number, string> = {
  11155111: 'https://cloud.google.com/application/web3/faucet/ethereum/sepolia',
};

function truncateAddress(address: string): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function hasPositiveBalance(token: Token): boolean {
  const amount = Number(token.balanceRaw);
  return Number.isFinite(amount) && amount > 0;
}

/** 홈 목록에 보일 토큰: 네이티브, 사용자 토큰, 잔액이 있거나 조회에 실패한 토큰 */
export function selectHomeTokens(tokens: Token[]): Token[] {
  return tokens.filter(
    token =>
      token.address === 'native' ||
      token.isCustom ||
      token.balanceError ||
      hasPositiveBalance(token),
  );
}

function HomeScreen(): React.JSX.Element {
  const { theme, isDarkMode } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const { formatFiat, mask, hideBalances, toggleHideBalances } = useFiat();
  const { wallets, activeWalletIndex, activeNetworkChainId, networks } =
    useWalletStore(
      useShallow(state => ({
        wallets: state.wallets,
        activeWalletIndex: state.activeWalletIndex,
        activeNetworkChainId: state.activeNetworkChainId,
        networks: state.networks,
      })),
    );

  const [networkModalVisible, setNetworkModalVisible] = useState(false);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);

  const activeWallet = wallets[activeWalletIndex];
  const activeNetwork = networks.find(n => n.chainId === activeNetworkChainId);
  const isTestnet = !!activeNetwork?.isTestnet;
  const nativeSymbol = activeNetwork?.symbol || 'ETH';

  const {
    data: balance,
    refetch: refetchBalance,
    isLoading: isBalanceLoading,
    isError: isBalanceError,
  } = useBalance(activeWallet?.address, activeNetworkChainId);

  const {
    data: tokenData,
    isLoading: isTokensLoading,
    isError: isTokensError,
    refetch: refetchTokens,
  } = useQuery({
    queryKey: ['tokens', activeWallet?.address, activeNetworkChainId],
    queryFn: () =>
      tokenService.getTokens(activeWallet?.address || '', activeNetworkChainId),
    enabled: !!activeWallet?.address,
    staleTime: 30000,
  });

  // 네이티브 잔액은 송금 후 즉시 갱신되는 useBalance 값을 기준으로 맞춘다.
  const tokens = useMemo<Token[]>(() => {
    const list = Array.isArray(tokenData) ? tokenData : [];
    const formatted = balance?.formatted;
    if (!formatted) return list;
    return list.map(token => {
      if (token.address !== 'native') return token;
      const amount = Number(formatted);
      const usdValue =
        token.priceAvailable && !isTestnet && Number.isFinite(amount)
          ? amount * token.price
          : null;
      return {
        ...token,
        balance: formatDisplayAmount(formatted),
        balanceRaw: formatted,
        balanceError: false,
        usdValue,
        value: usdValue ?? 0,
      };
    });
  }, [tokenData, balance?.formatted, isTestnet]);

  const visibleTokens = useMemo(() => selectHomeTokens(tokens), [tokens]);

  // 포트폴리오와 같은 합산 규칙 (빈 목록/가치를 아는 자산이 없으면 null → '—')
  const totals = useMemo(() => summarizeTokenTotal(tokens), [tokens]);
  const totalNote = totalNoteKind(totals);

  const handleRefresh = useCallback(async () => {
    setIsPullRefreshing(true);
    try {
      await Promise.all([refetchBalance(), refetchTokens()]);
    } finally {
      setIsPullRefreshing(false);
    }
  }, [refetchBalance, refetchTokens]);

  const handleRetry = useCallback(() => {
    refetchBalance();
    refetchTokens();
  }, [refetchBalance, refetchTokens]);

  const handleCopyAddress = useCallback(() => {
    if (activeWallet?.address) {
      Clipboard.setString(activeWallet.address);
      showToast('주소를 복사했습니다', 'success');
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

  const handleAccounts = useCallback(() => {
    navigation.navigate('Accounts');
  }, [navigation]);

  const handleManageTokens = useCallback(() => {
    navigation.navigate('TokenManagement');
  }, [navigation]);

  const handleBuy = useCallback(() => {
    if (!activeWallet?.address) {
      Alert.alert('오류', '지갑 주소를 찾을 수 없습니다.');
      return;
    }
    showBuyProviderAlert(
      nativeSymbol.toLowerCase(),
      activeWallet.address,
      undefined,
      activeNetworkChainId,
    );
  }, [activeWallet?.address, nativeSymbol, activeNetworkChainId]);

  const handleOpenFaucet = useCallback(async () => {
    const url = FAUCET_URLS[activeNetworkChainId];
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch {
      showToast('Faucet 페이지를 열 수 없습니다', 'error');
    }
  }, [activeNetworkChainId]);

  const handleTokenPress = useCallback(
    (token: Token) => {
      navigation.navigate(
        'TokenDetail',
        tokenDetailParams(token, activeNetworkChainId),
      );
    },
    [navigation, activeNetworkChainId],
  );

  if (!activeWallet) {
    return (
      <TabScreen>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <EmptyContainer>
          <EmptyText>지갑이 없습니다</EmptyText>
        </EmptyContainer>
      </TabScreen>
    );
  }

  const accountName = activeWallet.name || `계정 ${activeWalletIndex + 1}`;
  const nativeBalanceText = balance?.formatted
    ? `${formatDisplayAmount(balance.formatted)} ${nativeSymbol}`
    : `— ${nativeSymbol}`;
  const faucetUrl = FAUCET_URLS[activeNetworkChainId];
  // 토큰 목록을 한 번도 읽지 못했으면 총액을 모른다('—').
  const totalText = formatFiat(tokenData ? totals.total : null);

  const renderHero = () => {
    if (isBalanceLoading && !balance) {
      return <BalanceSkeleton testID="home-skeleton" />;
    }
    if (isBalanceError && !balance && (isTokensError || !tokenData)) {
      return (
        <ErrorState
          compact
          title="잔액을 불러오지 못했습니다"
          message="네트워크 연결을 확인한 뒤 다시 시도해주세요."
          onRetry={handleRetry}
          testID="home-balance-error"
        />
      );
    }
    if (isTestnet) {
      return (
        <>
          <BalanceValue
            testID="home-balance-value"
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {mask(nativeBalanceText)}
          </BalanceValue>
          <TestnetLabel testID="home-balance-usd">
            테스트넷 — 실제 가치 없음
          </TestnetLabel>
        </>
      );
    }
    return (
      <>
        <BalanceCaption>총 자산</BalanceCaption>
        {isTokensLoading && !tokenData ? (
          <TotalSkeleton
            testID="home-total-skeleton"
            accessible
            accessibilityLabel="총 자산 불러오는 중"
          >
            <Skeleton width={160} height={36} alignSelf="center" />
          </TotalSkeleton>
        ) : (
          <BalanceValue
            testID="home-total-value"
            numberOfLines={1}
            adjustsFontSizeToFit
            accessibilityLabel={`총 자산 ${totalText}`}
          >
            {totalText}
          </BalanceValue>
        )}
        <BalanceLabel testID="home-balance-value">
          {mask(nativeBalanceText)}
        </BalanceLabel>
        {totalNote && tokenData && !hideBalances ? (
          <BalanceNote testID={`home-total-${totalNote}`}>
            {TOTAL_NOTES[totalNote]}
          </BalanceNote>
        ) : null}
      </>
    );
  };

  const renderTokenRow = (token: Token) => {
    const balanceText = `${token.balance} ${token.symbol}`;
    const fiatText = isTestnet
      ? '실제 가치 없음'
      : token.balanceError
      ? '잔액 조회 실패'
      : formatFiat(token.usdValue ?? null, { showTinyAsLessThan: true });
    const key = token.address === 'native' ? 'native' : token.address;
    return (
      <TokenItem
        key={key}
        onPress={() => handleTokenPress(token)}
        testID={`home-token-${key}`}
        accessibilityRole="button"
        accessibilityLabel={[
          token.name,
          mask(balanceText),
          hideBalances ? null : fiatText,
        ]
          .filter(Boolean)
          .join(', ')}
        accessibilityHint="토큰 상세 보기"
      >
        {token.logoUrl ? (
          <TokenLogo source={{ uri: token.logoUrl }} />
        ) : (
          <TokenIconContainer>
            <TokenIconText>{token.symbol.charAt(0)}</TokenIconText>
          </TokenIconContainer>
        )}
        <TokenInfo>
          <TokenName numberOfLines={1}>{token.symbol}</TokenName>
          <TokenNetwork numberOfLines={1}>{token.name}</TokenNetwork>
        </TokenInfo>
        <TokenBalanceContainer>
          <TokenBalance numberOfLines={1}>{mask(balanceText)}</TokenBalance>
          <TokenValue
            numberOfLines={1}
            $error={!!token.balanceError && !isTestnet}
          >
            {fiatText}
          </TokenValue>
        </TokenBalanceContainer>
        <ArrowIcon importantForAccessibility="no">›</ArrowIcon>
      </TokenItem>
    );
  };

  const renderTokenSection = () => {
    if (isTokensLoading && !tokenData) {
      return (
        <>
          <TokenItemSkeleton testID="home-tokens-skeleton" />
          <TokenItemSkeleton />
        </>
      );
    }
    if (isTokensError && visibleTokens.length === 0) {
      return (
        <ErrorState
          compact
          title="토큰 목록을 불러오지 못했습니다"
          onRetry={() => refetchTokens()}
          testID="home-tokens-error"
        />
      );
    }
    return visibleTokens.map(renderTokenRow);
  };

  return (
    <TabScreen testID="home-screen">
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScrollView
        testID="home-scroll-view"
        refreshControl={
          <RefreshControl
            refreshing={isPullRefreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        <Content>
          {/* 헤더: 계정 / 네트워크 / 잔액 숨기기 */}
          <HeaderRow>
            <AccountButton
              onPress={handleAccounts}
              testID="home-account-button"
              accessibilityRole="button"
              accessibilityLabel={`현재 계정 ${accountName}`}
              accessibilityHint="계정 목록 열기"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <AccountName numberOfLines={1}>{accountName}</AccountName>
              <Chevron importantForAccessibility="no">▾</Chevron>
            </AccountButton>
            <HeaderRight>
              <NetworkBadge
                onPress={() => setNetworkModalVisible(true)}
                testID="home-network-badge"
                accessibilityRole="button"
                accessibilityLabel={`네트워크 ${
                  activeNetwork?.name || '알 수 없음'
                }${isTestnet ? ', 테스트넷' : ''}`}
                accessibilityHint="네트워크 변경"
              >
                <NetworkDot $isTestnet={isTestnet} />
                <NetworkName testID="home-network-name" numberOfLines={1}>
                  {activeNetwork?.name || 'Unknown'}
                </NetworkName>
                <Chevron importantForAccessibility="no">▾</Chevron>
              </NetworkBadge>
              <IconButton
                icon={hideBalances ? '🙈' : '👁'}
                accessibilityLabel={
                  hideBalances ? '잔액 보이기' : '잔액 숨기기'
                }
                onPress={toggleHideBalances}
                testID="home-hide-balance-toggle"
              />
            </HeaderRight>
          </HeaderRow>

          {/* Wallet Card */}
          <WalletCard testID="home-wallet-card">
            <AddressRow
              onPress={handleCopyAddress}
              testID="home-address-row"
              accessibilityRole="button"
              accessibilityLabel={`지갑 주소 ${truncateAddress(
                activeWallet.address,
              )} 복사`}
            >
              <AddressText testID="home-address-text">
                {truncateAddress(activeWallet.address)}
              </AddressText>
              <CopyIcon importantForAccessibility="no">📋</CopyIcon>
            </AddressRow>

            <BalanceContainer testID="home-balance-container">
              {renderHero()}
            </BalanceContainer>

            <ActionRow testID="home-action-row">
              {[
                {
                  key: 'buy',
                  icon: '+',
                  label: '구매',
                  onPress: handleBuy,
                },
                {
                  key: 'send',
                  icon: '↑',
                  label: '보내기',
                  onPress: handleSend,
                },
                {
                  key: 'receive',
                  icon: '↓',
                  label: '받기',
                  onPress: handleReceive,
                },
                {
                  key: 'swap',
                  icon: '⇄',
                  label: '스왑',
                  onPress: handleSwap,
                },
                {
                  key: 'connect',
                  icon: '⊙',
                  label: '연결',
                  onPress: handleWalletConnect,
                },
              ].map(action => (
                <ActionButton
                  key={action.key}
                  onPress={action.onPress}
                  testID={`home-${action.key}-button`}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                >
                  <ActionIcon>
                    <ActionIconText importantForAccessibility="no">
                      {action.icon}
                    </ActionIconText>
                  </ActionIcon>
                  <ActionText>{action.label}</ActionText>
                </ActionButton>
              ))}
            </ActionRow>
          </WalletCard>

          {/* Tokens Section */}
          <SectionHeader>
            <SectionTitle accessibilityRole="header">토큰</SectionTitle>
          </SectionHeader>

          {renderTokenSection()}

          <ManageTokensButton
            onPress={handleManageTokens}
            testID="home-manage-tokens"
            accessibilityRole="button"
            accessibilityLabel="토큰 관리"
            accessibilityHint="토큰 숨기기, 사용자 토큰 추가"
          >
            <ManageTokensText>토큰 관리</ManageTokensText>
          </ManageTokensButton>

          {/* Info Box for Testnet */}
          {isTestnet && (
            <InfoBox>
              <InfoIcon importantForAccessibility="no">💡</InfoIcon>
              <InfoBody>
                <InfoText>
                  {activeNetwork?.name}에서 테스트 중입니다. 테스트넷 토큰은
                  실제 가치가 없습니다.
                </InfoText>
                {faucetUrl ? (
                  <FaucetButton
                    onPress={handleOpenFaucet}
                    testID="home-faucet-button"
                    accessibilityRole="link"
                    accessibilityLabel={`Faucet에서 테스트 ${nativeSymbol} 받기`}
                  >
                    <FaucetText>
                      Faucet에서 테스트 {nativeSymbol} 받기 ↗
                    </FaucetText>
                  </FaucetButton>
                ) : null}
              </InfoBody>
            </InfoBox>
          )}

          {/* Warning Box for Mainnet */}
          {!isTestnet && (
            <MainnetWarningBox>
              <InfoIcon importantForAccessibility="no">⚠️</InfoIcon>
              <InfoText>
                {activeNetwork?.name}은 실제 자산이 사용됩니다.{'\n'}
                전송 시 주의하세요.
              </InfoText>
            </MainnetWarningBox>
          )}
        </Content>
      </ScrollView>

      <NetworkSelectorModal
        visible={networkModalVisible}
        onClose={() => setNetworkModalVisible(false)}
      />
    </TabScreen>
  );
}

const Content = styled.View`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.lg}px;
  padding-top: ${({ theme }) => theme.spacing.sm}px;
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

const HeaderRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const AccountButton = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  flex-shrink: 1;
  min-height: 44px;
  padding-right: ${({ theme }) => theme.spacing.sm}px;
`;

const AccountName = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 18px;
  font-weight: 700;
  flex-shrink: 1;
`;

const Chevron = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 12px;
  margin-left: ${({ theme }) => theme.spacing.xs}px;
`;

const HeaderRight = styled.View`
  flex-direction: row;
  align-items: center;
  flex-shrink: 1;
`;

const NetworkBadge = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  flex-shrink: 1;
  min-height: 44px;
  background-color: ${({ theme }) => theme.colors.surface};
  padding: 0 ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.full}px;
  margin-right: ${({ theme }) => theme.spacing.xs}px;
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
  flex-shrink: 1;
`;

const WalletCard = styled.View`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.xl}px;
  padding: ${({ theme }) => theme.spacing.lg}px;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const AddressRow = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  align-self: center;
  min-height: 44px;
  padding: 0 ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
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
  min-height: 96px;
  justify-content: center;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const BalanceCaption = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
`;

const TotalSkeleton = styled.View`
  align-self: center;
`;

const BalanceValue = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 34px;
  font-weight: 700;
  text-align: center;
`;

const BalanceLabel = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
`;

const TestnetLabel = styled.Text`
  color: ${({ theme }) => theme.colors.warning};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  font-weight: 600;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
`;

const BalanceNote = styled.Text`
  color: ${({ theme }) => theme.colors.textTertiary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
  text-align: center;
`;

const ActionRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
`;

const ActionButton = styled.TouchableOpacity`
  align-items: center;
  flex: 1;
  min-height: 44px;
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
  color: ${({ theme }) => theme.colors.onPrimary};
`;

const ActionText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 12px;
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
  min-height: 64px;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.lg}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const TokenLogo = styled(Image)`
  width: 40px;
  height: 40px;
  border-radius: 20px;
  margin-right: ${({ theme }) => theme.spacing.md}px;
  background-color: ${({ theme }) => theme.colors.backgroundSecondary};
`;

const TokenIconContainer = styled.View`
  width: 40px;
  height: 40px;
  border-radius: 20px;
  background-color: ${({ theme }) => theme.colors.primarySubtle};
  align-items: center;
  justify-content: center;
  margin-right: ${({ theme }) => theme.spacing.md}px;
`;

const TokenIconText = styled.Text`
  font-size: 18px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.primary};
`;

const TokenInfo = styled.View`
  flex: 1;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
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
  flex-shrink: 1;
`;

const TokenBalance = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  font-weight: 500;
`;

const TokenValue = styled.Text<{ $error?: boolean }>`
  color: ${({ theme, $error }) =>
    $error ? theme.colors.error : theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
`;

const ManageTokensButton = styled.TouchableOpacity`
  min-height: 44px;
  align-items: center;
  justify-content: center;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  border-width: 1px;
  border-color: ${({ theme }) => theme.colors.border};
`;

const ManageTokensText = styled.Text`
  color: ${({ theme }) => theme.colors.primary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  font-weight: 600;
`;

const InfoBox = styled.View`
  flex-direction: row;
  background-color: ${({ theme }) => theme.colors.warningSubtle};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-top: ${({ theme }) => theme.spacing.lg}px;
  border-left-width: 4px;
  border-left-color: ${({ theme }) => theme.colors.warning};
`;

const InfoBody = styled.View`
  flex: 1;
`;

const FaucetButton = styled.TouchableOpacity`
  min-height: 44px;
  justify-content: center;
  align-self: flex-start;
`;

const FaucetText = styled.Text`
  color: ${({ theme }) => theme.colors.primary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  font-weight: 600;
`;

const MainnetWarningBox = styled.View`
  flex-direction: row;
  background-color: ${({ theme }) => theme.colors.errorSubtle};
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
