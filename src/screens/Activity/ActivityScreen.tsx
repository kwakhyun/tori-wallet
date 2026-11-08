/**
 * 거래 내역 화면
 *
 * - 탐색기 API(일반 + ERC-20 전송)를 페이지 단위로 불러오고 끝까지 스크롤하면 다음 페이지를 읽는다.
 *   여러 페이지는 원시 응답을 모아 다시 합친다 (뒤 페이지의 토큰 전송으로 앞 페이지 분류 보정).
 * - 이 기기에서 제출한 거래(Realm isLocal)는 API에 아직 없으면 항상 합쳐 보인다
 *   (탐색기 색인 지연 중 완료된 거래가 사라지지 않음). 대기 중 거래는 맨 위.
 * - 거래 추적기가 완료/실패/대체됨을 알리면 대기 목록, 로컬 기록, 탐색기 내역을 다시 읽는다.
 * - 탐색기 API가 없는 네트워크(사용자 추가 네트워크 등)는 이 기기의 기록을 기본으로 보여 주고
 *   그 사실을 안내한다. API를 읽지 못하면 저장된 전체 기록을 보여 준다.
 * - 가속/취소 거래는 '가속 거래'/'취소 시도'로 표시하고, 대기 중인 원래 거래와 한 행으로 묶는다.
 *   같은 nonce의 다른 거래가 먼저 처리된 거래는 실패가 아니라 '대체됨'으로 표시한다.
 * - 날짜별(오늘/어제/날짜)로 묶어 표시하고, 행을 누르면 거래 상세로 이동한다.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { useTheme } from '@/hooks/useTheme';
import { useFiat } from '@/hooks/useFiat';
import { useWalletStore } from '@/store/walletStore';
import { useSwapStore, type SwapHistoryItem } from '@/store/swapStore';
import {
  transactionHistoryService,
  type Transaction,
  type TransactionKind,
} from '@/services/transactionHistory';
import {
  parseReplacementMethod,
  transactionTracker,
  type ReplacementKind,
} from '@/services/transactionTracker';
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

/** 화면 표시용 거래: 대기 중인 가속/취소 거래와 묶인 원래 거래에는 그 종류를 표시한다. */
export type ActivityTransaction = Transaction & {
  pendingReplacement?: ReplacementKind;
};

export interface ActivitySection {
  title: string;
  data: ActivityTransaction[];
}

function lower(value: string | undefined | null): string {
  return (value || '').toLowerCase();
}

/**
 * Realm 캐시 항목 → 화면 표시용 거래
 *
 * @param viewer 보고 있는 계정. 기록은 보낸 쪽 기준으로 저장되므로 내 계정 사이 전송을
 *   받는 계정에서 보면 '받음'으로 바꾼다 (반대로 받은 쪽 기록을 보낸 계정에서 보면 '보냄').
 */
export function fromCacheEntry(
  tx: TransactionCacheEntry,
  viewer?: string,
): Transaction {
  const status: Transaction['status'] =
    tx.status === 'confirmed'
      ? 'success'
      : tx.status === 'failed'
      ? 'failed'
      : tx.status === 'cancelled'
      ? // 추적기는 같은 nonce의 다른 거래가 처리된 거래를 'cancelled'로 저장한다.
        'replaced'
      : 'pending';
  let type = (tx.type as TransactionKind) || 'send';
  if (viewer) {
    const me = lower(viewer);
    const from = lower(tx.from);
    const to = lower(tx.to);
    if (type === 'send' && from !== me && to === me) type = 'receive';
    else if (type === 'receive' && from === me && to !== me) type = 'send';
  }
  const replacement = parseReplacementMethod(tx.method) ?? undefined;
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
    type,
    status,
    tokenSymbol: tx.tokenSymbol || undefined,
    tokenAddress: tx.tokenAddress || undefined,
    isLocal: tx.isLocal,
    ...(replacement ? { replacement } : {}),
  };
}

/**
 * 이 기기의 기록으로 API 항목을 보정한다.
 * - 가속/취소 거래 표시를 유지한다.
 * - 앱에서 한 스왑은 스왑으로 표시한다. 토큰 → 네이티브 스왑은 받은 네이티브가 내부 거래라
 *   탐색기 목록만으로는 '보냄'으로 분류되기 때문이다.
 */
