/**
 * Tori Wallet - Portfolio Screen
 * 토큰 목록 및 자산 현황 (차트/분석 포함)
 */

import React, { useState, useEffect, useCallback } from 'react';
import styled, { useTheme } from 'styled-components/native';
import {
  SafeAreaView,
  StatusBar,
  FlatList,
  RefreshControl,
  Image,
  ScrollView,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useWalletStore } from '@/store/walletStore';
import { tokenService, Token } from '@/services/tokenService';
import {
  portfolioAnalyticsService,
  AssetAllocation,
  PortfolioStats,
  PerformanceMetrics,
} from '@/services/portfolioAnalyticsService';
import { PieChart, LineChart } from '@/components/charts';
import { PortfolioScreenSkeleton } from '@/components/common/Skeleton';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type ViewMode = 'overview' | 'tokens';
type TimeRange = '7d' | '30d' | '90d';

function PortfolioScreen(): React.JSX.Element {
  const theme = useTheme();
  const { wallets, activeWalletIndex, activeNetworkChainId, networks } =
    useWalletStore();

  const activeWallet = wallets[activeWalletIndex];
  const activeNetwork = networks.find(n => n.chainId === activeNetworkChainId);

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
  }>({
    labels: [],
    values: [],
  });

  const {
    data: tokens,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['tokens', activeWallet?.address, activeNetworkChainId],
    queryFn: () =>
      tokenService.getTokens(activeWallet?.address || '', activeNetworkChainId),
    enabled: !!activeWallet?.address,
    staleTime: 30000,
  });

  const totalValue = tokens ? tokenService.getTotalValue(tokens) : 0;

  // 분석 데이터 로드
  const loadAnalytics = useCallback(async () => {
    if (!tokens || !activeWallet?.address) return;

    // 스냅샷 저장
    await portfolioAnalyticsService.saveSnapshot(
      activeWallet.address,
      activeNetworkChainId,
      tokens,
    );

    // 자산 배분 계산
    const alloc = portfolioAnalyticsService.calculateAllocation(tokens);
    setAllocation(alloc);

    // 통계 계산
    const statsData = await portfolioAnalyticsService.calculateStats(
      activeWallet.address,
      activeNetworkChainId,
      tokens,
    );
    setStats(statsData);

    // 성과 계산
    const perfData = portfolioAnalyticsService.calculatePerformance(tokens);
    setPerformance(perfData);

    // 차트 데이터
    const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
    const chart = await portfolioAnalyticsService.getChartData(
      activeWallet.address,
      activeNetworkChainId,
      days,
    );
    setChartData(chart);
  }, [tokens, activeWallet?.address, activeNetworkChainId, timeRange]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const formatUSD = (value: number): string => {
    if (value === 0) return '$0.00';
    if (Math.abs(value) < 0.01) return value > 0 ? '< $0.01' : '> -$0.01';
    return `$${value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatChange = (value: number, showSign: boolean = true): string => {
    const sign = showSign && value > 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  const renderToken = ({ item }: { item: Token }) => (
    <TokenItem>
      {item.logoUrl ? (
        <TokenLogo source={{ uri: item.logoUrl }} />
      ) : (
        <TokenLogoPlaceholder>
          <TokenLogoText>{item.symbol.charAt(0)}</TokenLogoText>
        </TokenLogoPlaceholder>
      )}

      <TokenInfo>
        <TokenRow>
          <TokenName>{item.name}</TokenName>
          <TokenBalance>
            {item.balance} {item.symbol}
          </TokenBalance>
        </TokenRow>

        <TokenRow>
          <PriceRow>
            <TokenSymbol>{formatUSD(item.price)}</TokenSymbol>
            {item.priceChange24h !== 0 && (
              <TokenPriceChange $positive={item.priceChange24h > 0}>
                {formatChange(item.priceChange24h)}
              </TokenPriceChange>
            )}
          </PriceRow>
          <TokenValue>{formatUSD(item.value)}</TokenValue>
        </TokenRow>
      </TokenInfo>
    </TokenItem>
  );

  const renderOverview = () => (
    <ScrollView showsVerticalScrollIndicator={false}>
      {/* 총 자산 카드 */}
      <TotalValueCard>
        <TotalValueLabel>총 자산</TotalValueLabel>
        <TotalValueAmount>{formatUSD(totalValue)}</TotalValueAmount>
        {stats && stats.changePercent24h !== 0 && (
          <ChangeRow>
            <ChangeText $positive={stats.changePercent24h >= 0}>
              {formatChange(stats.changePercent24h)} 오늘
            </ChangeText>
            <ChangeAmount $positive={stats.changePercent24h >= 0}>
              ({formatUSD(Math.abs(stats.change24h))})
            </ChangeAmount>
          </ChangeRow>
        )}
      </TotalValueCard>

      {/* 기간 선택 */}
      <TimeRangeContainer>
        {(['7d', '30d', '90d'] as TimeRange[]).map(range => (
          <TimeRangeButton
            key={range}
            $active={timeRange === range}
            onPress={() => setTimeRange(range)}
          >
            <TimeRangeText $active={timeRange === range}>
              {range === '7d' ? '7일' : range === '30d' ? '30일' : '90일'}
            </TimeRangeText>
          </TimeRangeButton>
        ))}
      </TimeRangeContainer>

      {/* 라인 차트 */}
      <ChartCard>
        <ChartTitle>포트폴리오 추이</ChartTitle>
        <LineChart
          labels={chartData.labels}
          values={chartData.values}
          width={SCREEN_WIDTH - 64}
          height={180}
        />
      </ChartCard>

      {/* 자산 배분 파이 차트 */}
      <ChartCard>
        <ChartTitle>자산 배분</ChartTitle>
        <PieChart data={allocation} size={180} innerRadius={50} />
      </ChartCard>

      {/* 성과 지표 */}
      {performance && (
        <StatsCard>
          <ChartTitle>성과 지표</ChartTitle>
          <StatsGrid>
            <StatItem>
              <StatLabel>24시간 변동</StatLabel>
              <StatValue $positive={(stats?.changePercent24h ?? 0) >= 0}>
                {formatChange(stats?.changePercent24h ?? 0)}
              </StatValue>
            </StatItem>
            <StatItem>
              <StatLabel>7일 변동</StatLabel>
              <StatValue $positive={(stats?.changePercent7d ?? 0) >= 0}>
                {formatChange(stats?.changePercent7d ?? 0)}
              </StatValue>
            </StatItem>
            <StatItem>
              <StatLabel>30일 변동</StatLabel>
              <StatValue $positive={(stats?.changePercent30d ?? 0) >= 0}>
                {formatChange(stats?.changePercent30d ?? 0)}
              </StatValue>
            </StatItem>
            <StatItem>
              <StatLabel>변동성</StatLabel>
              <StatValue>{performance.volatility.toFixed(2)}%</StatValue>
            </StatItem>
          </StatsGrid>

          {performance.bestPerformer && (
            <PerformerRow>
              <PerformerLabel>🏆 최고 성과</PerformerLabel>
              <PerformerValue $positive>
                {performance.bestPerformer.symbol} (
                {formatChange(performance.bestPerformer.change)})
              </PerformerValue>
            </PerformerRow>
          )}
          {performance.worstPerformer && (
            <PerformerRow>
              <PerformerLabel>📉 최저 성과</PerformerLabel>
              <PerformerValue $positive={false}>
                {performance.worstPerformer.symbol} (
                {formatChange(performance.worstPerformer.change)})
              </PerformerValue>
            </PerformerRow>
          )}
        </StatsCard>
      )}

      {/* 통계 요약 */}
      {stats && (
        <StatsCard>
          <ChartTitle>통계 요약</ChartTitle>
          <StatsRow>
            <StatLabel>최고가</StatLabel>
            <StatPlainValue>{formatUSD(stats.highestValue)}</StatPlainValue>
          </StatsRow>
          <StatsRow>
            <StatLabel>최저가</StatLabel>
            <StatPlainValue>{formatUSD(stats.lowestValue)}</StatPlainValue>
          </StatsRow>
          <StatsRow>
            <StatLabel>평균가</StatLabel>
            <StatPlainValue>{formatUSD(stats.averageValue)}</StatPlainValue>
          </StatsRow>
        </StatsCard>
      )}

      <Spacer />
    </ScrollView>
  );

  const renderTokenList = () => (
    <FlatList
      data={tokens}
      renderItem={renderToken}
      keyExtractor={item =>
        item.address === 'native' ? 'native' : item.address
      }
      ListEmptyComponent={
        <EmptyState>
          <EmptyIcon>💰</EmptyIcon>
          <EmptyText>
            토큰이 없습니다.{'\n'}
            {activeNetwork?.name}에서 토큰을 받아보세요.
          </EmptyText>
        </EmptyState>
      }
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor={theme.colors.primary}
        />
      }
      showsVerticalScrollIndicator={false}
    />
  );

  if (!activeWallet) {
    return (
      <Container>
        <StatusBar barStyle="light-content" />
        <Content>
          <Title>포트폴리오</Title>
          <EmptyState>
            <EmptyText>지갑이 없습니다</EmptyText>
          </EmptyState>
        </Content>
      </Container>
    );
  }

  return (
    <Container>
      <StatusBar barStyle="light-content" />
      <Content>
        <Header>
          <Title>포트폴리오</Title>
          <NetworkBadge>
            <NetworkDot $isTestnet={activeNetwork?.isTestnet} />
            <NetworkName>{activeNetwork?.name}</NetworkName>
          </NetworkBadge>
        </Header>

        {/* 뷰 모드 탭 */}
        <TabContainer>
          <TabButton
            $active={viewMode === 'overview'}
            onPress={() => setViewMode('overview')}
          >
            <TabText $active={viewMode === 'overview'}>📊 분석</TabText>
          </TabButton>
          <TabButton
            $active={viewMode === 'tokens'}
            onPress={() => setViewMode('tokens')}
          >
            <TabText $active={viewMode === 'tokens'}>💰 자산</TabText>
          </TabButton>
        </TabContainer>

        {isLoading ? (
          <PortfolioScreenSkeleton />
        ) : viewMode === 'overview' ? (
          renderOverview()
        ) : (
          renderTokenList()
        )}
      </Content>
    </Container>
  );
}

// Styled Components
const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
`;

const Content = styled.View`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.lg}px;
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
  padding: ${({ theme }) => theme.spacing.sm}px;
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  align-items: center;
  background-color: ${({ $active, theme }) =>
    $active ? theme.colors.primary : 'transparent'};
`;

const TabText = styled.Text<{ $active: boolean }>`
  color: ${({ theme, $active }) =>
    $active ? theme.colors.textPrimary : theme.colors.textMuted};
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

const ChangeRow = styled.View`
  flex-direction: row;
  align-items: center;
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
  padding: ${({ theme }) => theme.spacing.xs}px
    ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.full}px;
  background-color: ${({ $active, theme }) =>
    $active ? theme.colors.primary : theme.colors.surface};
`;

const TimeRangeText = styled.Text<{ $active: boolean }>`
  color: ${({ theme, $active }) =>
    $active ? theme.colors.textPrimary : theme.colors.textMuted};
  font-size: 12px;
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

const StatValue = styled.Text<{ $positive?: boolean }>`
  color: ${({ theme, $positive }) =>
    $positive === undefined
      ? theme.colors.textPrimary
      : $positive
      ? theme.colors.success
      : theme.colors.error};
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
const TokenItem = styled.View`
  flex-direction: row;
  align-items: center;
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
  background-color: ${({ theme }) => theme.colors.primary};
  align-items: center;
  justify-content: center;
`;

const TokenLogoText = styled.Text`
  color: white;
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
`;

const TokenBalance = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 16px;
  font-weight: 600;
`;

const TokenSymbol = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
`;

const TokenValue = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
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

const EmptyIcon = styled.Text`
  font-size: 48px;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
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
