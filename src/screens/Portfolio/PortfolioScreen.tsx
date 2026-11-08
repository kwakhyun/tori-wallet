/**
 * 포트폴리오 화면 (자산 현황, 추이, 배분, 토큰 목록)
 *
 * - 금액은 모두 useFiat().formatFiat (표시 통화, 잔액 숨기기 반영)
 * - 비교할 기록이 없는 기간 변동은 '—'
 * - 총 자산은 홈과 같은 규칙(tokenValuation)으로 계산한다: 가치를 아는 자산이 없으면 '—'
 * - 조회 실패/가격 미확인/테스트넷 데이터는 기록(스냅샷)하지 않는다 (서비스에서 판단)
 *   차트가 비어 있으면 기록하지 못한 실제 이유를 보여 준다.
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import styled from 'styled-components/native';
import { useShallow } from 'zustand/react/shallow';
import {
  StatusBar,
  FlatList,
  RefreshControl,
  Image,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { useTheme } from '@/hooks/useTheme';
import { useFiat } from '@/hooks/useFiat';
import { useWalletStore } from '@/store/walletStore';
import { tokenService, Token } from '@/services/tokenService';
import {
  portfolioAnalyticsService,
  AssetAllocation,
  PortfolioStats,
  PerformanceMetrics,
} from '@/services/portfolioAnalyticsService';
import {
  snapshotBlocker,
  summarizeTokenTotal,
  totalNoteKind,
  TOTAL_NOTES,
  type SnapshotBlocker,
} from '@/services/tokenValuation';
import { PieChart, LineChart } from '@/components/charts';
import { PortfolioScreenSkeleton } from '@/components/common/Skeleton';
import { TabScreen } from '@/components/common/Screen';
import { ErrorState } from '@/components/common/StateViews';
import { tokenDetailParams } from '@/screens/TokenDetail/tokenDetailParams';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ViewMode = 'overview' | 'tokens';
type TimeRange = '7d' | '30d' | '90d';

const TIME_RANGES: { value: TimeRange; label: string; days: number }[] = [
  { value: '7d', label: '7일', days: 7 },
  { value: '30d', label: '30일', days: 30 },
  { value: '90d', label: '90일', days: 90 },
];

/** 차트가 비어 있을 때의 안내 (기록하지 못한 이유별) */
export const CHART_EMPTY_MESSAGES: Record<SnapshotBlocker | 'ok', string> = {
  ok: '포트폴리오 탭을 열 때마다 하루 한 번 기록됩니다.',
  testnet: '테스트넷 자산은 실제 가치가 없어 기록하지 않습니다.',
  lookupFailed:
    '잔액이나 시세를 불러오지 못해 기록하지 않았습니다. 아래로 당겨 다시 시도하세요.',
  noPriceSource: '시세 정보가 있는 자산이 없어 기록하지 않습니다.',
  empty: '이 네트워크에서는 자산을 불러올 수 없어 기록하지 않습니다.',
};

export const formatChange = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
};

