/**
 * ActivityScreen 테스트
 * - "NaN ETH" 수정 (formatDisplayAmount)
 * - 로컬 대기 거래 병합 + "대기 중" 배지
 * - ERC-20 전송 표시
 * - 날짜 묶음, 상세 이동, 오류 + 다시 시도
 */

import React from 'react';
import { act } from '@testing-library/react-native';
import { focusManager } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '../test-utils';
import { usePreferencesStore } from '../../src/store/preferencesStore';
import { useSwapStore } from '../../src/store/swapStore';
import type {
  Transaction,
  TransactionPage,
} from '../../src/services/transactionHistory';
import {
  transactionTracker,
  type TransactionStatusEvent,
} from '../../src/services/transactionTracker';
import type { TransactionCacheEntry } from '../../src/realm/schemas';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: mockNavigate,
      goBack: jest.fn(),
    }),
  };
});

const ME = '0x1234567890123456789012345678901234567890';
const OTHER = '0x0987654321098765432109876543210987654321';

jest.mock('../../src/store/walletStore', () => ({
  useWalletStore: () => ({
    wallets: [{ address: ME, name: 'Account 1' }],
    activeWalletIndex: 0,
    activeNetworkChainId: 1,
    networks: [
      { chainId: 1, name: 'Ethereum', symbol: 'ETH', isTestnet: false },
    ],
  }),
}));

const mockGetHistoryPage = jest.fn();
const mockClearCache = jest.fn();
let mockSupported = true;
jest.mock('../../src/services/transactionHistory', () => {
  const actual = jest.requireActual('../../src/services/transactionHistory');
  return {
    transactionHistoryService: {
      getHistoryPage: (...args: unknown[]) => mockGetHistoryPage(...args),
      clearCache: (...args: unknown[]) => mockClearCache(...args),
      isSupported: () => mockSupported,
      combinePages: (pages: unknown[]) =>
        actual.transactionHistoryService.combinePages(pages),
    },
  };
});

const mockGetPending = jest.fn();
const mockSync = jest.fn();
jest.mock('../../src/realm/services', () => ({
  transactionCacheService: {
    getPendingTransactions: (...args: unknown[]) => mockGetPending(...args),
    syncTransactions: (...args: unknown[]) => mockSync(...args),
  },
}));

let mockCached: unknown[] = [];
const mockRefetchCache = jest.fn();
jest.mock('../../src/realm/hooks', () => ({
  useTransactions: () => ({
    transactions: mockCached,
    isLoading: false,
    refetch: mockRefetchCache,
    loadMore: jest.fn(),
  }),
}));

import ActivityScreen, {
  mergeTransactions,
  groupByDay,
  dayLabel,
  describeAmount,
  fromCacheEntry,
  labelOf,
} from '../../src/screens/Activity/ActivityScreen';

const tx = (overrides: Partial<Transaction>): Transaction => ({
  hash: '0xaaa',
  from: ME,
  to: OTHER,
  value: '1',
  valueWei: '1000000000000000000',
  gasUsed: '21000',
  gasPrice: '1',
  fee: '0',
  timestamp: Date.now() - 60 * 60 * 1000,
  blockNumber: '1',
  isError: false,
  type: 'send',
  status: 'success',
  ...overrides,
});

