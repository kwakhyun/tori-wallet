/**
 * 코인 상세 화면 (가격, 시세 그래프, 내 보유량, 구매)
 *
 * - 차트는 react-native-svg 경로(LineChart)로 그린다.
 * - 기간을 바꾸면 차트 영역에 로딩 표시를 한다.
 * - 현재 네트워크에서 이 자산을 보유 중이면 보유량과 보내기/스왑을 보여 준다.
 * - 조회 실패는 $0.00이 아니라 '—'와 다시 시도로 표시한다.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import styled from 'styled-components/native';
import { useShallow } from 'zustand/react/shallow';
import {
  StatusBar,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Image,
  useWindowDimensions,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { useTheme } from '@/hooks/useTheme';
import { useFiat } from '@/hooks/useFiat';
import { useWalletStore } from '@/store/walletStore';
import { showToast } from '@/store/toastStore';
import { coinService } from '@/services/coinService';
import { tokenService, type Token } from '@/services/tokenService';
import { showBuyProviderAlert } from '@/services/buyService';
import { formatDisplayAmount } from '@/utils/format';
import { Screen } from '@/components/common/Screen';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { ErrorState } from '@/components/common/StateViews';
import { LineChart } from '@/components/charts/LineChart';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type CoinDetailRouteProp = RouteProp<RootStackParamList, 'CoinDetail'>;

const CHART_HEIGHT = 200;

// 1일, 7일, 1달만 지원 (API 요청량 절감)
type TimeRange = '1' | '7' | '30';
const RANGES: { value: TimeRange; label: string }[] = [
  { value: '1', label: '1일' },
  { value: '7', label: '7일' },
  { value: '30', label: '1달' },
];

function formatChartLabel(timestamp: number, range: TimeRange): string {
  const date = new Date(timestamp);
  if (range === '1') {
    return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function isHeld(token: Token): boolean {
  if (token.balanceError) return false;
  const amount = Number(token.balanceRaw);
  return Number.isFinite(amount) && amount > 0;
}

function CoinDetailScreen(): React.JSX.Element {
  const { theme, isDarkMode } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<CoinDetailRouteProp>();
  const { width: windowWidth } = useWindowDimensions();
  const { formatFiat, mask } = useFiat();
  const { coinId, coinName, coinSymbol, coinImage } = route.params;

  const { wallets, activeWalletIndex, activeNetworkChainId, networks } =
    useWalletStore(
      useShallow(state => ({
        wallets: state.wallets,
        activeWalletIndex: state.activeWalletIndex,
        activeNetworkChainId: state.activeNetworkChainId,
        networks: state.networks,
      })),
    );
  const activeWallet = wallets?.[activeWalletIndex];
  const activeNetwork = networks?.find(n => n.chainId === activeNetworkChainId);

  const [selectedRange, setSelectedRange] = useState<TimeRange>('7');
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);

  // Rate Limit 안내는 화면을 막지 않는 토스트로 표시
  useEffect(() => {
    coinService.setRateLimitCallback((message: string) => {
      showToast(message.replace(/\n/g, ' '), 'warning');
    });
  }, []);

  const detailQuery = useQuery({
    queryKey: ['coinDetail', coinId],
    queryFn: () => coinService.getCoinDetail(coinId),
    staleTime: 3 * 60 * 1000,
    retry: false,
  });

  const historyQuery = useQuery({
    queryKey: ['priceHistory', coinId, selectedRange],
    queryFn: () => coinService.getPriceHistory(coinId, selectedRange),
    staleTime: 10 * 60 * 1000,
    retry: false,
    // 기간을 바꾸는 동안 이전 차트를 유지하고 로딩 표시를 덮는다.
    placeholderData: keepPreviousData,
  });

  // 현재 네트워크의 보유 토큰 (홈/포트폴리오와 같은 캐시 사용)
  const tokensQuery = useQuery({
    queryKey: ['tokens', activeWallet?.address, activeNetworkChainId],
    queryFn: () =>
      tokenService.getTokens(activeWallet?.address || '', activeNetworkChainId),
    enabled: !!activeWallet?.address,
    staleTime: 30000,
  });

  const holding = useMemo(() => {
    const list = Array.isArray(tokensQuery.data) ? tokensQuery.data : [];
    return (
      list.find(token => token.coingeckoId === coinId && isHeld(token)) ?? null
    );
  }, [tokensQuery.data, coinId]);

  const chart = useMemo(() => {
    const points = historyQuery.data?.prices ?? [];
    return {
      labels: points.map(([timestamp]) =>
        formatChartLabel(timestamp, selectedRange),
      ),
      values: points.map(([, value]) => value),
    };
  }, [historyQuery.data, selectedRange]);

  const handleRefresh = useCallback(async () => {
    setIsPullRefreshing(true);
    try {
      await Promise.all([
        detailQuery.refetch(),
        historyQuery.refetch(),
        activeWallet?.address ? tokensQuery.refetch() : Promise.resolve(),
      ]);
    } finally {
      setIsPullRefreshing(false);
    }
  }, [detailQuery, historyQuery, tokensQuery, activeWallet?.address]);

  const handleBuy = useCallback(() => {
    showBuyProviderAlert(
      coinSymbol,
      activeWallet?.address,
      undefined,
      activeNetworkChainId,
    );
  }, [coinSymbol, activeWallet?.address, activeNetworkChainId]);

  const handleSend = useCallback(() => {
    if (!holding) return;
    navigation.navigate('SendTransaction', {
      tokenAddress: holding.address === 'native' ? undefined : holding.address,
    });
  }, [navigation, holding]);

  const handleSwap = useCallback(() => {
    navigation.navigate('Swap');
  }, [navigation]);

  const marketData = detailQuery.data?.market_data;
  const currentPrice = marketData?.current_price?.usd ?? null;
  const priceChange24h = marketData?.price_change_percentage_24h ?? null;
  const priceDigits = (value: number | null | undefined) =>
    value !== null && value !== undefined && value < 1 ? 6 : undefined;
  const formatPrice = (value: number | null | undefined) =>
    formatFiat(value ?? null, {
      ignoreHidden: true,
      maximumFractionDigits: priceDigits(value),
    });
  const formatPercent = (value: number | null | undefined) =>
    value === null || value === undefined || !Number.isFinite(value)
      ? '—'
      : `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  const changeColor = (value: number | null | undefined) =>
    value === null || value === undefined
      ? theme.colors.textSecondary
      : value >= 0
      ? theme.colors.success
      : theme.colors.error;

  const marketRows: { label: string; value: string }[] = [
    {
      label: '시가총액',
      value: formatFiat(marketData?.market_cap?.usd || null, {
        compact: true,
        ignoreHidden: true,
      }),
    },
    {
      label: '24시간 거래량',
      value: formatFiat(marketData?.total_volume?.usd || null, {
        compact: true,
        ignoreHidden: true,
      }),
    },
    { label: '24시간 최고', value: formatPrice(marketData?.high_24h?.usd) },
    { label: '24시간 최저', value: formatPrice(marketData?.low_24h?.usd) },
    { label: '역대 최고가', value: formatPrice(marketData?.ath?.usd) },
    {
      label: '유통량',
      value: marketData?.circulating_supply
        ? `${formatDisplayAmount(
            Math.round(marketData.circulating_supply),
          )} ${coinSymbol.toUpperCase()}`
        : '—',
    },
  ];

  const renderChart = () => {
    const chartWidth = Math.max(windowWidth - 48, 200);
    if (historyQuery.isError && !historyQuery.data) {
      return (
        <ChartBox style={{ height: CHART_HEIGHT }}>
          <ErrorState
            compact
            title="차트를 불러오지 못했습니다"
            message=""
            onRetry={() => historyQuery.refetch()}
            testID="coin-detail-chart-error"
          />
        </ChartBox>
      );
    }
    return (
      <ChartBox style={{ minHeight: CHART_HEIGHT }}>
        {historyQuery.data ? (
          <LineChart
            labels={chart.labels}
            values={chart.values}
            width={chartWidth}
            height={CHART_HEIGHT}
            showChange={false}
            color={changeColor(
              chart.values.length > 1
                ? chart.values[chart.values.length - 1] - chart.values[0]
                : null,
            )}
            title={`${coinName} 가격`}
            emptyTitle="차트 데이터 없음"
            emptyMessage=""
            formatValue={(value, digits) =>
              formatFiat(value, {
                compact: true,
                ignoreHidden: true,
                maximumFractionDigits: digits,
              })
            }
            testID="coin-detail-chart"
          />
        ) : null}
        {historyQuery.isFetching ? (
          <ChartLoadingOverlay testID="coin-detail-chart-loading">
            <ActivityIndicator
              color={theme.colors.primary}
              accessibilityLabel="차트 불러오는 중"
            />
          </ChartLoadingOverlay>
        ) : null}
      </ChartBox>
    );
  };

  const isInitialLoading = detailQuery.isLoading && !detailQuery.data;

  return (
    <Screen testID="coin-detail-screen">
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScreenHeader title={coinName} subtitle={coinSymbol.toUpperCase()} />

      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={isPullRefreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        <Content>
          {/* 가격 정보 */}
          <PriceSection>
            {coinImage ? <CoinImage source={{ uri: coinImage }} /> : null}
            {isInitialLoading ? (
              <ActivityIndicator
                color={theme.colors.primary}
                accessibilityLabel="가격 불러오는 중"
              />
            ) : detailQuery.isError && !detailQuery.data ? (
              <ErrorState
                compact
                title="코인 정보를 불러오지 못했습니다"
                onRetry={() => detailQuery.refetch()}
                testID="coin-detail-error"
              />
            ) : (
              <>
                <CurrentPrice testID="coin-detail-price">
                  {formatPrice(currentPrice)}
                </CurrentPrice>
                <PriceChangeRow>
                  <ColoredText $color={changeColor(priceChange24h)}>
                    {formatPercent(priceChange24h)}
                  </ColoredText>
                  <PriceChangeLabel>24시간</PriceChangeLabel>
                </PriceChangeRow>
              </>
            )}
          </PriceSection>

          {/* 시세 차트 */}
          <ChartSection>
            {renderChart()}
            <TimeRangeRow accessibilityRole="tablist">
              {RANGES.map(range => {
                const active = selectedRange === range.value;
                return (
                  <TimeRangeButton
                    key={range.value}
                    onPress={() => setSelectedRange(range.value)}
                    $active={active}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${range.label} 차트`}
                    testID={`coin-detail-range-${range.value}`}
                  >
                    <TimeRangeText $active={active}>
                      {range.label}
                    </TimeRangeText>
                  </TimeRangeButton>
                );
              })}
            </TimeRangeRow>
          </ChartSection>

          {/* 내 보유량 */}
          {holding ? (
            <Section testID="coin-detail-holding">
              <SectionTitle accessibilityRole="header">
                내 보유량 · {activeNetwork?.name}
              </SectionTitle>
              <InfoCard>
                <HoldingAmount>
                  {mask(`${holding.balance} ${holding.symbol}`)}
                </HoldingAmount>
                <HoldingValue>
                  {holding.isTestnet
                    ? '테스트넷 — 실제 가치 없음'
                    : formatFiat(holding.usdValue ?? null)}
                </HoldingValue>
                <HoldingActions>
                  <SecondaryButton
                    onPress={handleSend}
                    accessibilityRole="button"
                    accessibilityLabel={`${holding.symbol} 보내기`}
                    testID="coin-detail-send"
                  >
                    <SecondaryButtonText>보내기</SecondaryButtonText>
                  </SecondaryButton>
                  <SecondaryButton
                    onPress={handleSwap}
                    accessibilityRole="button"
                    accessibilityLabel={`${holding.symbol} 스왑`}
                    testID="coin-detail-swap"
                  >
                    <SecondaryButtonText>스왑</SecondaryButtonText>
                  </SecondaryButton>
                </HoldingActions>
              </InfoCard>
            </Section>
          ) : null}

          {/* 구매 버튼 */}
          <BuyButton
            onPress={handleBuy}
            accessibilityRole="button"
            accessibilityLabel={`${coinSymbol.toUpperCase()} 구매하기`}
            testID="coin-detail-buy"
          >
            <BuyButtonText>{coinSymbol.toUpperCase()} 구매하기</BuyButtonText>
          </BuyButton>

          {/* 시장 정보 */}
          <Section>
            <SectionTitle accessibilityRole="header">시장 정보</SectionTitle>
            <InfoCard>
              {marketRows.map(row => (
                <InfoRow key={row.label}>
                  <InfoLabel>{row.label}</InfoLabel>
                  <InfoValue>{detailQuery.data ? row.value : '—'}</InfoValue>
                </InfoRow>
              ))}
            </InfoCard>
          </Section>

          {/* 가격 변동 */}
          <Section>
            <SectionTitle accessibilityRole="header">가격 변동</SectionTitle>
            <InfoCard>
              <InfoRow>
                <InfoLabel>7일</InfoLabel>
                <ColoredText
                  $color={changeColor(marketData?.price_change_percentage_7d)}
                >
                  {formatPercent(marketData?.price_change_percentage_7d)}
                </ColoredText>
              </InfoRow>
              <InfoRow>
                <InfoLabel>30일</InfoLabel>
                <ColoredText
                  $color={changeColor(marketData?.price_change_percentage_30d)}
                >
                  {formatPercent(marketData?.price_change_percentage_30d)}
                </ColoredText>
              </InfoRow>
            </InfoCard>
          </Section>
        </Content>
      </ScrollView>
    </Screen>
  );
}

const Content = styled.View`
  padding: ${({ theme }) => theme.spacing.lg}px;
`;

const PriceSection = styled.View`
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const CoinImage = styled(Image)`
  width: 48px;
  height: 48px;
  border-radius: 24px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const CurrentPrice = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 32px;
  font-weight: 700;
`;

const PriceChangeRow = styled.View`
  flex-direction: row;
  align-items: center;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
`;

const ColoredText = styled.Text<{ $color: string }>`
  color: ${({ $color }) => $color};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  font-weight: 600;
`;

const PriceChangeLabel = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  margin-left: ${({ theme }) => theme.spacing.sm}px;
`;

const ChartSection = styled.View`
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const ChartBox = styled.View`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.sm}px 0;
  align-items: center;
  justify-content: center;
  overflow: hidden;
`;

const ChartLoadingOverlay = styled.View`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme }) => theme.colors.overlay};
  opacity: 0.6;
`;

const TimeRangeRow = styled.View`
  flex-direction: row;
  justify-content: center;
  margin-top: ${({ theme }) => theme.spacing.md}px;
  gap: ${({ theme }) => theme.spacing.sm}px;
`;

const TimeRangeButton = styled.TouchableOpacity<{ $active: boolean }>`
  min-height: 44px;
  min-width: 64px;
  padding: 0 ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.full}px;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme, $active }) =>
    $active ? theme.colors.primary : theme.colors.surface};
`;

const TimeRangeText = styled.Text<{ $active: boolean }>`
  color: ${({ theme, $active }) =>
    $active ? theme.colors.onPrimary : theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  font-weight: 600;
`;

const HoldingAmount = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 20px;
  font-weight: 700;
`;

const HoldingValue = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
`;

const HoldingActions = styled.View`
  flex-direction: row;
  gap: ${({ theme }) => theme.spacing.sm}px;
  margin-top: ${({ theme }) => theme.spacing.md}px;
`;

const SecondaryButton = styled.TouchableOpacity`
  flex: 1;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  border-width: 1px;
  border-color: ${({ theme }) => theme.colors.primary};
`;

const SecondaryButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.primary};
  font-size: ${({ theme }) => theme.typography.button.fontSize}px;
  font-weight: 600;
`;

const BuyButton = styled.TouchableOpacity`
  background-color: ${({ theme }) => theme.colors.primary};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  min-height: 52px;
  align-items: center;
  justify-content: center;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const BuyButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.onPrimary};
  font-size: ${({ theme }) => theme.typography.button.fontSize}px;
  font-weight: 600;
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

const InfoRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.sm}px 0;
  border-bottom-width: 1px;
  border-bottom-color: ${({ theme }) => theme.colors.border};
`;

const InfoLabel = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
`;

const InfoValue = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  font-weight: 500;
  flex-shrink: 1;
  text-align: right;
  margin-left: ${({ theme }) => theme.spacing.md}px;
`;

export default CoinDetailScreen;
