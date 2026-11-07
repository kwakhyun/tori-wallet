/**
 * 거래 내역 화면
 *
 * - 탐색기 API(일반 + ERC-20 전송)를 페이지 단위로 불러오고 끝까지 스크롤하면 다음 페이지를 읽는다.
 * - 이 기기에서 제출한 대기 중 거래는 API 결과와 해시로 합쳐 항상 위에 보인다.
 * - API를 읽지 못하면 로컬 캐시(Realm)를 보여 주고, 아무것도 없으면 오류 + 다시 시도.
 * - 날짜별(오늘/어제/날짜)로 묶어 표시하고, 행을 누르면 거래 상세로 이동한다.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components/native';
import { useShallow } from 'zustand/react/shallow';
import {
  StatusBar,
  SectionList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { useTheme } from '@/hooks/useTheme';
import { useFiat } from '@/hooks/useFiat';
import { useWalletStore } from '@/store/walletStore';
import {
  transactionHistoryService,
  type Transaction,
  type TransactionKind,
} from '@/services/transactionHistory';
import { useTransactions } from '@/realm/hooks';
import { transactionCacheService } from '@/realm/services';
import type { TransactionCacheEntry } from '@/realm/schemas';
import { formatDisplayAmount } from '@/utils/format';
import { ActivityScreenSkeleton } from '@/components/common/Skeleton';
import { TabScreen } from '@/components/common/Screen';
import { ErrorState, EmptyState } from '@/components/common/StateViews';
import type { Theme } from '@/styles/theme';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const PAGE_SIZE = 20;

export interface ActivitySection {
  title: string;
  data: Transaction[];
}

function lower(value: string | undefined | null): string {
  return (value || '').toLowerCase();
}

/** Realm 캐시 항목 → 화면 표시용 거래 */
export function fromCacheEntry(tx: TransactionCacheEntry): Transaction {
  const status: Transaction['status'] =
    tx.status === 'confirmed'
      ? 'success'
      : tx.status === 'failed' || tx.status === 'cancelled'
      ? 'failed'
      : 'pending';
  return {
    hash: tx.hash,
    from: tx.from,
    to: tx.to,
    // 토큰/스왑은 사람이 입력한 토큰 수량을 보여 준다.
    value: tx.tokenAmount || tx.value,
    valueWei: tx.valueWei,
    gasUsed: tx.gasUsed || '0',
    gasPrice: tx.gasPrice,
    fee: tx.fee || '0',
    timestamp: tx.timestamp * 1000,
    blockNumber: tx.blockNumber || '',
    isError: status === 'failed',
    type: (tx.type as TransactionKind) || 'send',
    status,
    tokenSymbol: tx.tokenSymbol || undefined,
    tokenAddress: tx.tokenAddress || undefined,
    isLocal: tx.isLocal,
  };
}

/**
 * API 내역 + 로컬 대기 거래 (+ API 실패 시 캐시) 를 해시 기준으로 합친다.
 * API에 이미 있는 거래는 API 값을 우선한다 (확정 상태가 더 정확).
 */
export function mergeTransactions(
  apiTransactions: Transaction[],
  pending: Transaction[],
  cached: Transaction[] = [],
): Transaction[] {
  const byHash = new Map<string, Transaction>();
  for (const tx of apiTransactions) {
    const key = lower(tx.hash);
    if (!byHash.has(key)) byHash.set(key, tx);
  }
  for (const tx of cached) {
    const key = lower(tx.hash);
    if (!byHash.has(key)) byHash.set(key, tx);
  }
  for (const tx of pending) {
    const key = lower(tx.hash);
    if (!byHash.has(key)) byHash.set(key, { ...tx, status: 'pending' });
  }
  return [...byHash.values()].sort((a, b) => {
    // 대기 중 거래는 항상 맨 위
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (b.status === 'pending' && a.status !== 'pending') return 1;
    return b.timestamp - a.timestamp;
  });
}

