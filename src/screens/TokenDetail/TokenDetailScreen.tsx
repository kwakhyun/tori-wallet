/**
 * 토큰 상세 화면 (잔액, 가치, 시세, 전송/수신/스왑)
 *
 * - 네이티브/ERC-20 모두 이 화면에서 잔액을 다시 조회한다 (당겨서 새로고침 포함).
 * - 테스트넷 자산은 법정화폐 가치를 표시하지 않는다.
 * - 화면은 토큰 목록을 읽은 체인(route.params.chainId)에 고정된다. 잔액/시세/탐색기
 *   링크는 모두 그 체인 기준이며, 보는 동안 활성 네트워크가 바뀌면(dApp의 체인 전환
 *   승인 등) 안내를 띄우고 보내기/받기/스왑/구매를 막는다 — 다른 체인에서 같은
 *   컨트랙트 주소/심볼로 동작하지 않게 한다.
 */

import React, { useCallback, useMemo, useState } from 'react';
import styled from 'styled-components/native';
import { useShallow } from 'zustand/react/shallow';
import {
  StatusBar,
  ScrollView,
  RefreshControl,
  Linking,
  Image,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { useTheme } from '@/hooks/useTheme';
import { useWalletStore } from '@/store/walletStore';
import { useBalance, useTokenBalance } from '@/hooks/useBalance';
import { useFiat } from '@/hooks/useFiat';
import { tokenService } from '@/services/tokenService';
import { coinService } from '@/services/coinService';
import { showBuyProviderAlert } from '@/services/buyService';
import { showToast } from '@/store/toastStore';
import { formatDisplayAmount } from '@/utils/format';
import { Screen } from '@/components/common/Screen';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { LineChart } from '@/components/charts/LineChart';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type TokenDetailRouteProp = RouteProp<RootStackParamList, 'TokenDetail'>;

const CHART_DAYS = '7';

function formatChartLabel(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function TokenDetailScreen(): React.JSX.Element {
  const { theme, isDarkMode } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<TokenDetailRouteProp>();
  const { width: windowWidth } = useWindowDimensions();
  const { formatFiat, mask } = useFiat();
  const {
    symbol,
    name,
    balance,
    usdValue: initialUsdValue,
    contractAddress,
    decimals,
    coingeckoId,
    logoUrl,
  } = route.params;
  // 체인 ID가 없는 과거 형식 파라미터(상태 복원 등)는 연 시점의 활성 네트워크로 고정
  const paramChainId = route.params.chainId as number | undefined;

  const { wallets, activeWalletIndex, activeNetworkChainId, networks } =
    useWalletStore(
      useShallow(state => ({
        wallets: state.wallets,
        activeWalletIndex: state.activeWalletIndex,
        activeNetworkChainId: state.activeNetworkChainId,
        networks: state.networks,
      })),
    );
  const [chainId] = useState(() => paramChainId ?? activeNetworkChainId);
  const activeWallet = wallets[activeWalletIndex];
  const network = networks.find(n => n.chainId === chainId);
  const activeNetwork = networks.find(n => n.chainId === activeNetworkChainId);
  const networkChanged = activeNetworkChainId !== chainId;
  const isTestnet = !!network?.isTestnet || tokenService.isTestnet(chainId);
  const hasMarketData = !!coingeckoId && !isTestnet;

  const [isPullRefreshing, setIsPullRefreshing] = useState(false);

  // 네이티브/ERC-20 중 하나만 활성화된다 (useTokenBalance는 주소가 없으면 비활성).
  const nativeBalance = useBalance(
    contractAddress ? undefined : activeWallet?.address,
    chainId,
  );
  const tokenBalance = useTokenBalance(
    contractAddress ? activeWallet?.address : undefined,
    contractAddress ?? '',
    decimals ?? 18,
    chainId,
  );
  const balanceQuery = contractAddress ? tokenBalance : nativeBalance;

  const priceQuery = useQuery({
    queryKey: ['tokenPrice', coingeckoId, chainId],
    queryFn: () => tokenService.getPrice(coingeckoId, chainId),
    enabled: hasMarketData,
    staleTime: 60 * 1000,
  });

  const historyQuery = useQuery({
    queryKey: ['priceHistory', coingeckoId, CHART_DAYS],
    queryFn: () =>
      coinService.getPriceHistory(coingeckoId as string, CHART_DAYS),
    enabled: hasMarketData,
    staleTime: 10 * 60 * 1000,
  });

  const formattedBalance = balanceQuery.data?.formatted;
  const amount =
    formattedBalance !== undefined ? Number(formattedBalance) : null;
  const balanceText =
    formattedBalance !== undefined
      ? formatDisplayAmount(formattedBalance)
      : balance || '—';

  const price = priceQuery.data ?? null;
  const usdValue = useMemo(() => {
    if (isTestnet) return null;
    if (price && amount !== null && Number.isFinite(amount)) {
      return amount * price.price;
    }
    return initialUsdValue ?? null;
  }, [isTestnet, price, amount, initialUsdValue]);

  const chart = useMemo(() => {
    const points = historyQuery.data?.prices ?? [];
    return {
      labels: points.map(([timestamp]) => formatChartLabel(timestamp)),
      values: points.map(([, value]) => value),
    };
  }, [historyQuery.data]);

  const handleRefresh = useCallback(async () => {
    setIsPullRefreshing(true);
    try {
      const tasks: Promise<unknown>[] = [balanceQuery.refetch()];
      if (hasMarketData)
        tasks.push(priceQuery.refetch(), historyQuery.refetch());
      await Promise.all(tasks);
    } finally {
      setIsPullRefreshing(false);
    }
  }, [balanceQuery, priceQuery, historyQuery, hasMarketData]);

  // 아래 동작은 모두 활성 네트워크에서 실행되므로, 체인이 바뀌었으면 막는다.
  const handleSend = useCallback(() => {
    if (networkChanged) return;
    navigation.navigate('SendTransaction', {
      tokenAddress: contractAddress,
    });
  }, [navigation, contractAddress, networkChanged]);

  const handleReceive = useCallback(() => {
    if (networkChanged) return;
    if (contractAddress) {
      navigation.navigate('ReceiveToken', { tokenAddress: contractAddress });
    } else {
      navigation.navigate('ReceiveToken');
    }
  }, [navigation, contractAddress, networkChanged]);

  const handleSwap = useCallback(() => {
    if (networkChanged) return;
    navigation.navigate('Swap');
  }, [navigation, networkChanged]);

  const handleBuy = useCallback(() => {
    if (networkChanged || !activeWallet?.address) return;
    showBuyProviderAlert(
      symbol.toLowerCase(),
      activeWallet.address,
      undefined,
      chainId,
    );
  }, [activeWallet?.address, symbol, chainId, networkChanged]);

  const handleMarketInfo = useCallback(() => {
    if (!coingeckoId) return;
    navigation.navigate('CoinDetail', {
      coinId: coingeckoId,
      coinName: name,
      coinSymbol: symbol,
      coinImage: logoUrl ?? '',
    });
  }, [navigation, coingeckoId, name, symbol, logoUrl]);

  const explorerUrl = useMemo(() => {
    const baseUrl = network?.blockExplorerUrl?.replace(/\/+$/, '');
    if (!baseUrl || !activeWallet?.address) return null;
    return contractAddress
      ? `${baseUrl}/token/${contractAddress}?a=${activeWallet.address}`
      : `${baseUrl}/address/${activeWallet.address}`;
  }, [network?.blockExplorerUrl, activeWallet?.address, contractAddress]);

  const handleViewExplorer = useCallback(async () => {
    if (!explorerUrl) return;
    try {
      await Linking.openURL(explorerUrl);
    } catch {
      showToast('블록 탐색기를 열 수 없습니다', 'error');
    }
  }, [explorerUrl]);

  const balanceLoading = balanceQuery.isLoading && !balanceQuery.data;
  const balanceFailed = balanceQuery.isError && !balanceQuery.data;
  const change = price?.change24h ?? null;
  const changeColor =
    change === null
      ? theme.colors.textSecondary
      : change >= 0
      ? theme.colors.success
      : theme.colors.error;

  const actions = [
    { key: 'send', icon: '↑', label: '보내기', onPress: handleSend },
    { key: 'receive', icon: '↓', label: '받기', onPress: handleReceive },
    { key: 'swap', icon: '⇄', label: '스왑', onPress: handleSwap },
    { key: 'buy', icon: '+', label: '구매', onPress: handleBuy },
  ];

  return (
    <Screen testID="token-detail-screen">
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScreenHeader
        title={symbol}
        subtitle={network?.name}
        testID="token-detail-header"
      />

      <ScrollView
        testID="token-detail-scroll"
        refreshControl={
          <RefreshControl
            refreshing={isPullRefreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        <Content>
          {/* Token Icon & Balance */}
          <TokenHeader>
            {logoUrl ? (
              <TokenLogo source={{ uri: logoUrl }} />
            ) : (
              <TokenIconLarge>
                <TokenIconText importantForAccessibility="no">
                  {symbol === 'ETH' || symbol === 'SepoliaETH'
                    ? 'Ξ'
                    : symbol.charAt(0)}
                </TokenIconText>
              </TokenIconLarge>
            )}
            <TokenName>{name}</TokenName>
            {balanceLoading ? (
              <ActivityIndicator
                color={theme.colors.primary}
                accessibilityLabel="잔액 불러오는 중"
              />
            ) : (
              <BalanceValue
                testID="token-detail-balance"
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {mask(`${balanceText} ${symbol}`)}
              </BalanceValue>
            )}
            {balanceFailed ? (
              <BalanceError testID="token-detail-balance-error">
                최신 잔액을 불러오지 못했습니다. 아래로 당겨 다시 시도하세요.
              </BalanceError>
            ) : null}
            <BalanceFiat testID="token-detail-fiat">
              {isTestnet ? '테스트넷 — 실제 가치 없음' : formatFiat(usdValue)}
            </BalanceFiat>
          </TokenHeader>

          {/* 보는 동안 활성 네트워크가 바뀐 경우 */}
          {networkChanged ? (
            <NetworkNotice
              testID="token-detail-network-changed"
              accessibilityRole="alert"
            >
              <NetworkNoticeTitle>네트워크가 바뀌었습니다</NetworkNoticeTitle>
              <NetworkNoticeText testID="token-detail-network-changed-text">
                {`지금 네트워크는 ${
                  activeNetwork?.name ?? '다른 네트워크'
                }입니다. 이 화면의 ${symbol}은(는) ${
                  network?.name ?? '이전 네트워크'
                } 자산이라 보내기·받기·스왑·구매를 막았습니다.`}
              </NetworkNoticeText>
              <NetworkNoticeButton
                onPress={() => navigation.goBack()}
                testID="token-detail-network-back"
                accessibilityRole="button"
                accessibilityLabel="돌아가기"
              >
                <NetworkNoticeButtonText>돌아가기</NetworkNoticeButtonText>
              </NetworkNoticeButton>
            </NetworkNotice>
          ) : null}

          {/* Action Buttons */}
          <ActionRow>
            {actions.map(action => (
              <ActionButton
                key={action.key}
                onPress={action.onPress}
                disabled={networkChanged}
                testID={`token-detail-${action.key}`}
                accessibilityRole="button"
                accessibilityLabel={`${symbol} ${action.label}`}
                accessibilityState={{ disabled: networkChanged }}
              >
                <ActionIcon $disabled={networkChanged}>
                  <ActionIconText
                    importantForAccessibility="no"
                    $disabled={networkChanged}
                  >
                    {action.icon}
                  </ActionIconText>
                </ActionIcon>
                <ActionLabel>{action.label}</ActionLabel>
              </ActionButton>
            ))}
          </ActionRow>

          {/* 시세 */}
          {hasMarketData ? (
            <Section>
              <SectionTitle accessibilityRole="header">시세</SectionTitle>
              <InfoCard>
                <PriceRow>
                  <PriceValue testID="token-detail-price">
                    {priceQuery.isLoading
                      ? '…'
                      : formatFiat(price?.price ?? null, {
                          ignoreHidden: true,
                          maximumFractionDigits:
                            (price?.price ?? 0) < 1 ? 6 : undefined,
                        })}
                  </PriceValue>
                  <PriceChange
                    style={{ color: changeColor }}
                    testID="token-detail-change"
                  >
                    {change === null
                      ? '—'
                      : `${change >= 0 ? '+' : ''}${change.toFixed(
                          2,
                        )}% (24시간)`}
                  </PriceChange>
                </PriceRow>
                {historyQuery.isLoading ? (
                  <ChartLoading>
                    <ActivityIndicator color={theme.colors.primary} />
                  </ChartLoading>
                ) : historyQuery.isError ? (
                  <ChartMessage>
                    가격 차트를 불러오지 못했습니다. 아래로 당겨 다시
                    시도하세요.
                  </ChartMessage>
                ) : (
                  <LineChart
                    labels={chart.labels}
                    values={chart.values}
                    width={Math.max(windowWidth - 80, 200)}
                    height={150}
                    showChange={false}
                    title={`${symbol} 7일 가격`}
                    emptyTitle="차트 데이터 없음"
                    emptyMessage=""
                    formatValue={(value, digits) =>
                      formatFiat(value, {
                        compact: true,
                        ignoreHidden: true,
                        maximumFractionDigits: digits,
                      })
                    }
                    testID="token-detail-chart"
                  />
                )}
                <MarketLink
                  onPress={handleMarketInfo}
                  testID="token-detail-market-info"
                  accessibilityRole="button"
                  accessibilityLabel={`${name} 시장 정보 보기`}
                >
                  <MarketLinkText>시장 정보 ›</MarketLinkText>
                </MarketLink>
              </InfoCard>
            </Section>
          ) : null}

          {/* Token Info */}
          <Section>
            <SectionTitle accessibilityRole="header">토큰 정보</SectionTitle>
            <InfoCard>
              <InfoRow>
                <InfoLabel>네트워크</InfoLabel>
                <InfoValue>{network?.name ?? `체인 ID ${chainId}`}</InfoValue>
              </InfoRow>
              <InfoRow>
                <InfoLabel>심볼</InfoLabel>
                <InfoValue>{symbol}</InfoValue>
              </InfoRow>
              {contractAddress && (
                <InfoRow>
                  <InfoLabel>컨트랙트</InfoLabel>
                  <InfoValue
                    numberOfLines={1}
                    ellipsizeMode="middle"
                    selectable
                  >
                    {contractAddress}
                  </InfoValue>
                </InfoRow>
              )}
              {contractAddress && decimals !== undefined && (
                <InfoRow>
                  <InfoLabel>소수 자릿수</InfoLabel>
                  <InfoValue>{decimals}</InfoValue>
                </InfoRow>
              )}
            </InfoCard>
          </Section>

          {/* View on Explorer */}
          {explorerUrl ? (
            <ExplorerButton
              onPress={handleViewExplorer}
              testID="token-detail-explorer"
              accessibilityRole="link"
              accessibilityLabel="블록 탐색기에서 보기"
            >
              <ExplorerButtonText>블록 탐색기에서 보기 ↗</ExplorerButtonText>
            </ExplorerButton>
          ) : null}
        </Content>
      </ScrollView>
    </Screen>
  );
}

const Content = styled.View`
  padding: ${({ theme }) => theme.spacing.lg}px;
`;

const TokenHeader = styled.View`
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.xl}px;
`;

const TokenLogo = styled(Image)`
  width: 72px;
  height: 72px;
  border-radius: 36px;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
  background-color: ${({ theme }) => theme.colors.backgroundSecondary};
`;

const TokenIconLarge = styled.View`
  width: 72px;
  height: 72px;
  border-radius: 36px;
  background-color: ${({ theme }) => theme.colors.primarySubtle};
  align-items: center;
  justify-content: center;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const TokenIconText = styled.Text`
  font-size: 32px;
  color: ${({ theme }) => theme.colors.primary};
`;

const TokenName = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const BalanceValue = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 30px;
  font-weight: 700;
  text-align: center;
`;

const BalanceError = styled.Text`
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
  text-align: center;
`;

const BalanceFiat = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
`;

const ActionRow = styled.View`
  flex-direction: row;
  justify-content: space-around;
  margin-bottom: ${({ theme }) => theme.spacing.xl}px;
`;

const ActionButton = styled.TouchableOpacity`
  align-items: center;
  min-width: 64px;
  min-height: 44px;
`;

const ActionIcon = styled.View<{ $disabled?: boolean }>`
  width: 48px;
  height: 48px;
  border-radius: 24px;
  background-color: ${({ theme, $disabled }) =>
    $disabled ? theme.colors.disabledBackground : theme.colors.primary};
  align-items: center;
  justify-content: center;
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
`;

const ActionIconText = styled.Text<{ $disabled?: boolean }>`
  font-size: 22px;
  color: ${({ theme, $disabled }) =>
    $disabled ? theme.colors.disabledText : theme.colors.onPrimary};
`;

const NetworkNotice = styled.View`
  background-color: ${({ theme }) => theme.colors.warningSubtle};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  border-left-width: 4px;
  border-left-color: ${({ theme }) => theme.colors.warning};
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const NetworkNoticeTitle = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  font-weight: 600;
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
`;

const NetworkNoticeText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  line-height: 20px;
`;

const NetworkNoticeButton = styled.TouchableOpacity`
  min-height: 44px;
  justify-content: center;
  align-self: flex-start;
`;

const NetworkNoticeButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.primary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  font-weight: 600;
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
  font-weight: 600;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const InfoCard = styled.View`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
`;

const PriceRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: wrap;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const PriceValue = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 20px;
  font-weight: 700;
`;

const PriceChange = styled.Text`
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  font-weight: 600;
`;

const ChartLoading = styled.View`
  height: 150px;
  align-items: center;
  justify-content: center;
`;

const ChartMessage = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  text-align: center;
  padding: ${({ theme }) => theme.spacing.lg}px 0;
`;

const MarketLink = styled.TouchableOpacity`
  min-height: 44px;
  justify-content: center;
  align-items: flex-end;
`;

const MarketLinkText = styled.Text`
  color: ${({ theme }) => theme.colors.primary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  font-weight: 600;
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
  min-height: 48px;
  padding: ${({ theme }) => theme.spacing.md}px;
  align-items: center;
  justify-content: center;
`;

const ExplorerButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.primary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  font-weight: 500;
`;

export default TokenDetailScreen;
