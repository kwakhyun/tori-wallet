/**
 * 코인 탐색 화면 (인기 코인 목록, 검색)
 */

import React, { useState, useCallback, useEffect } from 'react';
import styled, { useTheme } from 'styled-components/native';
import {
  SafeAreaView,
  StatusBar,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Image,
  Alert,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { coinService, Coin } from '@/services/coinService';

const styles = StyleSheet.create({
  searchList: { paddingHorizontal: 16 },
  coinList: { paddingHorizontal: 16, paddingBottom: 20 },
});

// 간단한 디바운스 구현
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState<T>(value);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

function ExploreScreen(): React.JSX.Element {
  const theme = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const [coins, setCoins] = useState<Coin[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<
    {
      id: string;
      name: string;
      symbol: string;
      thumb: string;
      market_cap_rank: number;
    }[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const debouncedQuery = useDebounce(searchQuery, 300);

  // Rate Limit 알림 콜백 설정
  useEffect(() => {
    coinService.setRateLimitCallback((message: string) => {
      Alert.alert('데이터 조회 제한', message, [{ text: '확인' }]);
    });
  }, []);

  // 코인 목록 로드 (TOP 20)
  const loadCoins = useCallback(async () => {
    try {
      const data = await coinService.getTopCoins(1, 20);
      setCoins(data);
    } catch (error) {
      console.error('Failed to load coins:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // 검색
  const handleSearch = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      const result = await coinService.searchCoins(query);
      setSearchResults(result.coins.slice(0, 20));
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    loadCoins();
  }, [loadCoins]);

  useEffect(() => {
    handleSearch(debouncedQuery);
  }, [debouncedQuery, handleSearch]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadCoins();
  }, [loadCoins]);

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
      const priceChange = item.price_change_percentage_24h ?? 0;
      const priceChangeColor =
        priceChange >= 0 ? theme.colors.success : theme.colors.error;

      return (
        <CoinItem
          onPress={() =>
            handleCoinPress(item.id, item.name, item.symbol, item.image)
          }
        >
          <RankBadge>
            <RankText>{item.market_cap_rank}</RankText>
          </RankBadge>
          <CoinImage source={{ uri: item.image }} />
          <CoinInfo>
            <CoinName>{item.name}</CoinName>
            <CoinSymbol>{item.symbol.toUpperCase()}</CoinSymbol>
          </CoinInfo>
          <CoinPriceContainer>
            <CoinPrice>{coinService.formatPrice(item.current_price)}</CoinPrice>
            <PriceChange style={{ color: priceChangeColor }}>
              {coinService.formatPercentage(item.price_change_percentage_24h)}
            </PriceChange>
          </CoinPriceContainer>
        </CoinItem>
      );
    },
    [handleCoinPress, theme.colors.success, theme.colors.error],
  );

  const renderSearchItem = useCallback(
    ({
      item,
    }: {
      item: {
        id: string;
        name: string;
        symbol: string;
        thumb: string;
        market_cap_rank: number;
      };
    }) => (
      <CoinItem
        onPress={() =>
          handleCoinPress(item.id, item.name, item.symbol, item.thumb)
        }
      >
        {item.market_cap_rank && (
          <RankBadge>
            <RankText>{item.market_cap_rank}</RankText>
          </RankBadge>
        )}
        <CoinImage source={{ uri: item.thumb }} />
        <CoinInfo>
          <CoinName>{item.name}</CoinName>
          <CoinSymbol>{item.symbol.toUpperCase()}</CoinSymbol>
        </CoinInfo>
        <ArrowIcon>›</ArrowIcon>
      </CoinItem>
    ),
    [handleCoinPress],
  );

  const isSearchMode = searchQuery.length > 0;

  return (
    <Container>
      <StatusBar barStyle="light-content" />
      <Header>
        <Title>탐색</Title>
      </Header>

      <SearchContainer>
        <SearchIcon>🔍</SearchIcon>
        <SearchInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="코인 검색..."
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <ClearButton onPress={() => setSearchQuery('')}>
            <ClearButtonText>✕</ClearButtonText>
          </ClearButton>
        )}
      </SearchContainer>

      {isLoading ? (
        <LoadingContainer>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <LoadingText>코인 목록을 불러오는 중...</LoadingText>
        </LoadingContainer>
      ) : isSearchMode ? (
        <>
          <SectionTitle>검색 결과</SectionTitle>
          {isSearching ? (
            <LoadingContainer>
              <ActivityIndicator size="small" color={theme.colors.primary} />
            </LoadingContainer>
          ) : searchResults.length > 0 ? (
            <FlatList
              data={searchResults}
              keyExtractor={item => item.id}
              renderItem={renderSearchItem}
              contentContainerStyle={styles.searchList}
            />
          ) : (
            <EmptyContainer>
              <EmptyText>검색 결과가 없습니다</EmptyText>
            </EmptyContainer>
          )}
        </>
      ) : (
        <>
          <SectionTitle>인기 코인 Top 100</SectionTitle>
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
          />
        </>
      )}
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
`;

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
  padding: 0 ${({ theme }) => theme.spacing.md}px;
`;

const SearchIcon = styled.Text`
  font-size: 16px;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const SearchInput = styled.TextInput`
  flex: 1;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  padding: ${({ theme }) => theme.spacing.md}px 0;
`;

const ClearButton = styled.TouchableOpacity`
  padding: ${({ theme }) => theme.spacing.sm}px;
`;

const ClearButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 16px;
`;

const SectionTitle = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  text-transform: uppercase;
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

const EmptyContainer = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
`;

const EmptyText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
`;

const CoinItem = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
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

const PriceChange = styled.Text`
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  margin-top: 2px;
`;

const ArrowIcon = styled.Text`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 24px;
`;

export default ExploreScreen;