function PortfolioScreen(): React.JSX.Element {
  const { theme, isDarkMode } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const { width: windowWidth } = useWindowDimensions();
  const { formatFiat, mask, hideBalances } = useFiat();
  const { wallets, activeWalletIndex, activeNetworkChainId, networks } =
    useWalletStore(
      useShallow(state => ({
        wallets: state.wallets,
        activeWalletIndex: state.activeWalletIndex,
        activeNetworkChainId: state.activeNetworkChainId,
        networks: state.networks,
      })),
    );

  const activeWallet = wallets[activeWalletIndex];
  const activeNetwork = networks.find(n => n.chainId === activeNetworkChainId);
  const isTestnet = !!activeNetwork?.isTestnet;

  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [allocation, setAllocation] = useState<AssetAllocation[]>([]);
  const [stats, setStats] = useState<PortfolioStats | null>(null);
  const [performance, setPerformance] = useState<PerformanceMetrics | null>(
    null,
  );
  const [chartData, setChartData] = useState<{
    labels: string[];
    values: number[];
  }>({ labels: [], values: [] });
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const analyticsRequestId = useRef(0);

  const {
    data: tokenData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['tokens', activeWallet?.address, activeNetworkChainId],
    queryFn: () =>
      tokenService.getTokens(activeWallet?.address || '', activeNetworkChainId),
    enabled: !!activeWallet?.address,
    staleTime: 30000,
  });

  const tokens = useMemo(
    () => (Array.isArray(tokenData) ? tokenData : undefined),
    [tokenData],
  );

  // 홈과 같은 합산 규칙 (빈 목록/가치를 아는 자산이 없으면 null → '—')
  const totalSummary = useMemo(
    () => (tokens ? summarizeTokenTotal(tokens) : null),
    [tokens],
  );
  const totalValue = totalSummary?.total ?? null;
  const totalNote = totalSummary ? totalNoteKind(totalSummary) : null;
  const chartEmptyMessage = isTestnet
    ? CHART_EMPTY_MESSAGES.testnet
    : CHART_EMPTY_MESSAGES[(tokens && snapshotBlocker(tokens)) || 'ok'];

  // 분석 데이터 로드
  const loadAnalytics = useCallback(async () => {
    const requestId = ++analyticsRequestId.current;
    const address = activeWallet?.address;

    if (!tokens || !address) {
      setAllocation([]);
      setStats(null);
      setPerformance(null);
      setChartData({ labels: [], values: [] });
      return;
    }

    try {
      // 현재 스냅샷이 차트에 포함되도록 먼저 저장 (신뢰할 수 없는 값은 서비스가 거부)
      await portfolioAnalyticsService.saveSnapshot(
        address,
        activeNetworkChainId,
        tokens,
      );

      const alloc = portfolioAnalyticsService.calculateAllocation(tokens);
      const perfData = portfolioAnalyticsService.calculatePerformance(tokens);
      const days = TIME_RANGES.find(r => r.value === timeRange)?.days ?? 30;

      const [statsData, chart] = await Promise.all([
        portfolioAnalyticsService.calculateStats(
          address,
          activeNetworkChainId,
          tokens,
        ),
        portfolioAnalyticsService.getChartData(
          address,
          activeNetworkChainId,
          days,
        ),
      ]);

      if (requestId !== analyticsRequestId.current) return;

      setAllocation(alloc);
      setStats(statsData);
      setPerformance(perfData);
      setChartData(chart);
    } catch (error) {
      if (requestId === analyticsRequestId.current) {
        console.error('Failed to load portfolio analytics:', error);
      }
    }
  }, [tokens, activeWallet?.address, activeNetworkChainId, timeRange]);

  useEffect(() => {
    loadAnalytics();

    return () => {
      analyticsRequestId.current += 1;
    };
  }, [loadAnalytics]);

  const handleRefresh = useCallback(async () => {
    setIsPullRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsPullRefreshing(false);
    }
  }, [refetch]);

  const handleTokenPress = useCallback(
    (token: Token) => {
      navigation.navigate(
        'TokenDetail',
        tokenDetailParams(token, activeNetworkChainId),
      );
    },
    [navigation, activeNetworkChainId],
  );

  const renderToken = useCallback(
    ({ item }: { item: Token }) => {
      const priceText =
        isTestnet || !item.priceAvailable
          ? '—'
          : formatFiat(item.price, {
              ignoreHidden: true,
              maximumFractionDigits: item.price < 1 ? 6 : undefined,
            });
      const valueText = isTestnet
        ? '실제 가치 없음'
        : item.balanceError
        ? '잔액 조회 실패'
        : formatFiat(item.usdValue ?? null, { showTinyAsLessThan: true });
      const balanceText = `${item.balance} ${item.symbol}`;
      return (
        <TokenItem
          onPress={() => handleTokenPress(item)}
          testID={`portfolio-token-${
            item.address === 'native' ? 'native' : item.address
          }`}
          accessibilityRole="button"
          accessibilityLabel={`${item.name}, ${mask(balanceText)}${
            hideBalances ? '' : `, ${valueText}`
          }`}
          accessibilityHint="토큰 상세 보기"
        >
          {item.logoUrl ? (
            <TokenLogo source={{ uri: item.logoUrl }} />
          ) : (
            <TokenLogoPlaceholder>
              <TokenLogoText>{item.symbol.charAt(0)}</TokenLogoText>
            </TokenLogoPlaceholder>
          )}

          <TokenInfo>
            <TokenRow>
              <TokenName numberOfLines={1}>{item.name}</TokenName>
              <TokenBalance numberOfLines={1}>{mask(balanceText)}</TokenBalance>
            </TokenRow>

            <TokenRow>
              <PriceRow>
                <TokenSymbol>{priceText}</TokenSymbol>
                {item.priceAvailable && !isTestnet && (
                  <TokenPriceChange $positive={item.priceChange24h >= 0}>
                    {formatChange(item.priceChange24h)}
                  </TokenPriceChange>
                )}
              </PriceRow>
              <TokenValue $error={!!item.balanceError && !isTestnet}>
                {valueText}
              </TokenValue>
            </TokenRow>
          </TokenInfo>
        </TokenItem>
      );
    },
    [formatFiat, handleTokenPress, hideBalances, isTestnet, mask],
  );

  const statValue = (value: number | null | undefined) => (
    <StatValue
      $tone={
        value === null || value === undefined
          ? 'neutral'
          : value >= 0
          ? 'positive'
          : 'negative'
      }
    >
      {formatChange(value)}
    </StatValue>
  );

  const refreshControl = (
    <RefreshControl
      refreshing={isPullRefreshing}
      onRefresh={handleRefresh}
      tintColor={theme.colors.primary}
    />
  );

  const renderOverview = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
      testID="portfolio-overview"
    >
      {/* 총 자산 카드 */}
      <TotalValueCard>
        <TotalValueLabel>총 자산</TotalValueLabel>
        {isTestnet ? (
          <>
            <TotalValueAmount>—</TotalValueAmount>
            <TestnetNote testID="portfolio-testnet-note">
              테스트넷 — 실제 가치 없음
            </TestnetNote>
          </>
        ) : (
          <>
            <TotalValueAmount
              testID="portfolio-total-value"
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatFiat(totalValue)}
            </TotalValueAmount>
            {totalNote && !hideBalances ? (
              <TotalNote testID={`portfolio-total-${totalNote}`}>
                {TOTAL_NOTES[totalNote]}
              </TotalNote>
            ) : null}
            {stats &&
            stats.changePercent24h !== null &&
            stats.change24h !== null ? (
              <ChangeRow>
                <ChangeText $positive={stats.changePercent24h >= 0}>
                  {formatChange(stats.changePercent24h)} 지난 24시간
                </ChangeText>
                <ChangeAmount $positive={stats.changePercent24h >= 0}>
                  ({formatFiat(stats.change24h, { signed: true })})
                </ChangeAmount>
              </ChangeRow>
            ) : null}
          </>
        )}
      </TotalValueCard>

      {/* 기간 선택 */}
      <TimeRangeContainer accessibilityRole="tablist">
        {TIME_RANGES.map(range => {
          const active = timeRange === range.value;
          return (
            <TimeRangeButton
              key={range.value}
              $active={active}
              onPress={() => setTimeRange(range.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${range.label} 추이`}
              testID={`portfolio-range-${range.value}`}
            >
              <TimeRangeText $active={active}>{range.label}</TimeRangeText>
            </TimeRangeButton>
          );
        })}
      </TimeRangeContainer>

      {/* 라인 차트 */}
      <ChartCard>
        <ChartTitle accessibilityRole="header">포트폴리오 추이</ChartTitle>
        <LineChart
          labels={chartData.labels}
          values={chartData.values}
          width={Math.max(windowWidth - 80, 200)}
          height={180}
          title="포트폴리오 추이"
          emptyMessage={chartEmptyMessage}
          testID="portfolio-line-chart"
        />
      </ChartCard>

      {/* 자산 배분 파이 차트 */}
      <ChartCard>
        <ChartTitle accessibilityRole="header">자산 배분</ChartTitle>
        <PieChart data={allocation} size={180} innerRadius={50} />
      </ChartCard>

      {/* 성과 지표 */}
      {performance && !isTestnet && (
        <StatsCard>
          <ChartTitle accessibilityRole="header">성과 지표</ChartTitle>
          <StatsGrid>
            <StatItem>
              <StatLabel>24시간 변동</StatLabel>
              {statValue(stats?.changePercent24h)}
            </StatItem>
            <StatItem>
              <StatLabel>7일 변동</StatLabel>
              {statValue(stats?.changePercent7d)}
            </StatItem>
            <StatItem>
              <StatLabel>30일 변동</StatLabel>
              {statValue(stats?.changePercent30d)}
            </StatItem>
            <StatItem>
              <StatLabel>보유 자산 간 24h 변동 편차</StatLabel>
              <StatValue $tone="neutral">
                {performance.volatility === null
                  ? '—'
                  : `${performance.volatility.toFixed(2)}%p`}
              </StatValue>
            </StatItem>
          </StatsGrid>

          {performance.bestPerformer && (
            <PerformerRow>
              <PerformerLabel>24시간 최고 성과</PerformerLabel>
              <PerformerValue $positive={performance.bestPerformer.change >= 0}>
                {performance.bestPerformer.symbol} (
                {formatChange(performance.bestPerformer.change)})
              </PerformerValue>
            </PerformerRow>
          )}
          {performance.worstPerformer && (
            <PerformerRow>
              <PerformerLabel>24시간 최저 성과</PerformerLabel>
              <PerformerValue
                $positive={performance.worstPerformer.change >= 0}
              >
                {performance.worstPerformer.symbol} (
                {formatChange(performance.worstPerformer.change)})
              </PerformerValue>
            </PerformerRow>
          )}
        </StatsCard>
      )}

      {/* 통계 요약 (기록된 총 자산액 기준, 기록이 없으면 숨김) */}
      {stats && !isTestnet && stats.highestValue !== null && (
        <StatsCard>
          <ChartTitle accessibilityRole="header">
            기록된 총 자산 요약
          </ChartTitle>
          <StatsRow>
            <StatLabel>최고 자산액</StatLabel>
            <StatPlainValue>{formatFiat(stats.highestValue)}</StatPlainValue>
          </StatsRow>
          <StatsRow>
            <StatLabel>최저 자산액</StatLabel>
            <StatPlainValue>{formatFiat(stats.lowestValue)}</StatPlainValue>
          </StatsRow>
          <StatsRow>
            <StatLabel>평균 자산액</StatLabel>
            <StatPlainValue>{formatFiat(stats.averageValue)}</StatPlainValue>
          </StatsRow>
        </StatsCard>
      )}

      <Spacer />
    </ScrollView>
  );

  const renderTokenList = () => (
    <FlatList
      data={tokens ?? []}
      renderItem={renderToken}
      keyExtractor={item =>
        item.address === 'native' ? 'native' : item.address
      }
      ListEmptyComponent={
        <EmptyState>
          <EmptyText>
            토큰이 없습니다.{'\n'}
            {activeNetwork?.name}에서 토큰을 받아보세요.
          </EmptyText>
        </EmptyState>
      }
      refreshControl={refreshControl}
      showsVerticalScrollIndicator={false}
    />
  );

  if (!activeWallet) {
    return (
      <TabScreen>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <Content>
          <Title accessibilityRole="header">포트폴리오</Title>
          <EmptyState>
            <EmptyText>지갑이 없습니다</EmptyText>
          </EmptyState>
        </Content>
      </TabScreen>
    );
  }

  const renderBody = () => {
    if (isLoading && !tokens) return <PortfolioScreenSkeleton />;
    if (isError && !tokens) {
      return (
        <ErrorState
          title="자산 정보를 불러오지 못했습니다"
          onRetry={() => refetch()}
          testID="portfolio-error"
        />
      );
    }
    return viewMode === 'overview' ? renderOverview() : renderTokenList();
  };

  return (
    <TabScreen testID="portfolio-screen">
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <Content>
        <Header>
          <Title accessibilityRole="header">포트폴리오</Title>
          <NetworkBadge>
            <NetworkDot $isTestnet={isTestnet} />
            <NetworkName numberOfLines={1}>{activeNetwork?.name}</NetworkName>
          </NetworkBadge>
        </Header>

        {/* 뷰 모드 탭 */}
        <TabContainer accessibilityRole="tablist">
          <TabButton
            $active={viewMode === 'overview'}
            onPress={() => setViewMode('overview')}
            accessibilityRole="tab"
            accessibilityState={{ selected: viewMode === 'overview' }}
            accessibilityLabel="분석"
            testID="portfolio-tab-overview"
          >
            <TabText $active={viewMode === 'overview'}>분석</TabText>
          </TabButton>
          <TabButton
            $active={viewMode === 'tokens'}
            onPress={() => setViewMode('tokens')}
            accessibilityRole="tab"
            accessibilityState={{ selected: viewMode === 'tokens' }}
            accessibilityLabel="자산"
            testID="portfolio-tab-tokens"
          >
            <TabText $active={viewMode === 'tokens'}>자산</TabText>
          </TabButton>
        </TabContainer>

        {renderBody()}
      </Content>
    </TabScreen>
  );
}

const Content = styled.View`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.lg}px;
  padding-bottom: 0;
`;

const Header = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const Title = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.h2.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.h2.fontWeight};
`;

const NetworkBadge = styled.View`
  flex-direction: row;
  align-items: center;
  flex-shrink: 1;
  margin-left: ${({ theme }) => theme.spacing.sm}px;
  background-color: ${({ theme }) => theme.colors.backgroundSecondary};
  padding: ${({ theme }) => theme.spacing.xs}px
    ${({ theme }) => theme.spacing.sm}px;
  border-radius: ${({ theme }) => theme.borderRadius.full}px;
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
  font-size: 12px;
  flex-shrink: 1;
`;

// 탭 컨테이너
const TabContainer = styled.View`
  flex-direction: row;
  background-color: ${({ theme }) => theme.colors.backgroundSecondary};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: 4px;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const TabButton = styled(TouchableOpacity)<{ $active: boolean }>`
  flex: 1;
  min-height: 44px;
  justify-content: center;
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  align-items: center;
  background-color: ${({ $active, theme }) =>
    $active ? theme.colors.primary : 'transparent'};
`;

const TabText = styled.Text<{ $active: boolean }>`
  color: ${({ theme, $active }) =>
    $active ? theme.colors.onPrimary : theme.colors.textSecondary};
  font-weight: 600;
  font-size: 14px;
`;

// 총 자산 카드
const TotalValueCard = styled.View`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.lg}px;
  padding: ${({ theme }) => theme.spacing.lg}px;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
  align-items: center;
`;

const TotalValueLabel = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
`;

const TotalValueAmount = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 32px;
  font-weight: bold;
`;

const TotalNote = styled.Text`
  color: ${({ theme }) => theme.colors.textTertiary};
  font-size: 12px;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
  text-align: center;
`;

const TestnetNote = styled.Text`
  color: ${({ theme }) => theme.colors.warning};
  font-size: 13px;
  font-weight: 600;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
`;

const ChangeRow = styled.View`
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
`;

const ChangeText = styled.Text<{ $positive: boolean }>`
  color: ${({ theme, $positive }) =>
    $positive ? theme.colors.success : theme.colors.error};
  font-size: 14px;
  font-weight: 600;
`;

const ChangeAmount = styled.Text<{ $positive: boolean }>`
  color: ${({ theme, $positive }) =>
    $positive ? theme.colors.success : theme.colors.error};
  font-size: 14px;
  margin-left: 4px;
`;

// 기간 선택
const TimeRangeContainer = styled.View`
  flex-direction: row;
  justify-content: center;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
  gap: 8px;
`;

const TimeRangeButton = styled(TouchableOpacity)<{ $active: boolean }>`
  min-height: 44px;
  min-width: 64px;
  align-items: center;
  justify-content: center;
  padding: 0 ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.full}px;
  background-color: ${({ $active, theme }) =>
    $active ? theme.colors.primary : theme.colors.surface};
`;

const TimeRangeText = styled.Text<{ $active: boolean }>`
  color: ${({ theme, $active }) =>
    $active ? theme.colors.onPrimary : theme.colors.textSecondary};
  font-size: 13px;
  font-weight: 600;
`;

// 차트 카드
const ChartCard = styled.View`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.lg}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
  align-items: center;
`;

const ChartTitle = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 16px;
  font-weight: 600;
  align-self: flex-start;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

// 통계 카드
const StatsCard = styled.View`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.lg}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const StatsGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
`;

const StatItem = styled.View`
  width: 50%;
  padding: ${({ theme }) => theme.spacing.sm}px;
`;

const StatLabel = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 12px;
  margin-bottom: 4px;
`;

const StatValue = styled.Text<{ $tone: 'positive' | 'negative' | 'neutral' }>`
  color: ${({ theme, $tone }) =>
    $tone === 'positive'
      ? theme.colors.success
      : $tone === 'negative'
      ? theme.colors.error
      : theme.colors.textPrimary};
  font-size: 16px;
  font-weight: 600;
`;

const StatPlainValue = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 14px;
`;

const StatsRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.sm}px 0;
  border-bottom-width: 1px;
  border-bottom-color: ${({ theme }) => theme.colors.border};
`;

const PerformerRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.sm}px;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
  background-color: ${({ theme }) => theme.colors.backgroundSecondary};
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
`;

const PerformerLabel = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 12px;
`;