const pendingEntry = {
  id: '0xpending-1',
  hash: '0xpending',
  chainId: 1,
  from: ME.toLowerCase(),
  to: OTHER.toLowerCase(),
  value: '0.5',
  valueWei: '500000000000000000',
  gasPrice: '1',
  timestamp: Math.floor(Date.now() / 1000),
  status: 'pending',
  type: 'send',
  tokenSymbol: 'ETH',
  tokenAmount: '0.5',
  isLocal: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ActivityScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCached = [];
    mockSupported = true;
    mockGetPending.mockResolvedValue([]);
    mockSync.mockResolvedValue(0);
    usePreferencesStore.setState({ currency: 'USD', hideBalances: false });
    useSwapStore.getState().resetSwapState();
  });

  it('never renders "NaN" for tiny amounts', async () => {
    mockGetHistoryPage.mockResolvedValue({
      transactions: [tx({ hash: '0xtiny', value: '< 0.000001' })],
      hasMore: false,
    });
    render(<ActivityScreen />);
    await waitFor(() => screen.getByTestId('activity-tx-0xtiny'));
    expect(screen.getByText('-< 0.000001 ETH')).toBeTruthy();
    expect(screen.queryByText(/NaN/)).toBeNull();
  });

  it('shows ERC-20 transfers with the token symbol', async () => {
    mockGetHistoryPage.mockResolvedValue({
      transactions: [
        tx({
          hash: '0xusdc',
          type: 'receive',
          from: OTHER,
          to: ME,
          value: '2.5',
          tokenSymbol: 'USDC',
          tokenDecimals: 6,
        }),
      ],
      hasMore: false,
    });
    render(<ActivityScreen />);
    await waitFor(() => screen.getByText('+2.5 USDC'));
    expect(screen.getByText('받음')).toBeTruthy();
  });

  it('labels swaps and approvals instead of forcing send/receive', async () => {
    mockGetHistoryPage.mockResolvedValue({
      transactions: [
        tx({
          hash: '0xswap',
          type: 'swap',
          value: '100',
          tokenSymbol: 'USDC',
          receivedValue: '0.05',
          receivedSymbol: 'WETH',
        }),
        tx({ hash: '0xapprove', type: 'approve', value: '0' }),
      ],
      hasMore: false,
    });
    render(<ActivityScreen />);
    await waitFor(() => screen.getByText('스왑'));
    expect(screen.getByText('100 USDC → 0.05 WETH')).toBeTruthy();
    expect(screen.getByText('토큰 사용 승인')).toBeTruthy();
  });

  it('merges locally submitted pending transactions with a "대기 중" badge', async () => {
    mockGetHistoryPage.mockResolvedValue({
      transactions: [tx({ hash: '0xconfirmed' })],
      hasMore: false,
    });
    mockGetPending.mockResolvedValue([pendingEntry]);
    render(<ActivityScreen />);
    await waitFor(() => screen.getByTestId('activity-tx-0xpending'));
    expect(screen.getByTestId('activity-tx-0xconfirmed')).toBeTruthy();
    expect(screen.getByTestId('activity-pending-badge')).toBeTruthy();
    expect(screen.getByText('-0.5 ETH')).toBeTruthy();
  });

  it('groups transactions under date headers', async () => {
    mockGetHistoryPage.mockResolvedValue({
      transactions: [
        tx({ hash: '0xtoday', timestamp: Date.now() - 1000 }),
        tx({ hash: '0xyesterday', timestamp: Date.now() - 86400000 - 1000 }),
      ],
      hasMore: false,
    });
    render(<ActivityScreen />);
    await waitFor(() => screen.getByText('오늘'));
    expect(screen.getByText('어제')).toBeTruthy();
  });

  it('opens TransactionDetail with the hash and chain id', async () => {
    mockGetHistoryPage.mockResolvedValue({
      transactions: [tx({ hash: '0xdetail' })],
      hasMore: false,
    });
    render(<ActivityScreen />);
    await waitFor(() => screen.getByTestId('activity-tx-0xdetail'));
    fireEvent.press(screen.getByTestId('activity-tx-0xdetail'));
    expect(mockNavigate).toHaveBeenCalledWith('TransactionDetail', {
      txHash: '0xdetail',
      chainId: 1,
    });
  });

  it('shows an error with retry when history cannot be loaded', async () => {
    mockGetHistoryPage.mockRejectedValueOnce(new Error('offline'));
    render(<ActivityScreen />);
    await waitFor(() => screen.getByTestId('activity-error'));

    mockGetHistoryPage.mockResolvedValue({
      transactions: [tx({ hash: '0xafter-retry' })],
      hasMore: false,
    });
    fireEvent.press(screen.getByTestId('activity-error-retry'));
    await waitFor(() => screen.getByTestId('activity-tx-0xafter-retry'));
  });

  it('falls back to cached history with a stale banner when offline', async () => {
    mockGetHistoryPage.mockRejectedValue(new Error('offline'));
    mockCached = [
      {
        ...pendingEntry,
        id: '0xcached-1',
        hash: '0xcached',
        status: 'confirmed',
        isLocal: false,
      },
    ];
    render(<ActivityScreen />);
    await waitFor(() => screen.getByTestId('activity-stale-banner'));
    expect(screen.getByTestId('activity-tx-0xcached')).toBeTruthy();
  });

  it('requests the next page when scrolled to the end', async () => {
    mockGetHistoryPage
      .mockResolvedValueOnce({
        transactions: [tx({ hash: '0xp1' })],
        hasMore: true,
      })
      .mockResolvedValueOnce({
        transactions: [tx({ hash: '0xp2', timestamp: Date.now() - 7200000 })],
        hasMore: false,
      });
    render(<ActivityScreen />);
    await waitFor(() => screen.getByTestId('activity-tx-0xp1'));
    screen.getByTestId('activity-list').props.onEndReached();
    await waitFor(() => screen.getByTestId('activity-tx-0xp2'));
    expect(mockGetHistoryPage).toHaveBeenLastCalledWith(ME, 1, 2, 20);
  });

  it('shows an empty state when there is no history', async () => {
    mockGetHistoryPage.mockResolvedValue({ transactions: [], hasMore: false });
    render(<ActivityScreen />);
    await waitFor(() => screen.getByText('거래 내역이 없습니다'));
  });

  describe('local transactions and tracker events', () => {
    let emit: (event: TransactionStatusEvent) => void;
    let subscribe: jest.SpyInstance;

    beforeEach(() => {
      subscribe = jest
        .spyOn(transactionTracker, 'subscribe')
        .mockImplementation(listener => {
          emit = listener;
          return jest.fn();
        });
    });

    afterEach(() => subscribe.mockRestore());

    it('keeps a confirmed local transaction visible while the explorer has not indexed it', async () => {
      // 탐색기 색인 지연: API에는 아직 없다.
      mockGetHistoryPage.mockResolvedValue({
        transactions: [],
        hasMore: false,
      });
      mockGetPending.mockResolvedValue([pendingEntry]);
      mockCached = [pendingEntry];
      render(<ActivityScreen />);
      await waitFor(() => screen.getByTestId('activity-pending-badge'));
      expect(mockGetHistoryPage).toHaveBeenCalledTimes(1);

      // 추적기가 완료를 기록했다.
      mockGetPending.mockResolvedValue([]);
      mockCached = [{ ...pendingEntry, status: 'confirmed' }];
      await act(async () => {
        emit({ hash: '0xpending', chainId: 1, status: 'confirmed' });
      });

      await waitFor(() =>
        expect(screen.queryByTestId('activity-pending-badge')).toBeNull(),
      );
      expect(screen.getByTestId('activity-tx-0xpending')).toBeTruthy();
      expect(screen.getByText('-0.5 ETH')).toBeTruthy();
      expect(screen.queryByText('거래 내역이 없습니다')).toBeNull();
      // 로컬 기록과 탐색기 내역(서비스 캐시 포함)을 다시 읽는다.
      expect(mockRefetchCache).toHaveBeenCalled();
      expect(mockClearCache).toHaveBeenCalledWith(ME, 1);
      await waitFor(() => expect(mockGetHistoryPage).toHaveBeenCalledTimes(2));
    });

    it('re-reads local records when a transaction leaves the pending list without a tracker event', async () => {
      // 스왑 화면이 승인 거래 영수증을 직접 기다려 Realm에 확정을 기록하는 경우:
      // 추적기 이벤트가 없어도 대기 목록에서 빠진 거래를 로컬 기록으로 계속 보여야 한다.
      mockGetHistoryPage.mockResolvedValue({
        transactions: [],
        hasMore: false,
      });
      mockGetPending.mockResolvedValue([pendingEntry]);
      render(<ActivityScreen />);
      await waitFor(() => screen.getByTestId('activity-pending-badge'));
      mockRefetchCache.mockClear();

      mockGetPending.mockResolvedValue([]);
      mockCached = [{ ...pendingEntry, status: 'confirmed' }];
      // 대기 목록 쿼리만 다시 읽힌다 (포커스 복귀 → staleTime 0인 대기 목록만 재조회).
      act(() => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      });

      await waitFor(() => expect(mockRefetchCache).toHaveBeenCalled());
      expect(screen.queryByTestId('activity-pending-badge')).toBeNull();
      expect(screen.getByTestId('activity-tx-0xpending')).toBeTruthy();
      expect(mockClearCache).not.toHaveBeenCalled();
      act(() => {
        focusManager.setFocused(undefined);
      });
    });

    it('loads a newly pending transaction into the local records before it confirms', async () => {
      mockGetHistoryPage.mockResolvedValue({
        transactions: [],
        hasMore: false,
      });
      render(<ActivityScreen />);
      await waitFor(() => screen.getByText('거래 내역이 없습니다'));
      mockRefetchCache.mockClear();

      mockGetPending.mockResolvedValue([pendingEntry]);
      act(() => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      });
      await waitFor(() => screen.getByTestId('activity-pending-badge'));
      // 확정되어 대기 목록에서 빠질 때 로컬 기록에 이미 있어 행이 깜박이지 않는다.
      await waitFor(() => expect(mockRefetchCache).toHaveBeenCalled());
      act(() => {
        focusManager.setFocused(undefined);
      });
    });

    it('ignores tracker events for other networks', async () => {
      mockGetHistoryPage.mockResolvedValue({
        transactions: [],
        hasMore: false,
      });
      render(<ActivityScreen />);
      await waitFor(() => screen.getByText('거래 내역이 없습니다'));
      await act(async () => {
        emit({ hash: '0xother', chainId: 137, status: 'confirmed' });
      });
      expect(mockClearCache).not.toHaveBeenCalled();
      expect(mockGetHistoryPage).toHaveBeenCalledTimes(1);
    });

    it('lists this device’s transactions on networks without an explorer API', async () => {
      mockSupported = false;
      mockCached = [{ ...pendingEntry, hash: '0xlocal', status: 'confirmed' }];
      render(<ActivityScreen />);
      await waitFor(() => screen.getByTestId('activity-tx-0xlocal'));
      expect(screen.getByTestId('activity-local-only-note')).toBeTruthy();
      expect(mockGetHistoryPage).not.toHaveBeenCalled();
    });

    it('explains the empty state on networks without an explorer API', async () => {
      mockSupported = false;
      render(<ActivityScreen />);
      await waitFor(() =>
        screen.getByText(/거래 내역 조회를 지원하지 않습니다/),
      );
    });

    it('does not show synced explorer rows from the cache while the API works', async () => {
      mockGetHistoryPage.mockResolvedValue({
        transactions: [tx({ hash: '0xapi' })],
        hasMore: false,
      });
      mockCached = [
        {
          ...pendingEntry,
          hash: '0xsynced',
          status: 'confirmed',
          isLocal: false,
        },
      ];
      render(<ActivityScreen />);
      await waitFor(() => screen.getByTestId('activity-tx-0xapi'));
      expect(screen.queryByTestId('activity-tx-0xsynced')).toBeNull();
    });
  });

  it('shows a pending transfer from another own account as 받음 on the receiving account', async () => {
    mockGetHistoryPage.mockResolvedValue({ transactions: [], hasMore: false });
    mockGetPending.mockResolvedValue([
      {
        ...pendingEntry,
        hash: '0xincoming',
        from: OTHER.toLowerCase(),
        to: ME.toLowerCase(),
      },
    ]);
    render(<ActivityScreen />);
    await waitFor(() => screen.getByTestId('activity-tx-0xincoming'));
    expect(screen.getByText('받음')).toBeTruthy();
    expect(screen.getByText('+0.5 ETH')).toBeTruthy();
    expect(screen.queryByText('보냄')).toBeNull();
  });

  it('shows a replaced transaction as 대체됨 rather than failed, and a cancel without an amount', async () => {
    const original = `0x${'a'.repeat(64)}`;
    const cancel = `0x${'c'.repeat(64)}`;
    mockGetHistoryPage.mockRejectedValue(new Error('offline'));
    mockCached = [
      { ...pendingEntry, hash: original, status: 'cancelled' },
      {
        ...pendingEntry,
        hash: cancel,
        to: ME.toLowerCase(),
        tokenAmount: '0',
        status: 'confirmed',
        method: `replacement:cancel:${original}`,
      },
    ];
    render(<ActivityScreen />);
    await waitFor(() => screen.getByTestId(`activity-tx-${original}`));
    expect(screen.getByText('보냄 (대체됨)')).toBeTruthy();
    expect(screen.queryByText(/실패/)).toBeNull();
    expect(screen.getByText('취소 시도')).toBeTruthy();
    expect(screen.queryByText('-0 ETH')).toBeNull();
  });

  it('shows a pending speed-up as one row with a 가속 중 badge', async () => {
    const original = `0x${'a'.repeat(64)}`;
    const speedUp = `0x${'b'.repeat(64)}`;
    mockGetHistoryPage.mockResolvedValue({ transactions: [], hasMore: false });
    mockGetPending.mockResolvedValue([
      { ...pendingEntry, hash: original },
      {
        ...pendingEntry,
        hash: speedUp,
        timestamp: pendingEntry.timestamp + 60,
        method: `replacement:speedUp:${original}`,
      },
    ]);
    render(<ActivityScreen />);
    await waitFor(() => screen.getByTestId(`activity-tx-${original}`));
    expect(screen.queryByTestId(`activity-tx-${speedUp}`)).toBeNull();
    expect(screen.getAllByText('-0.5 ETH')).toHaveLength(1);
    expect(screen.getByText('가속 중')).toBeTruthy();
  });

  it('labels a token-to-native swap from swap history as 스왑', async () => {
    useSwapStore.getState().addHistoryItem({
      chainId: 1,
      timestamp: Date.now(),
      sellToken: { address: '0xusdc', symbol: 'USDC', amount: '100' },
      buyToken: { address: '0xeee', symbol: 'ETH', amount: '0.03' },
      txHash: '0xSWAP',
      status: 'success',
      rate: '0.0003',
    });
    mockGetHistoryPage.mockResolvedValue({
      transactions: [
        tx({ hash: '0xswap', value: '100', tokenSymbol: 'USDC', type: 'send' }),
      ],
      hasMore: false,
    });
    render(<ActivityScreen />);
    await waitFor(() => screen.getByTestId('activity-tx-0xswap'));
    expect(screen.getByText('스왑')).toBeTruthy();
    expect(screen.getByText('100 USDC → 0.03 ETH')).toBeTruthy();
    expect(screen.queryByText('보냄')).toBeNull();
  });

  it('re-labels a swap whose transfers arrive on a later page', async () => {
    const swapRow = {
      hash: '0xswap',
      from: ME,
      to: OTHER,
      value: '0',
      gasUsed: '1',
      gasPrice: '1',
      timeStamp: '1600000000',
      blockNumber: '1',
      isError: '0',
      input: '0x12345678',
    };
    const leg = (from: string, to: string, value: string, symbol: string) => ({
      hash: '0xswap',
      from,
      to,
      value,
      contractAddress: `0x${symbol}`,
      tokenSymbol: symbol,
      tokenDecimal: '0',
      timeStamp: '1600000000',
      blockNumber: '1',
    });
    const page = (raw: TransactionPage['raw'], hasMore: boolean) => ({
      transactions: [],
      hasMore,
      raw,
    });
    mockGetHistoryPage
      .mockResolvedValueOnce(
        page({ address: ME, txs: [swapRow], tokenTxs: [] }, true),
      )
      .mockResolvedValueOnce(
        page(
          {
            address: ME,
            txs: [],
            tokenTxs: [
              leg(ME, OTHER, '100', 'USDC'),
              leg(OTHER, ME, '5', 'WETH'),
            ],
          },
          false,
        ),
      );
    render(<ActivityScreen />);
    await waitFor(() => screen.getByText('컨트랙트 실행'));
    await act(async () => {
      screen.getByTestId('activity-list').props.onEndReached();
    });
    await waitFor(() => screen.getByText('스왑'));
    expect(screen.getByText('100 USDC → 5 WETH')).toBeTruthy();
    expect(screen.queryByText('컨트랙트 실행')).toBeNull();
  });
});

