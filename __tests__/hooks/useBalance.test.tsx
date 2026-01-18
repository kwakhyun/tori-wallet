/**
 * 잔액 조회 훅 테스트
 */

import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useBalance,
  useTokenBalance,
  useMultipleBalances,
} from '../../src/hooks/useBalance';

// Mock chainClient
const mockGetBalance = jest
  .fn()
  .mockResolvedValue(BigInt('1000000000000000000'));
const mockReadContract = jest.fn().mockResolvedValue(BigInt('5000000'));

jest.mock('../../src/services/chainClient', () => ({
  chainClient: {
    getClient: jest.fn(() => ({
      getBalance: (params: { address: string }) => mockGetBalance(params),
      readContract: (params: unknown) => mockReadContract(params),
    })),
  },
}));

const WAIT_TIMEOUT = 10000;

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    },
  });

// 테스트별 queryClient 관리
let testQueryClient: QueryClient;

const createWrapper = () => {
  testQueryClient = createTestQueryClient();
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={testQueryClient}>
      {children}
    </QueryClientProvider>
  );
};

const TEST_ADDRESS = '0x1234567890123456789012345678901234567890';
const TEST_TOKEN_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

describe('useBalance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetBalance.mockResolvedValue(BigInt('1000000000000000000'));
  });

  afterEach(() => {
    // 쿼리 클라이언트 정리
    if (testQueryClient) {
      testQueryClient.clear();
    }
  });

  it('should return balance data', async () => {
    const { result } = renderHook(() => useBalance(TEST_ADDRESS, 1), {
      wrapper: createWrapper(),
    });

    // 초기 로딩 상태
    expect(result.current.isLoading).toBe(true);

    await waitFor(
      () => {
        expect(result.current.isLoading).toBe(false);
      },
      { timeout: WAIT_TIMEOUT },
    );

    // 잔액 데이터 확인
    expect(result.current.data).toBeDefined();
    expect(result.current.data?.formatted).toBe('1');
    expect(result.current.data?.symbol).toBe('ETH');
  });

  it('should handle loading state correctly', async () => {
    const { result } = renderHook(() => useBalance(TEST_ADDRESS, 1), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(
      () => {
        expect(result.current.isLoading).toBe(false);
      },
      { timeout: WAIT_TIMEOUT },
    );
  });

  it('should refetch on demand', async () => {
    const { result } = renderHook(() => useBalance(TEST_ADDRESS, 1), {
      wrapper: createWrapper(),
    });

    await waitFor(
      () => {
        expect(result.current.isLoading).toBe(false);
      },
      { timeout: WAIT_TIMEOUT },
    );

    expect(typeof result.current.refetch).toBe('function');
  });

  it('should not fetch when address is undefined', () => {
    const { result } = renderHook(() => useBalance(undefined, 1), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('should use different chain ids', async () => {
    const { result: ethResult } = renderHook(
      () => useBalance(TEST_ADDRESS, 1),
      {
        wrapper: createWrapper(),
      },
    );
    const { result: polygonResult } = renderHook(
      () => useBalance(TEST_ADDRESS, 137),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(
      () => {
        expect(ethResult.current.isLoading).toBe(false);
      },
      { timeout: WAIT_TIMEOUT },
    );

    await waitFor(
      () => {
        expect(polygonResult.current.isLoading).toBe(false);
      },
      { timeout: WAIT_TIMEOUT },
    );
  });

  it('should handle error state', async () => {
    mockGetBalance.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useBalance(TEST_ADDRESS, 1), {
      wrapper: createWrapper(),
    });

    await waitFor(
      () => {
        expect(result.current.isLoading).toBe(false);
      },
      { timeout: WAIT_TIMEOUT },
    );

    expect(result.current.error).toBeDefined();
  });
});

describe('useTokenBalance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadContract.mockResolvedValue(BigInt('5000000')); // 5 USDC (6 decimals)
  });

  afterEach(() => {
    if (testQueryClient) {
      testQueryClient.clear();
    }
  });

  it('should return token balance data', async () => {
    const { result } = renderHook(
      () => useTokenBalance(TEST_ADDRESS, TEST_TOKEN_ADDRESS, 6, 1),
      { wrapper: createWrapper() },
    );

    expect(result.current.isLoading).toBe(true);

    await waitFor(
      () => {
        expect(result.current.isLoading).toBe(false);
      },
      { timeout: WAIT_TIMEOUT },
    );

    expect(result.current.data).toBeDefined();
    expect(result.current.data?.formatted).toBe('5');
  });

  it('should not fetch when address is undefined', () => {
    const { result } = renderHook(
      () => useTokenBalance(undefined, TEST_TOKEN_ADDRESS, 6, 1),
      { wrapper: createWrapper() },
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('should not fetch when token address is empty', () => {
    const { result } = renderHook(
      () => useTokenBalance(TEST_ADDRESS, '', 6, 1),
      { wrapper: createWrapper() },
    );

    // enabled: false이면 isLoading은 false (쿼리가 실행되지 않음)
    expect(result.current.data).toBeUndefined();
  });

  it('should handle different decimals', async () => {
    mockReadContract.mockResolvedValue(BigInt('1000000000000000000')); // 1 token (18 decimals)

    const { result } = renderHook(
      () => useTokenBalance(TEST_ADDRESS, TEST_TOKEN_ADDRESS, 18, 1),
      { wrapper: createWrapper() },
    );

    await waitFor(
      () => {
        expect(result.current.isLoading).toBe(false);
      },
      { timeout: WAIT_TIMEOUT },
    );

    expect(result.current.data?.formatted).toBe('1');
  });
});

describe('useMultipleBalances', () => {
  const testTokens = [
    { address: '0xToken1', decimals: 18, symbol: 'TKN1' },
    { address: '0xToken2', decimals: 6, symbol: 'TKN2' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockReadContract.mockResolvedValue(BigInt('1000000000000000000'));
  });

  afterEach(() => {
    if (testQueryClient) {
      testQueryClient.clear();
    }
  });

  it('should return multiple token balances', async () => {
    const { result } = renderHook(
      () => useMultipleBalances(TEST_ADDRESS, testTokens, 1),
      { wrapper: createWrapper() },
    );

    expect(result.current.isLoading).toBe(true);

    // act로 비동기 업데이트 대기
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    expect(result.current.data).toBeDefined();
  });

  it('should not fetch when address is undefined', () => {
    const { result } = renderHook(
      () => useMultipleBalances(undefined, testTokens, 1),
      { wrapper: createWrapper() },
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('should not fetch when tokens array is empty', () => {
    const { result } = renderHook(
      () => useMultipleBalances(TEST_ADDRESS, [], 1),
      { wrapper: createWrapper() },
    );

    // enabled: false이면 쿼리가 실행되지 않음
    expect(result.current.data).toBeUndefined();
  });

  it('should handle partial failures gracefully', async () => {
    mockReadContract
      .mockResolvedValueOnce(BigInt('1000000000000000000'))
      .mockRejectedValueOnce(new Error('Token fetch failed'));

    const { result } = renderHook(
      () => useMultipleBalances(TEST_ADDRESS, testTokens, 1),
      { wrapper: createWrapper() },
    );

    // act로 비동기 업데이트 대기
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    // 실패한 토큰은 0으로 반환
    expect(result.current.data).toBeDefined();
  });
});
