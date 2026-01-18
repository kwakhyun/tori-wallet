/**
 * 코인 상세 화면 (가격, 시세 그래프, 구매)
 * 차트 요소의 위치가 동적으로 계산되어 인라인 스타일 필요
 */

/* eslint-disable react-native/no-inline-styles */
import React, { useState, useCallback, useEffect } from 'react';
import styled, { useTheme } from 'styled-components/native';
import {
  SafeAreaView,
  StatusBar,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { coinService, CoinDetail, PriceHistory } from '@/services/coinService';
import { showBuyProviderAlert } from '@/services/buyService';
import { createLogger } from '@/utils/logger';

const logger = createLogger('CoinDetail');

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type CoinDetailRouteProp = RouteProp<RootStackParamList, 'CoinDetail'>;

const CHART_HEIGHT = 220;

// 1일, 7일, 1달만 지원 (API 요청량 절감)
type TimeRange = '1' | '7' | '30';

function CoinDetailScreen(): React.JSX.Element {
  const theme = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<CoinDetailRouteProp>();
  const { coinId, coinName, coinSymbol, coinImage } = route.params;

  const [coinDetail, setCoinDetail] = useState<CoinDetail | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistory | null>(null);
  const [selectedRange, setSelectedRange] = useState<TimeRange>('7');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      // 코인 상세 정보와 가격 히스토리를 별도로 처리
      const [detail, history] = await Promise.allSettled([
        coinService.getCoinDetail(coinId),
        coinService.getPriceHistory(coinId, selectedRange),
      ]);

      if (detail.status === 'fulfilled') {
        setCoinDetail(detail.value);
      }

      if (history.status === 'fulfilled') {
        setPriceHistory(history.value);
      } else {
        // 히스토리 로딩 실패 시 빈 데이터 설정
        setPriceHistory({ prices: [], market_caps: [], total_volumes: [] });
      }
    } catch (error) {
      logger.error('Failed to load coin data:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [coinId, selectedRange]);

  // Rate Limit 알림 콜백 설정
  useEffect(() => {
    coinService.setRateLimitCallback((message: string) => {
      Alert.alert('데이터 조회 제한', message, [{ text: '확인' }]);
    });
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadData();
  }, [loadData]);

  const handleRangeChange = useCallback((range: TimeRange) => {
    setSelectedRange(range);
  }, []);

  const handleBuy = useCallback(() => {
    // 지갑 주소 없이 구매 서비스로 이동 (사용자가 직접 입력)
    showBuyProviderAlert(coinSymbol);
  }, [coinSymbol]);

  // 라인 차트 렌더링 (SVG 없이 View로 구현)
  const renderChart = useCallback(() => {
    if (!priceHistory || priceHistory.prices.length === 0) {
      return (
        <ChartPlaceholder>
          <ChartPlaceholderText>차트 데이터 없음</ChartPlaceholderText>
        </ChartPlaceholder>
      );
    }

    const prices = priceHistory.prices.map(p => p[1]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;
    const isPositive = prices[prices.length - 1] >= prices[0];
    const chartColor = isPositive ? theme.colors.success : theme.colors.error;

    // 데이터를 40개 포인트로 샘플링 (더 부드러운 라인)
    const sampleCount = 40;
    const step = Math.max(1, Math.floor(prices.length / sampleCount));
    const sampledPrices: number[] = [];
    for (let i = 0; i < prices.length; i += step) {
      sampledPrices.push(prices[i]);
    }
    // 마지막 가격 포함
    if (sampledPrices[sampledPrices.length - 1] !== prices[prices.length - 1]) {
      sampledPrices.push(prices[prices.length - 1]);
    }

    const chartWidth = 100; // 퍼센트
    const pointWidth = chartWidth / (sampledPrices.length - 1);

    return (
      <ChartContainer>
        <ChartArea>
          {/* 배경 그리드 라인 */}
          <GridLine style={{ top: '0%' }} />
          <GridLine style={{ top: '25%' }} />
          <GridLine style={{ top: '50%' }} />
          <GridLine style={{ top: '75%' }} />
          <GridLine style={{ top: '100%' }} />

          {/* 라인 차트 */}
          <LineChartContainer>
            {sampledPrices.map((price, index) => {
              if (index === sampledPrices.length - 1) return null;

              const y1 = 100 - ((price - minPrice) / priceRange) * 100;
              const y2 =
                100 -
                ((sampledPrices[index + 1] - minPrice) / priceRange) * 100;
              const x1 = index * pointWidth;

              // 라인 세그먼트의 각도와 길이 계산
              const deltaX = pointWidth;
              const deltaY = y2 - y1;
              const length = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
              const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);

              return (
                <LineSegment
                  key={index}
                  style={{
                    left: `${x1}%`,
                    top: `${y1}%`,
                    width: `${length}%`,
                    transform: [{ rotate: `${angle}deg` }],
                    backgroundColor: chartColor,
                  }}
                />
              );
            })}

            {/* 현재 가격 점 표시 */}
            <CurrentPriceDot
              style={{
                right: 0,
                top: `${
                  100 -
                  ((sampledPrices[sampledPrices.length - 1] - minPrice) /
                    priceRange) *
                    100
                }%`,
                backgroundColor: chartColor,
              }}
            />
          </LineChartContainer>
        </ChartArea>

        {/* 가격 라벨 */}
        <ChartLabels>
          <ChartLabel>{coinService.formatPrice(maxPrice)}</ChartLabel>
          <ChartLabel>
            {coinService.formatPrice((maxPrice + minPrice) / 2)}
          </ChartLabel>
          <ChartLabel>{coinService.formatPrice(minPrice)}</ChartLabel>
        </ChartLabels>
      </ChartContainer>
    );
  }, [priceHistory, theme.colors.success, theme.colors.error]);

  const currentPrice = coinDetail?.market_data?.current_price?.usd || 0;
  const priceChange24h =
    coinDetail?.market_data?.price_change_percentage_24h || 0;
  const priceChangeColor =
    priceChange24h >= 0 ? theme.colors.success : theme.colors.error;

  if (isLoading) {
    return (
      <Container>
        <StatusBar barStyle="light-content" />
        <LoadingContainer>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </LoadingContainer>
      </Container>
    );
  }

  return (
    <Container>
      <StatusBar barStyle="light-content" />
      <Header>
        <BackButton onPress={() => navigation.goBack()}>
          <BackButtonText>‹</BackButtonText>
        </BackButton>
        <HeaderTitleContainer>
          <CoinImageHeader source={{ uri: coinImage }} />
          <HeaderTitle>{coinName}</HeaderTitle>
        </HeaderTitleContainer>
        <HeaderRight />
      </Header>

      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        <Content>
          {/* 가격 정보 */}
          <PriceSection>
            <CurrentPrice>{coinService.formatPrice(currentPrice)}</CurrentPrice>
            <PriceChangeRow>
              <PriceChangeText style={{ color: priceChangeColor }}>
                {coinService.formatPercentage(priceChange24h)}
              </PriceChangeText>
              <PriceChangeLabel>24시간</PriceChangeLabel>
            </PriceChangeRow>
          </PriceSection>

          {/* 시세 차트 */}
          <ChartSection>
            {renderChart()}
            <TimeRangeRow>
              {(['1', '7', '30'] as TimeRange[]).map(range => (
                <TimeRangeButton
                  key={range}
                  onPress={() => handleRangeChange(range)}
                  $active={selectedRange === range}
                >
                  <TimeRangeText $active={selectedRange === range}>
                    {range === '1' ? '1일' : range === '7' ? '7일' : '1달'}
                  </TimeRangeText>
                </TimeRangeButton>
              ))}
            </TimeRangeRow>
          </ChartSection>

          {/* 구매 버튼 */}
          <BuyButton onPress={handleBuy}>
            <BuyButtonText>{coinSymbol.toUpperCase()} 구매하기</BuyButtonText>
          </BuyButton>

          {/* 시장 정보 */}
          <Section>
            <SectionTitle>시장 정보</SectionTitle>
            <InfoCard>
              <InfoRow>
                <InfoLabel>시가총액</InfoLabel>
                <InfoValue>
                  {coinDetail?.market_data?.market_cap?.usd
                    ? coinService.formatMarketCap(
                        coinDetail.market_data.market_cap.usd,
                      )
                    : '-'}
                </InfoValue>
              </InfoRow>
              <InfoRow>
                <InfoLabel>24시간 거래량</InfoLabel>
                <InfoValue>
                  {coinDetail?.market_data?.total_volume?.usd
                    ? coinService.formatMarketCap(
                        coinDetail.market_data.total_volume.usd,
                      )
                    : '-'}
                </InfoValue>
              </InfoRow>
              <InfoRow>
                <InfoLabel>24시간 최고</InfoLabel>
                <InfoValue>
                  {coinDetail?.market_data?.high_24h?.usd
                    ? coinService.formatPrice(
                        coinDetail.market_data.high_24h.usd,
                      )
                    : '-'}
                </InfoValue>
              </InfoRow>
              <InfoRow>
                <InfoLabel>24시간 최저</InfoLabel>
                <InfoValue>
                  {coinDetail?.market_data?.low_24h?.usd
                    ? coinService.formatPrice(
                        coinDetail.market_data.low_24h.usd,
                      )
                    : '-'}
                </InfoValue>
              </InfoRow>
              <InfoRow>
                <InfoLabel>역대 최고가</InfoLabel>
                <InfoValue>
                  {coinDetail?.market_data?.ath?.usd
                    ? coinService.formatPrice(coinDetail.market_data.ath.usd)
                    : '-'}
                </InfoValue>
              </InfoRow>
              <InfoRow>
                <InfoLabel>유통량</InfoLabel>
                <InfoValue>
                  {coinDetail?.market_data?.circulating_supply
                    ? `${coinDetail.market_data.circulating_supply.toLocaleString()} ${coinSymbol.toUpperCase()}`
                    : '-'}
                </InfoValue>
              </InfoRow>
            </InfoCard>
          </Section>

          {/* 가격 변동 */}
          <Section>
            <SectionTitle>가격 변동</SectionTitle>
            <InfoCard>
              <InfoRow>
                <InfoLabel>7일</InfoLabel>
                <ColoredValue
                  $isPositive={
                    (coinDetail?.market_data?.price_change_percentage_7d ||
                      0) >= 0
                  }
                >
                  {coinService.formatPercentage(
                    coinDetail?.market_data?.price_change_percentage_7d || 0,
                  )}
                </ColoredValue>
              </InfoRow>
              <InfoRow>
                <InfoLabel>30일</InfoLabel>
                <ColoredValue
                  $isPositive={
                    (coinDetail?.market_data?.price_change_percentage_30d ||
                      0) >= 0
                  }
                >
                  {coinService.formatPercentage(
                    coinDetail?.market_data?.price_change_percentage_30d || 0,
                  )}
                </ColoredValue>
              </InfoRow>
            </InfoCard>
          </Section>
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

const HeaderTitleContainer = styled.View`
  flex-direction: row;
  align-items: center;
`;

const CoinImageHeader = styled(Image)`
  width: 28px;
  height: 28px;
  border-radius: 14px;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const HeaderTitle = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.h3.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.h3.fontWeight};
`;

const HeaderRight = styled.View`
  width: 40px;
`;

const LoadingContainer = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
`;

const Content = styled.View`
  padding: ${({ theme }) => theme.spacing.lg}px;
`;

const PriceSection = styled.View`
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const CurrentPrice = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 36px;
  font-weight: 700;
`;

const PriceChangeRow = styled.View`
  flex-direction: row;
  align-items: center;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
`;

const PriceChangeText = styled.Text`
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

const ChartContainer = styled.View`
  height: ${CHART_HEIGHT}px;
  position: relative;
  background-color: ${({ theme }) => theme.colors.backgroundSecondary};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  overflow: hidden;
`;

const ChartArea = styled.View`
  flex: 1;
  position: relative;
  margin-right: 60px;
`;

const GridLine = styled.View`
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background-color: ${({ theme }) => theme.colors.border};
  opacity: 0.3;
`;

const LineChartContainer = styled.View`
  position: absolute;
  top: 10px;
  left: 10px;
  right: 10px;
  bottom: 10px;
`;

const LineSegment = styled.View`
  position: absolute;
  height: 2px;
  transform-origin: left center;
`;

const CurrentPriceDot = styled.View`
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 4px;
  margin-top: -4px;
  margin-right: -4px;
`;

const ChartPlaceholder = styled.View`
  height: ${CHART_HEIGHT}px;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
`;

const ChartPlaceholderText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ChartLabels = styled.View`
  position: absolute;
  right: ${({ theme }) => theme.spacing.sm}px;
  top: ${({ theme }) => theme.spacing.sm}px;
  bottom: ${({ theme }) => theme.spacing.sm}px;
  width: 55px;
  justify-content: space-between;
  align-items: flex-end;
`;

const ChartLabel = styled.Text`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 10px;
`;

const TimeRangeRow = styled.View`
  flex-direction: row;
  justify-content: center;
  margin-top: ${({ theme }) => theme.spacing.md}px;
  gap: ${({ theme }) => theme.spacing.sm}px;
`;

const TimeRangeButton = styled.TouchableOpacity<{ $active: boolean }>`
  padding: ${({ theme }) => theme.spacing.sm}px
    ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  background-color: ${({ theme, $active }) =>
    $active ? theme.colors.primary : theme.colors.surface};
`;

const TimeRangeText = styled.Text<{ $active: boolean }>`
  color: ${({ theme, $active }) =>
    $active ? '#fff' : theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  font-weight: 500;
`;

const BuyButton = styled.TouchableOpacity`
  background-color: ${({ theme }) => theme.colors.primary};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.xl}px;
`;

const BuyButtonText = styled.Text`
  color: #fff;
  font-size: ${({ theme }) => theme.typography.button.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.button.fontWeight};
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
  font-weight: 500;
`;

const ColoredValue = styled.Text<{ $isPositive: boolean }>`
  color: ${({ theme, $isPositive }) =>
    $isPositive ? theme.colors.success : theme.colors.error};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  font-weight: 500;
`;

export default CoinDetailScreen;