function withLocalContext(
  tx: Transaction,
  local: Transaction | undefined,
  swap: SwapHistoryItem | undefined,
): Transaction {
  let next = tx;
  if (!next.replacement && local?.replacement)
    next = { ...next, replacement: local.replacement };
  const isSwap = !!swap || local?.type === 'swap';
  if (
    isSwap &&
    next.type !== 'approve' &&
    (next.type !== 'swap' || !next.receivedValue)
  ) {
    const sold =
      next.type === 'swap'
        ? null
        : swap
        ? { value: swap.sellToken.amount, symbol: swap.sellToken.symbol }
        : !next.tokenSymbol && local?.tokenSymbol
        ? { value: local.value, symbol: local.tokenSymbol }
        : null;
    next = {
      ...next,
      type: 'swap',
      ...(sold ? { value: sold.value, tokenSymbol: sold.symbol } : {}),
      receivedValue: next.receivedValue ?? swap?.buyToken.amount,
      receivedSymbol: next.receivedSymbol ?? swap?.buyToken.symbol,
    };
  }
  return next;
}

/**
 * 대기 중인 원래 거래와 그 가속/취소 거래를 한 행으로 묶는다.
 * 원래 거래 행에 '가속 중'/'취소 시도 중'을 표시하고, 대기 중인 대체 거래 행은 숨긴다.
 */
function collapsePendingReplacements(
  transactions: Transaction[],
): ActivityTransaction[] {
  const pendingByOriginal = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    if (!tx.replacement || tx.status !== 'pending') continue;
    const key = lower(tx.replacement.originalHash);
    pendingByOriginal.set(key, [...(pendingByOriginal.get(key) ?? []), tx]);
  }
  if (pendingByOriginal.size === 0) return transactions;
  const hidden = new Set<string>();
  const result: ActivityTransaction[] = transactions.map(tx => {
    const replacements = pendingByOriginal.get(lower(tx.hash));
    if (tx.status !== 'pending' || tx.replacement || !replacements) return tx;
    for (const item of replacements) hidden.add(lower(item.hash));
    const latest = replacements.reduce((a, b) =>
      b.timestamp > a.timestamp ? b : a,
    );
    return { ...tx, pendingReplacement: latest.replacement!.kind };
  });
  return result.filter(tx => !hidden.has(lower(tx.hash)));
}

/**
 * API 내역 + 이 기기의 기록(로컬 거래, API 실패/미지원 시 저장된 전체 기록) + 로컬 대기 거래를
 * 해시 기준으로 합친다. API에 이미 있는 거래는 API 값을 우선한다 (확정 상태가 더 정확).
 */
