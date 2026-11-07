/**
 * ActivityScreen 테스트
 * - "NaN ETH" 수정 (formatDisplayAmount)
 * - 로컬 대기 거래 병합 + "대기 중" 배지
 * - ERC-20 전송 표시
 * - 날짜 묶음, 상세 이동, 오류 + 다시 시도
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '../test-utils';
import { usePreferencesStore } from '../../src/store/preferencesStore';
import type { Transaction } from '../../src/services/transactionHistory';

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
jest.mock('../../src/services/transactionHistory', () => ({
  transactionHistoryService: {
    getHistoryPage: (...args: unknown[]) => mockGetHistoryPage(...args),
    clearCache: jest.fn(),
  },
}));

const mockGetPending = jest.fn();
const mockSync = jest.fn();
jest.mock('../../src/realm/services', () => ({
  transactionCacheService: {
    getPendingTransactions: (...args: unknown[]) => mockGetPending(...args),
    syncTransactions: (...args: unknown[]) => mockSync(...args),
  },
}));

let mockCached: unknown[] = [];
jest.mock('../../src/realm/hooks', () => ({
  useTransactions: () => ({
    transactions: mockCached,
    isLoading: false,
    refetch: jest.fn(),
  }),
}));

import ActivityScreen, {
  mergeTransactions,
  groupByDay,
  dayLabel,
  describeAmount,
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
    mockGetPending.mockResolvedValue([]);
    mockSync.mockResolvedValue(0);
    usePreferencesStore.setState({ currency: 'USD', hideBalances: false });
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
});

describe('Activity helpers', () => {
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