const PerformerValue = styled.Text<{ $positive: boolean }>`
  color: ${({ theme, $positive }) =>
    $positive ? theme.colors.success : theme.colors.error};
  font-size: 12px;
  font-weight: 600;
`;

// 토큰 아이템
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
  background-color: ${({ theme }) => theme.colors.backgroundSecondary};
`;

const TokenLogoPlaceholder = styled.View`
  width: 40px;
  height: 40px;
  border-radius: 20px;
  background-color: ${({ theme }) => theme.colors.primarySubtle};
  align-items: center;
  justify-content: center;
`;

const TokenLogoText = styled.Text`
  color: ${({ theme }) => theme.colors.primary};
  font-size: 16px;
  font-weight: bold;
`;

const TokenInfo = styled.View`
  flex: 1;
  margin-left: ${({ theme }) => theme.spacing.md}px;
`;

const TokenRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
`;

const TokenName = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 16px;
  font-weight: 600;
  flex-shrink: 1;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const TokenBalance = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 15px;
  font-weight: 600;
  flex-shrink: 1;
`;

const TokenSymbol = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
`;

const TokenValue = styled.Text<{ $error?: boolean }>`
  color: ${({ theme, $error }) =>
    $error ? theme.colors.error : theme.colors.textSecondary};
  font-size: 14px;
`;

const TokenPriceChange = styled.Text<{ $positive: boolean }>`
  color: ${({ theme, $positive }) =>
    $positive ? theme.colors.success : theme.colors.error};
  font-size: 12px;
  margin-left: ${({ theme }) => theme.spacing.xs}px;
`;

const PriceRow = styled.View`
  flex-direction: row;
  align-items: center;
`;

// 빈 상태
const EmptyState = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
  padding-top: 60px;
`;

const EmptyText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  text-align: center;
`;

const Spacer = styled.View`
  height: 40px;
`;

export default PortfolioScreen;
