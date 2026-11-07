/**
 * 코인 탐색 화면 (인기 코인 목록, 검색)
 *
 * - 목록 조회 실패 시 빈 화면 대신 오류 + 다시 시도
 * - 검색은 2자 이상부터 (1자는 안내 문구)
 * - 검색 실패(429 포함)와 "결과 없음"을 구분해 보여 준다 (실패는 캐시하지 않음)
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import styled from 'styled-components/native';
import {
  StatusBar,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Image,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { useTheme } from '@/hooks/useTheme';
import { useDebounce } from '@/hooks/useDebounce';
import { useFiat } from '@/hooks/useFiat';
import { coinService, Coin, RateLimitError } from '@/services/coinService';
import { showToast } from '@/store/toastStore';
import { TabScreen } from '@/components/common/Screen';
import { IconButton } from '@/components/common/IconButton';
import { ErrorState, EmptyState } from '@/components/common/StateViews';

const styles = StyleSheet.create({
  searchList: { paddingHorizontal: 16 },
  coinList: { paddingHorizontal: 16, paddingBottom: 20 },
});

export const MIN_SEARCH_LENGTH = 2;

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface SearchCoin {
  id: string;
  name: string;
  symbol: string;
  thumb: string;
  market_cap_rank: number;
}

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; results: SearchCoin[] }
  | { status: 'error'; rateLimited: boolean };

function ExploreScreen(): React.JSX.Element {
  const { theme, isDarkMode } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const { formatFiat } = useFiat();
  const [coins, setCoins] = useState<Coin[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [search, setSearch] = useState<SearchState>({ status: 'idle' });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const searchRequestId = useRef(0);

  const debouncedQuery = useDebounce(searchQuery, 300);

  // Rate Limit 안내는 화면을 막지 않는 토스트로 표시
  useEffect(() => {
    coinService.setRateLimitCallback((message: string) => {
      showToast(message.replace(/\n/g, ' '), 'warning');
    });
  }, []);

  // 코인 목록 로드 (TOP 20)
  const loadCoins = useCallback(async () => {
    try {
      const data = await coinService.getTopCoins(1, 20);
      setCoins(Array.isArray(data) ? data : []);
      setLoadError(false);
    } catch (error) {
      console.warn('Failed to load coins:', error);
      setLoadError(true);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // 검색
  const runSearch = useCallback(async (query: string) => {
    const requestId = ++searchRequestId.current;
    const normalizedQuery = query.trim();

    if (normalizedQuery.length < MIN_SEARCH_LENGTH) {
      setSearch({ status: 'idle' });
      return;
    }

    setSearch({ status: 'loading' });
    try {
      const result = await coinService.searchCoins(normalizedQuery);
      if (requestId === searchRequestId.current) {
        setSearch({
          status: 'done',
          results: (result?.coins ?? []).slice(0, 20),
        });
      }
    } catch (error) {
      if (requestId === searchRequestId.current) {
        setSearch({
          status: 'error',
          rateLimited: error instanceof RateLimitError,
        });
      }
    }
  }, []);

  useEffect(() => {
    loadCoins();
  }, [loadCoins]);

  useEffect(() => {
    runSearch(debouncedQuery);
  }, [debouncedQuery, runSearch]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadCoins();
  }, [loadCoins]);

  const handleRetryLoad = useCallback(() => {
    setIsLoading(true);
    loadCoins();
  }, [loadCoins]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  const handleCoinPress = useCallback(
    (
      coinId: string,
      coinName: string,
      coinSymbol: string,
      coinImage: string,
    ) => {
      navigation.navigate('CoinDetail', {
        coinId,
        coinName,
        coinSymbol,
        coinImage,
      });
    },
    [navigation],
  );

  const renderCoinItem = useCallback(
    ({ item }: { item: Coin }) => {
      const priceChange = item.price_change_percentage_24h;
      const hasChange =
        typeof priceChange === 'number' && Number.isFinite(priceChange);
      const priceChangeColor = !hasChange
        ? theme.colors.textSecondary
        : priceChange >= 0
        ? theme.colors.success
        : theme.colors.error;
      const priceText = formatFiat(item.current_price || null, {
        ignoreHidden: true,
        maximumFractionDigits: item.current_price < 1 ? 6 : undefined,
      });
      const changeText = coinService.formatPercentage(priceChange);

      return (
        <CoinItem
          onPress={() =>
            handleCoinPress(item.id, item.name, item.symbol, item.image)
          }
          testID={`explore-coin-${item.id}`}
          accessibilityRole="button"
          accessibilityLabel={`${item.name}, ${priceText}, 24시간 ${changeText}`}
        >
          {item.market_cap_rank ? (
            <RankBadge>
              <RankText>{item.market_cap_rank}</RankText>
            </RankBadge>
          ) : null}
          <CoinImage source={{ uri: item.image }} />
          <CoinInfo>
            <CoinName numberOfLines={1}>{item.name}</CoinName>
            <CoinSymbol>{item.symbol.toUpperCase()}</CoinSymbol>
          </CoinInfo>
          <CoinPriceContainer>
            <CoinPrice>{priceText}</CoinPrice>
            <PriceChange $color={priceChangeColor}>{changeText}</PriceChange>
          </CoinPriceContainer>
        </CoinItem>
      );
    },
    [handleCoinPress, formatFiat, theme.colors],
  );

  const renderSearchItem = useCallback(
    ({ item }: { item: SearchCoin }) => (
      <CoinItem
        onPress={() =>
          handleCoinPress(item.id, item.name, item.symbol, item.thumb)
        }
        testID={`explore-search-${item.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${item.name} ${item.symbol.toUpperCase()}`}
      >
        {item.market_cap_rank > 0 ? (
          <RankBadge>
            <RankText>{item.market_cap_rank}</RankText>
          </RankBadge>
        ) : null}
        <CoinImage source={{ uri: item.thumb }} />
        <CoinInfo>
          <CoinName numberOfLines={1}>{item.name}</CoinName>
          <CoinSymbol>{item.symbol.toUpperCase()}</CoinSymbol>
        </CoinInfo>
        <ArrowIcon importantForAccessibility="no">›</ArrowIcon>
      </CoinItem>
    ),
    [handleCoinPress],
  );

  const isSearchMode = searchQuery.trim().length > 0;
  const tooShort =
    isSearchMode && searchQuery.trim().length < MIN_SEARCH_LENGTH;

  const renderSearchBody = () => {
    if (tooShort) {
      return (
        <HintText testID="explore-search-hint">
          {MIN_SEARCH_LENGTH}글자 이상 입력하면 검색합니다
        </HintText>
      );
    }
    if (search.status === 'loading' || search.status === 'idle') {
      return (
        <LoadingContainer>
          <ActivityIndicator
            size="small"
            color={theme.colors.primary}
            accessibilityLabel="검색 중"
          />
        </LoadingContainer>
      );
    }
    if (search.status === 'error') {
      return (
        <ErrorState
          title={
            search.rateLimited
              ? '검색 요청이 너무 많습니다'
              : '검색하지 못했습니다'
          }
          message={
            search.rateLimited
              ? '무료 데이터 조회 제한에 도달했습니다. 잠시 후 다시 시도해주세요.'
              : '네트워크 연결을 확인한 뒤 다시 시도해주세요.'
          }
          onRetry={() => runSearch(searchQuery)}
          testID="explore-search-error"
        />
      );
    }
    if (search.results.length === 0) {
      return (
        <EmptyState
          title="검색 결과가 없습니다"
          message="다른 이름이나 심볼로 검색해보세요."
          testID="explore-search-empty"
        />
      );
    }
    return (
      <FlatList
        data={search.results}
        keyExtractor={item => item.id}
        renderItem={renderSearchItem}
        contentContainerStyle={styles.searchList}
        keyboardShouldPersistTaps="handled"
      />
    );
  };

  const renderListBody = () => {
    if (loadError && coins.length === 0) {
      return (
        <ErrorState
          title="코인 목록을 불러오지 못했습니다"
          onRetry={handleRetryLoad}
          testID="explore-error"
        />
      );
    }
    return (
      <>
        <SectionTitle accessibilityRole="header">인기 코인 Top 20</SectionTitle>
        <FlatList
          data={coins}
          keyExtractor={item => item.id}
          renderItem={renderCoinItem}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.primary}
            />
          }
          contentContainerStyle={styles.coinList}
          showsVerticalScrollIndicator={false}
          testID="explore-coin-list"
        />
      </>
    );
  };

  return (
    <TabScreen testID="explore-screen">
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <Header>
        <Title accessibilityRole="header">탐색</Title>
      </Header>

      <SearchContainer>
        <SearchIcon importantForAccessibility="no">🔍</SearchIcon>
        <SearchInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="코인 이름 또는 심볼 검색"
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="코인 검색"
          testID="explore-search-input"
        />
        {searchQuery.length > 0 ? (
          <IconButton
            icon="✕"
            accessibilityLabel="검색어 지우기"
            onPress={handleClearSearch}
            testID="explore-search-clear"
          />
        ) : null}
      </SearchContainer>

      {isLoading ? (
        <LoadingContainer>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <LoadingText>코인 목록을 불러오는 중...</LoadingText>
        </LoadingContainer>
      ) : isSearchMode ? (
        <>
          <SectionTitle accessibilityRole="header">검색 결과</SectionTitle>
          {renderSearchBody()}
        </>
      ) : (
        renderListBody()
      )}
    </TabScreen>
  );
}

const Header = styled.View`
  padding: ${({ theme }) => theme.spacing.lg}px;
  padding-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const Title = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.h2.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.h2.fontWeight};
`;

const SearchContainer = styled.View`
  flex-direction: row;
  align-items: center;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  margin: 0 ${({ theme }) => theme.spacing.lg}px;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
  padding-left: ${({ theme }) => theme.spacing.md}px;
`;

const SearchIcon = styled.Text`
  font-size: 16px;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const SearchInput = styled.TextInput`
  flex: 1;
  min-height: 48px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  padding: ${({ theme }) => theme.spacing.sm}px 0;
`;

const SectionTitle = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  font-weight: 600;
  margin: ${({ theme }) => theme.spacing.sm}px
    ${({ theme }) => theme.spacing.lg}px;
`;

const LoadingContainer = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
`;

const LoadingText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: ${({ theme }) => theme.spacing.md}px;
`;

const HintText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  text-align: center;
  margin-top: ${({ theme }) => theme.spacing.xl}px;
`;

const CoinItem = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  min-height: 60px;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const RankBadge = styled.View`
  width: 28px;
  height: 28px;
  border-radius: 14px;
  background-color: ${({ theme }) => theme.colors.backgroundTertiary};
  align-items: center;
  justify-content: center;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const RankText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 10px;
  font-weight: 600;
`;

const CoinImage = styled(Image)`
  width: 36px;
  height: 36px;
  border-radius: 18px;
  margin-right: ${({ theme }) => theme.spacing.md}px;
`;

const CoinInfo = styled.View`
  flex: 1;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const CoinName = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  font-weight: 500;
`;

const CoinSymbol = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  margin-top: 2px;
`;

const CoinPriceContainer = styled.View`
  align-items: flex-end;
`;

const CoinPrice = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  font-weight: 500;
`;

const PriceChange = styled.Text<{ $color: string }>`
  color: ${({ $color }) => $color};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  margin-top: 2px;
`;

const ArrowIcon = styled.Text`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 24px;
`;

export default ExploreScreen;