/** 날짜 묶음 제목: 오늘 / 어제 / M월 D일 / YYYY년 M월 D일 */
export function dayLabel(timestamp: number, now: Date = new Date()): string {
  const date = new Date(timestamp);
  const startOf = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(date)) / 86400000);
  if (diffDays <= 0) return '오늘';
  if (diffDays === 1) return '어제';
  const md = `${date.getMonth() + 1}월 ${date.getDate()}일`;
  return date.getFullYear() === now.getFullYear()
    ? md
    : `${date.getFullYear()}년 ${md}`;
}

export function groupByDay(
  transactions: Transaction[],
  now: Date = new Date(),
): ActivitySection[] {
  const sections: ActivitySection[] = [];
  for (const tx of transactions) {
    const title =
      tx.status === 'pending' ? '대기 중' : dayLabel(tx.timestamp, now);
    const last = sections[sections.length - 1];
    if (last && last.title === title) last.data.push(tx);
    else sections.push({ title, data: [tx] });
  }
  return sections;
}

function formatAddress(address: string): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatTime(timestamp: number): string {
  const diffMins = Math.floor((Date.now() - timestamp) / 60000);
  if (diffMins < 1) return '방금 전';
  if (diffMins < 60) return `${diffMins}분 전`;
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
}

const TYPE_LABELS: Record<TransactionKind, string> = {
  send: '보냄',
  receive: '받음',
  swap: '스왑',
  approve: '토큰 사용 승인',
  contract: '컨트랙트 실행',
};

const TYPE_ICONS: Record<TransactionKind, string> = {
  send: '↑',
  receive: '↓',
  swap: '⇄',
  approve: '✓',
  contract: '⚙',
};

function typeColors(theme: Theme, type: TransactionKind) {
  switch (type) {
    case 'send':
      return { fg: theme.colors.error, bg: theme.colors.errorSubtle };
    case 'receive':
      return { fg: theme.colors.success, bg: theme.colors.successSubtle };
    case 'swap':
      return { fg: theme.colors.primary, bg: theme.colors.primarySubtle };
    case 'approve':
      return { fg: theme.colors.warning, bg: theme.colors.warningSubtle };
    default:
      return {
        fg: theme.colors.textSecondary,
        bg: theme.colors.backgroundTertiary,
      };
  }
}

/** 금액 표시 문자열 (수량은 formatDisplayAmount로 통일 — NaN 없음) */
export function describeAmount(
  tx: Transaction,
  nativeSymbol: string,
): string | null {
  const symbol = tx.tokenSymbol || nativeSymbol;
  const amount = `${formatDisplayAmount(tx.value)} ${symbol}`;
  switch (tx.type) {
    case 'send':
      return `-${amount}`;
    case 'receive':
      return `+${amount}`;
    case 'swap':
      return tx.receivedValue && tx.receivedSymbol
        ? `${amount} → ${formatDisplayAmount(tx.receivedValue)} ${
            tx.receivedSymbol
          }`
        : amount;
    case 'approve':
      return tx.tokenSymbol ? tx.tokenSymbol : null;
    default:
      return Number(tx.value) > 0 ? `-${amount}` : null;
  }
}