describe('Activity helpers', () => {
  const entry = (
    overrides: Partial<TransactionCacheEntry>,
  ): TransactionCacheEntry =>
    ({
      ...pendingEntry,
      ...overrides,
    } as TransactionCacheEntry);

  it('fromCacheEntry maps replaced records and replacement links', () => {
    const original = `0x${'a'.repeat(64)}`;
    expect(fromCacheEntry(entry({ status: 'cancelled' })).status).toBe(
      'replaced',
    );
    expect(fromCacheEntry(entry({ status: 'failed' })).status).toBe('failed');
    const cancel = fromCacheEntry(
      entry({
        to: ME.toLowerCase(),
        tokenAmount: '0',
        method: `replacement:cancel:${original}`,
      }),
      ME,
    );
    expect(cancel.replacement).toEqual({
      kind: 'cancel',
      originalHash: original,
    });
    expect(labelOf(cancel)).toBe('취소 시도');
    expect(describeAmount(cancel, 'ETH')).toBeNull();
    const speedUp = fromCacheEntry(
      entry({ method: `replacement:speedUp:${original}` }),
    );
    expect(labelOf(speedUp)).toBe('가속 거래');
    expect(describeAmount(speedUp, 'ETH')).toBe('-0.5 ETH');
  });

  it('fromCacheEntry re-derives direction for the viewing account', () => {
    const transfer = entry({
      from: OTHER.toLowerCase(),
      to: ME.toLowerCase(),
      type: 'send',
    });
    expect(fromCacheEntry(transfer, ME).type).toBe('receive');
    expect(fromCacheEntry(transfer, OTHER).type).toBe('send');
    expect(fromCacheEntry(transfer).type).toBe('send');
    const self = entry({ from: ME.toLowerCase(), to: ME.toLowerCase() });
    expect(fromCacheEntry(self, ME).type).toBe('send');
    const received = entry({
      from: ME.toLowerCase(),
      to: OTHER.toLowerCase(),
      type: 'receive',
    });
    expect(fromCacheEntry(received, ME).type).toBe('send');
  });

  it('mergeTransactions collapses pending replacements and keeps lost ones visible', () => {
    const original = `0x${'a'.repeat(64)}`;
    const cancel = `0x${'c'.repeat(64)}`;
    const replacement = { kind: 'cancel' as const, originalHash: original };
    const merged = mergeTransactions(
      [],
      [
        tx({ hash: original, status: 'pending', timestamp: 1 }),
        tx({ hash: cancel, status: 'pending', timestamp: 2, replacement }),
      ],
    );
    expect(merged).toEqual([
      expect.objectContaining({ hash: original, pendingReplacement: 'cancel' }),
    ]);

    // 원래 거래가 대체된 뒤에는 둘 다 보이고, 원래 거래는 '대체됨'이다.
    const settled = mergeTransactions(
      [],
      [],
      [
        tx({ hash: original, status: 'replaced', timestamp: 1 }),
        tx({ hash: cancel, status: 'success', timestamp: 2, replacement }),
      ],
    );
    expect(settled.map(t => [t.hash, t.status])).toEqual([
      [cancel, 'success'],
      [original, 'replaced'],
    ]);
    expect(settled[0].pendingReplacement).toBeUndefined();
  });

  it('mergeTransactions keeps the replacement label when the explorer lists the tx', () => {
    const original = `0x${'a'.repeat(64)}`;
    const speedUp = `0x${'b'.repeat(64)}`;
    const [merged] = mergeTransactions(
      [tx({ hash: speedUp, status: 'success' })],
      [],
      [
        tx({
          hash: speedUp,
          status: 'pending',
          replacement: { kind: 'speedUp', originalHash: original },
        }),
      ],
    );
    expect(merged.status).toBe('success');
    expect(labelOf(merged)).toBe('가속 거래');
  });

  it('mergeTransactions treats a local swap record as a swap', () => {
    const [merged] = mergeTransactions(
      [tx({ hash: '0xs', type: 'send', value: '100', tokenSymbol: 'USDC' })],
      [],
      [tx({ hash: '0xs', type: 'swap', value: '100', tokenSymbol: 'USDC' })],
    );
    expect(merged).toMatchObject({
      type: 'swap',
      value: '100',
      tokenSymbol: 'USDC',
    });
  });

  it('mergeTransactions prefers API data and keeps unseen pending on top', () => {
    const merged = mergeTransactions(
      [tx({ hash: '0xAAA', status: 'success', timestamp: 2 })],
      [
        tx({ hash: '0xaaa', status: 'pending', timestamp: 3 }),
        tx({ hash: '0xbbb', status: 'pending', timestamp: 1 }),
      ],
    );
    expect(merged.map(t => t.hash)).toEqual(['0xbbb', '0xAAA']);
    expect(merged[1].status).toBe('success');
  });

  it('dayLabel / groupByDay use 오늘, 어제 and dates', () => {
    const now = new Date(2026, 10, 7, 12, 0, 0);
    expect(dayLabel(now.getTime(), now)).toBe('오늘');
    expect(dayLabel(new Date(2026, 10, 6, 23).getTime(), now)).toBe('어제');
    expect(dayLabel(new Date(2026, 9, 1).getTime(), now)).toBe('10월 1일');
    expect(dayLabel(new Date(2025, 0, 2).getTime(), now)).toBe(
      '2025년 1월 2일',
    );
    const sections = groupByDay(
      [
        tx({ hash: '1', timestamp: now.getTime() }),
        tx({ hash: '2', timestamp: now.getTime() - 1000 }),
        tx({ hash: '3', timestamp: new Date(2026, 10, 6).getTime() }),
      ],
      now,
    );
    expect(sections.map(s => [s.title, s.data.length])).toEqual([
      ['오늘', 2],
      ['어제', 1],
    ]);
  });

  it('describeAmount formats every type without NaN', () => {
    expect(describeAmount(tx({ value: '< 0.000001' }), 'ETH')).toBe(
      '-< 0.000001 ETH',
    );
    expect(describeAmount(tx({ value: 'garbage' }), 'ETH')).toBe('-— ETH');
    expect(
      describeAmount(tx({ type: 'receive', value: '1234.56789' }), 'ETH'),
    ).toBe('+1,234.5679 ETH');
    expect(describeAmount(tx({ type: 'approve', value: '0' }), 'ETH')).toBe(
      null,
    );
  });
});