export function mergeTransactions(
  apiTransactions: Transaction[],
  pending: Transaction[],
  cached: Transaction[] = [],
  options: { swaps?: SwapHistoryItem[] } = {},
): ActivityTransaction[] {
  const localByHash = new Map<string, Transaction>();
  for (const tx of [...pending, ...cached]) localByHash.set(lower(tx.hash), tx);
  const swapByHash = new Map<string, SwapHistoryItem>();
  for (const item of options.swaps ?? [])
    swapByHash.set(lower(item.txHash), item);

  const byHash = new Map<string, Transaction>();
  const add = (tx: Transaction) => {
    const key = lower(tx.hash);
    if (byHash.has(key)) return;
    byHash.set(
      key,
      withLocalContext(tx, localByHash.get(key), swapByHash.get(key)),
    );
  };
  for (const tx of apiTransactions) add(tx);
  for (const tx of cached) add(tx);
  for (const tx of pending) add({ ...tx, status: 'pending' });

  const sorted = [...byHash.values()].sort((a, b) => {
    // 대기 중 거래는 항상 맨 위
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (b.status === 'pending' && a.status !== 'pending') return 1;
    return b.timestamp - a.timestamp;
  });
  return collapsePendingReplacements(sorted);
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
  transactions: ActivityTransaction[],
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

const REPLACEMENT_LABELS: Record<ReplacementKind, string> = {
  speedUp: '가속 거래',
  cancel: '취소 시도',
};

const PENDING_REPLACEMENT_LABELS: Record<ReplacementKind, string> = {
  speedUp: '가속 중',
  cancel: '취소 시도 중',
};

/** 행 제목: 가속/취소 거래는 그 종류, 나머지는 거래 유형 */
export function labelOf(tx: Transaction): string {
  if (tx.replacement) return REPLACEMENT_LABELS[tx.replacement.kind];
  return TYPE_LABELS[tx.type] ?? '거래';
}

const STATUS_SUFFIX: Partial<Record<Transaction['status'], string>> = {
  failed: '실패',
  replaced: '대체됨',
};

const TYPE_ICONS: Record<TransactionKind, string> = {
  send: '↑',
  receive: '↓',
  swap: '⇄',
  approve: '✓',
  contract: '⚙',
};

function typeColors(theme: Theme, tx: Transaction) {
  if (tx.replacement?.kind === 'cancel')
    return {
      fg: theme.colors.textSecondary,
      bg: theme.colors.backgroundTertiary,
    };
  switch (tx.type) {
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
  // 취소 거래는 0을 자기 주소로 보내는 거래이므로 금액을 표시하지 않는다.
  if (tx.replacement?.kind === 'cancel') return null;
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
  const queryClient = useQueryClient();
  // 탐색기 API가 없는 네트워크는 이 기기의 기록만 보여 준다.
  const historySupported =
    transactionHistoryService.isSupported(activeNetworkChainId);
  const swapHistory = useSwapStore(state => state.history);
  const chainSwaps = useMemo(
    () => swapHistory.filter(item => item.chainId === activeNetworkChainId),
    [swapHistory, activeNetworkChainId],
  );

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
    enabled: !!address && historySupported,
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
      ).map(entry => fromCacheEntry(entry, address)),
    enabled: !!address,
    refetchInterval: 5000,
  });

  // 이 기기의 기록 (로컬 거래는 항상, 오프라인/오류/미지원 네트워크에서는 전체)
  const {
    transactions: cachedEntries,
    isLoading: isCacheLoading,
    refetch: refetchCache,
    loadMore: loadMoreCache,
  } = useTransactions(address, { chainId: activeNetworkChainId, limit: 50 });

  // 여러 페이지의 원시 응답을 모아 다시 합친다 (뒤 페이지의 토큰 전송으로 분류 보정).
  const apiTransactions = useMemo(
    () =>
      historyQuery.data
        ? transactionHistoryService.combinePages(historyQuery.data.pages)
        : [],
    [historyQuery.data],
  );

  // 거래 추적기가 완료/실패/대체됨을 알리면 대기 목록, 로컬 기록, 탐색기 내역을 다시 읽는다.
  const refreshAfterTrackerEvent = useRef<() => void>(() => undefined);
  refreshAfterTrackerEvent.current = () => {
    pendingQuery.refetch();
    refetchCache?.();
    if (!address) return;
    // 서비스의 10초 캐시를 비워야 다시 읽을 때 새 응답을 받는다.
    transactionHistoryService.clearCache(address, activeNetworkChainId);
    queryClient.invalidateQueries({
      queryKey: ['transactions', address, activeNetworkChainId],
    });
  };
  useEffect(
    () =>
      transactionTracker.subscribe(event => {
        if (event.chainId === activeNetworkChainId)
          refreshAfterTrackerEvent.current();
      }),
    [activeNetworkChainId],
  );

  // 대기 목록에서 빠진 거래는 로컬 기록을 다시 읽어 확정 상태로 계속 보이게 한다.
  // 추적기를 거치지 않고 확정되는 거래(스왑 화면이 직접 기록하는 승인 거래 등)도 사라지지 않는다.
  const previousPendingHashes = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!Array.isArray(pendingQuery.data)) return;
    const next = new Set(pendingQuery.data.map(tx => lower(tx.hash)));
    const previous = previousPendingHashes.current;
    previousPendingHashes.current = next;
    if (previous && [...previous].some(hash => !next.has(hash)))
      refetchCache?.();
  }, [pendingQuery.data, refetchCache]);

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
            status:
              tx.status === 'success'
                ? 'confirmed'
                : tx.status === 'replaced'
                ? 'cancelled'
                : tx.status,
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

  const usingCacheFallback =
    historySupported && historyQuery.isError && !historyQuery.data;
  // 탐색기 내역이 없으면 저장된 전체 기록, 있으면 아직 탐색기에 없는 이 기기의 거래만 합친다.
  const showAllCached = usingCacheFallback || !historySupported;
  const cachedTransactions = useMemo(
    () =>
      (Array.isArray(cachedEntries) ? cachedEntries : [])
        .filter(entry => showAllCached || entry.isLocal)
        .map(entry => fromCacheEntry(entry, address)),
    [showAllCached, cachedEntries, address],
  );

  const transactions = useMemo(
    () =>
      mergeTransactions(
        apiTransactions,
        pendingTransactions,
        cachedTransactions,
        { swaps: chainSwaps },
      ),
    [apiTransactions, pendingTransactions, cachedTransactions, chainSwaps],
  );
  const sections = useMemo(() => groupByDay(transactions), [transactions]);

  const handleRefresh = useCallback(async () => {
    setIsPullRefreshing(true);
    try {
      if (address)
        transactionHistoryService.clearCache(address, activeNetworkChainId);
      await Promise.all([
        historySupported ? historyQuery.refetch() : undefined,
        pendingQuery.refetch(),
      ]);
      refetchCache?.();
    } finally {
      setIsPullRefreshing(false);
    }
  }, [
    address,
    activeNetworkChainId,
    historySupported,
    historyQuery,
    pendingQuery,
    refetchCache,
  ]);

  const handleEndReached = useCallback(() => {
    // 저장된 기록만 보여 주는 동안에는 이 기기의 기록을 더 읽는다.
    if (showAllCached) {
      loadMoreCache?.();
      return;
    }
    if (
      historyQuery.hasNextPage &&
      !historyQuery.isFetchingNextPage &&
      !historyQuery.isFetchNextPageError
    ) {
      historyQuery.fetchNextPage();
    }
  }, [historyQuery, loadMoreCache, showAllCached]);

  const handlePress = useCallback(
    (tx: Transaction) => {
      navigation.navigate('TransactionDetail', {
        txHash: tx.hash,
        chainId: activeNetworkChainId,
      });
    },
    [navigation, activeNetworkChainId],
  );

  const renderTransaction = ({ item }: { item: ActivityTransaction }) => {
    const colors = typeColors(theme, item);
    const label = labelOf(item);
    const amount = describeAmount(item, nativeSymbol);
    const counterparty =
      item.type === 'receive' ? item.from : item.to || item.from;
    const arrow = item.type === 'receive' ? '← ' : '→ ';
    const failed = item.status === 'failed';
    const replaced = item.status === 'replaced';
    const pending = item.status === 'pending';
    const statusSuffix = STATUS_SUFFIX[item.status];
    const pendingLabel = item.pendingReplacement
      ? PENDING_REPLACEMENT_LABELS[item.pendingReplacement]
      : '대기 중';
    const showFee =
      item.type !== 'receive' &&
      !!item.fee &&
      Number(item.fee) > 0 &&
      !pending &&
      !replaced;
    const amountText = amount ? mask(amount) : null;
    const icon =
      item.replacement?.kind === 'cancel' ? '✕' : TYPE_ICONS[item.type] ?? '•';

    return (
      <TransactionItem
        onPress={() => handlePress(item)}
        testID={`activity-tx-${item.hash}`}
        accessibilityRole="button"
        accessibilityLabel={[
          label,
          pending ? pendingLabel : statusSuffix ?? null,
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
            {icon}
          </IconText>
        </IconContainer>

        <TransactionInfo>
          <TransactionRow>
            <LabelRow>
              <TransactionLabel
                $tone={failed ? 'failed' : replaced ? 'muted' : undefined}
                numberOfLines={1}
              >
                {label}
                {statusSuffix ? ` (${statusSuffix})` : ''}
              </TransactionLabel>
              {pending ? (
                <PendingBadge testID="activity-pending-badge">
                  <PendingText>{pendingLabel}</PendingText>
                </PendingBadge>
              ) : null}
            </LabelRow>
            {amountText ? (
              <TransactionAmount
                $color={
                  failed || replaced
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
    transactions.length === 0 &&
    (historySupported
      ? historyQuery.isLoading && !historyQuery.data
      : !!isCacheLoading);
  const showFullError =
    usingCacheFallback && !historyQuery.data && transactions.length === 0;

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

        {!historySupported && transactions.length > 0 ? (
          <InfoBanner testID="activity-local-only-note">
            <InfoText>
              이 네트워크는 거래 내역 조회를 지원하지 않아 이 기기에서 보낸
              거래만 표시합니다.
            </InfoText>
          </InfoBanner>
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
                message={
                  historySupported
                    ? `${
                        activeNetwork?.name ?? '이 네트워크'
                      }에서 토큰을 보내거나 받으면 여기에 표시됩니다.`
                    : '이 네트워크는 거래 내역 조회를 지원하지 않습니다. 이 기기에서 보낸 거래가 여기에 표시됩니다.'
                }
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

const InfoBanner = styled.View`
  padding: ${({ theme }) => theme.spacing.sm}px
    ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  background-color: ${({ theme }) => theme.colors.surface};
`;

const InfoText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
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

const TransactionLabel = styled.Text<{ $tone?: 'failed' | 'muted' }>`
  color: ${({ theme, $tone }) =>
    $tone === 'failed'
      ? theme.colors.error
      : $tone === 'muted'
      ? theme.colors.textSecondary
      : theme.colors.textPrimary};
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