function ActivityScreen(): React.JSX.Element {
  const { theme, isDarkMode } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const { mask } = useFiat();
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
  const address = activeWallet?.address;
  const activeNetwork = networks.find(n => n.chainId === activeNetworkChainId);
  const nativeSymbol = activeNetwork?.symbol || 'ETH';
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);

  // 탐색기 API (페이지 단위)
  const historyQuery = useInfiniteQuery({
    queryKey: ['transactions', address, activeNetworkChainId],
    queryFn: ({ pageParam }) =>
      transactionHistoryService.getHistoryPage(
        address || '',
        activeNetworkChainId,
        pageParam,
        PAGE_SIZE,
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) =>
      lastPage?.hasMore ? pages.length + 1 : undefined,
    enabled: !!address,
    staleTime: 30000,
  });

  // 이 기기에서 제출한 대기 중 거래
  const pendingQuery = useQuery({
    queryKey: ['pendingTransactions', address, activeNetworkChainId],
    // Realm 객체는 초기화 시 무효화될 수 있으므로 즉시 일반 객체로 복사한다.
    queryFn: async () =>
      (
        (await transactionCacheService.getPendingTransactions(
          address,
          activeNetworkChainId,
        )) ?? []
      ).map(fromCacheEntry),
    enabled: !!address,
    refetchInterval: 5000,
  });

  // 로컬 캐시 (오프라인/오류 시 대체 표시)
  const { transactions: cachedEntries, refetch: refetchCache } =
    useTransactions(address, { chainId: activeNetworkChainId, limit: 50 });

  const apiTransactions = useMemo(
    () => historyQuery.data?.pages.flatMap(page => page.transactions) ?? [],
    [historyQuery.data],
  );

  // API 첫 페이지를 로컬 캐시에 반영 (대기 중이던 로컬 거래의 확정 상태 갱신 포함)
  const firstPage = historyQuery.data?.pages[0]?.transactions;
  useEffect(() => {
    if (!firstPage || firstPage.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        await transactionCacheService.syncTransactions(
          firstPage.map(tx => ({
            hash: tx.hash,
            chainId: activeNetworkChainId,
            from: tx.from,
            to: tx.to,
            value: tx.value,
            valueWei: tx.valueWei,
            gasPrice: tx.gasPrice,
            gasUsed: tx.gasUsed,
            fee: tx.fee,
            timestamp: Math.floor(tx.timestamp / 1000),
            blockNumber: tx.blockNumber,
            status: tx.status === 'success' ? 'confirmed' : tx.status,
            type: tx.type,
            ...(tx.tokenSymbol ? { tokenSymbol: tx.tokenSymbol } : {}),
            ...(tx.tokenAddress ? { tokenAddress: tx.tokenAddress } : {}),
            ...(tx.tokenSymbol ? { tokenAmount: tx.value } : {}),
            isLocal: false,
          })),
        );
        if (cancelled) return;
        refetchCache?.();
        pendingQuery.refetch();
      } catch (error) {
        console.warn('Failed to sync transactions to cache:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
    // pendingQuery.refetch는 안정적인 참조가 아니므로 의존성에서 제외한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstPage, activeNetworkChainId, refetchCache]);

  const pendingTransactions = useMemo(
    () => (Array.isArray(pendingQuery.data) ? pendingQuery.data : []),
    [pendingQuery.data],
  );

  const usingCacheFallback = historyQuery.isError && !historyQuery.data;
  const cachedTransactions = useMemo(
    () =>
      usingCacheFallback
        ? (Array.isArray(cachedEntries) ? cachedEntries : []).map(
            fromCacheEntry,
          )
        : [],
    [usingCacheFallback, cachedEntries],
  );

  const transactions = useMemo(
    () =>
      mergeTransactions(
        apiTransactions,
        pendingTransactions,
        cachedTransactions,
      ),
    [apiTransactions, pendingTransactions, cachedTransactions],
  );
  const sections = useMemo(() => groupByDay(transactions), [transactions]);

  const handleRefresh = useCallback(async () => {
    setIsPullRefreshing(true);
    try {
      transactionHistoryService.clearCache();
      await Promise.all([historyQuery.refetch(), pendingQuery.refetch()]);
      refetchCache?.();
    } finally {
      setIsPullRefreshing(false);
    }
  }, [historyQuery, pendingQuery, refetchCache]);

  const handleEndReached = useCallback(() => {
    if (
      historyQuery.hasNextPage &&
      !historyQuery.isFetchingNextPage &&
      !historyQuery.isFetchNextPageError
    ) {
      historyQuery.fetchNextPage();
    }
  }, [historyQuery]);

  const handlePress = useCallback(
    (tx: Transaction) => {
      navigation.navigate('TransactionDetail', {
        txHash: tx.hash,
        chainId: activeNetworkChainId,
      });
    },
    [navigation, activeNetworkChainId],
  );

  const renderTransaction = ({ item }: { item: Transaction }) => {
    const colors = typeColors(theme, item.type);
    const label = TYPE_LABELS[item.type] ?? '거래';
    const amount = describeAmount(item, nativeSymbol);
    const counterparty =
      item.type === 'receive' ? item.from : item.to || item.from;
    const arrow = item.type === 'receive' ? '← ' : '→ ';
    const failed = item.status === 'failed';
    const pending = item.status === 'pending';
    const showFee =
      item.type !== 'receive' && !!item.fee && Number(item.fee) > 0 && !pending;
    const amountText = amount ? mask(amount) : null;

    return (
      <TransactionItem
        onPress={() => handlePress(item)}
        testID={`activity-tx-${item.hash}`}
        accessibilityRole="button"
        accessibilityLabel={[
          label,
          pending ? '대기 중' : failed ? '실패' : null,
          amountText,
          formatAddress(counterparty),
          formatTime(item.timestamp),
        ]
          .filter(Boolean)
          .join(', ')}
        accessibilityHint="거래 상세 보기"
      >
        <IconContainer $bg={colors.bg}>
          <IconText $color={colors.fg} importantForAccessibility="no">
            {TYPE_ICONS[item.type] ?? '•'}
          </IconText>
        </IconContainer>

        <TransactionInfo>
          <TransactionRow>
            <LabelRow>
              <TransactionLabel $failed={failed} numberOfLines={1}>
                {label}
                {failed ? ' (실패)' : ''}
              </TransactionLabel>
              {pending ? (
                <PendingBadge testID="activity-pending-badge">
                  <PendingText>대기 중</PendingText>
                </PendingBadge>
              ) : null}
            </LabelRow>
            {amountText ? (
              <TransactionAmount
                $color={
                  failed
                    ? theme.colors.textTertiary
                    : item.type === 'receive'
                    ? theme.colors.success
                    : item.type === 'send'
                    ? theme.colors.error
                    : theme.colors.textPrimary
                }
                numberOfLines={1}
              >
                {amountText}
              </TransactionAmount>
            ) : null}
          </TransactionRow>

          <TransactionRow>
            <TransactionAddress numberOfLines={1}>
              {arrow}
              {formatAddress(counterparty)}
            </TransactionAddress>
            <TransactionTime>{formatTime(item.timestamp)}</TransactionTime>
          </TransactionRow>

          {showFee ? (
            <TransactionFee>
              수수료: {formatDisplayAmount(item.fee)} {nativeSymbol}
            </TransactionFee>
          ) : null}
        </TransactionInfo>

        <ChevronText importantForAccessibility="no">›</ChevronText>
      </TransactionItem>
    );
  };

  const renderFooter = () => {
    if (historyQuery.isFetchingNextPage) {
      return (
        <Footer>
          <ActivityIndicator
            color={theme.colors.primary}
            accessibilityLabel="이전 내역 불러오는 중"
          />
        </Footer>
      );
    }
    if (historyQuery.isFetchNextPageError) {
      return (
        <ErrorState
          compact
          title="이전 내역을 불러오지 못했습니다"
          message=""
          onRetry={() => historyQuery.fetchNextPage()}
          testID="activity-more-error"
        />
      );
    }
    return null;
  };

  if (!activeWallet) {
    return (
      <TabScreen>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <Content>
          <Title accessibilityRole="header">활동</Title>
          <EmptyState title="지갑이 없습니다" />
        </Content>
      </TabScreen>
    );
  }

  const isInitialLoading =
    historyQuery.isLoading && !historyQuery.data && transactions.length === 0;
  const showFullError =
    historyQuery.isError && !historyQuery.data && transactions.length === 0;

  return (
    <TabScreen testID="activity-screen">
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <Content>
        <Header>
          <Title accessibilityRole="header">활동</Title>
          <NetworkBadge>
            <NetworkDot $isTestnet={activeNetwork?.isTestnet} />
            <NetworkName numberOfLines={1}>{activeNetwork?.name}</NetworkName>
          </NetworkBadge>
        </Header>

        {usingCacheFallback && transactions.length > 0 ? (
          <StaleBanner
            onPress={handleRefresh}
            accessibilityRole="button"
            accessibilityLabel="최신 내역을 불러오지 못했습니다. 저장된 내역을 표시 중입니다. 다시 시도"
            testID="activity-stale-banner"
          >
            <StaleText>
              최신 내역을 불러오지 못해 저장된 내역을 표시 중입니다 · 다시 시도
            </StaleText>
          </StaleBanner>
        ) : null}

        {isInitialLoading ? (
          <ActivityScreenSkeleton />
        ) : showFullError ? (
          <ErrorState
            title="거래 내역을 불러오지 못했습니다"
            onRetry={handleRefresh}
            testID="activity-error"
          />
        ) : (
          <SectionList
            testID="activity-list"
            sections={sections}
            renderItem={renderTransaction}
            renderSectionHeader={({ section }) => (
              <SectionHeader accessibilityRole="header">
                {section.title}
              </SectionHeader>
            )}
            keyExtractor={item => item.hash}
            stickySectionHeadersEnabled={false}
            ListEmptyComponent={
              <EmptyState
                icon="📋"
                title="거래 내역이 없습니다"
                message={`${
                  activeNetwork?.name ?? '이 네트워크'
                }에서 토큰을 보내거나 받으면 여기에 표시됩니다.`}
              />
            }
            ListFooterComponent={renderFooter}
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.4}
            refreshControl={
              <RefreshControl
                refreshing={isPullRefreshing}
                onRefresh={handleRefresh}
                tintColor={theme.colors.primary}
              />
            }
            showsVerticalScrollIndicator={false}
            contentContainerStyle={
              sections.length === 0 ? emptyContentStyle : undefined
            }
          />
        )}
      </Content>
    </TabScreen>
  );
}

const emptyContentStyle = { flexGrow: 1, justifyContent: 'center' as const };

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
  background-color: ${({ theme }) => theme.colors.surface};
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
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  flex-shrink: 1;
`;

const StaleBanner = styled.TouchableOpacity`
  min-height: 44px;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.sm}px
    ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  background-color: ${({ theme }) => theme.colors.warningSubtle};
`;

const StaleText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
`;

const SectionHeader = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  font-weight: 600;
  padding: ${({ theme }) => theme.spacing.sm}px 0;
  background-color: ${({ theme }) => theme.colors.background};
`;

const TransactionItem = styled(TouchableOpacity)`
  flex-direction: row;
  align-items: center;
  min-height: 64px;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const IconContainer = styled.View<{ $bg: string }>`
  width: 40px;
  height: 40px;
  border-radius: 20px;
  background-color: ${({ $bg }) => $bg};
  align-items: center;
  justify-content: center;
  margin-right: ${({ theme }) => theme.spacing.md}px;
`;

const IconText = styled.Text<{ $color: string }>`
  color: ${({ $color }) => $color};
  font-size: 18px;
  font-weight: bold;
`;

const TransactionInfo = styled.View`
  flex: 1;
`;

const TransactionRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
`;

const LabelRow = styled.View`
  flex-direction: row;
  align-items: center;
  flex-shrink: 1;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const TransactionLabel = styled.Text<{ $failed?: boolean }>`
  color: ${({ theme, $failed }) =>
    $failed ? theme.colors.error : theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  font-weight: 600;
  flex-shrink: 1;
`;

const PendingBadge = styled.View`
  margin-left: ${({ theme }) => theme.spacing.xs}px;
  padding: 2px ${({ theme }) => theme.spacing.sm}px;
  border-radius: ${({ theme }) => theme.borderRadius.full}px;
  background-color: ${({ theme }) => theme.colors.warningSubtle};
`;

const PendingText = styled.Text`
  color: ${({ theme }) => theme.colors.warning};
  font-size: 11px;
  font-weight: 700;
`;

const TransactionAmount = styled.Text<{ $color: string }>`
  color: ${({ $color }) => $color};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  font-weight: 600;
  flex-shrink: 1;
  text-align: right;
`;

const TransactionAddress = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  flex-shrink: 1;
`;

const TransactionTime = styled.Text`
  color: ${({ theme }) => theme.colors.textTertiary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  margin-left: ${({ theme }) => theme.spacing.sm}px;
`;

const TransactionFee = styled.Text`
  color: ${({ theme }) => theme.colors.textTertiary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
`;

const ChevronText = styled.Text`
  color: ${({ theme }) => theme.colors.textTertiary};
  font-size: 20px;
  margin-left: ${({ theme }) => theme.spacing.sm}px;
`;

const Footer = styled.View`
  padding: ${({ theme }) => theme.spacing.lg}px 0;
  align-items: center;
`;

export default ActivityScreen;
