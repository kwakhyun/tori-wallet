/**
 * SwapScreen 테스트
 *
 * 실제 swapService/enhancedSwapService 검증 파이프라인을 사용하고, 0x/CoinGecko
 * 응답만 fetch 목으로 대신한다.
 */

import React from 'react';
import { Linking } from 'react-native';
import { act, fireEvent } from '@testing-library/react-native';
import { render } from '../test-utils';
import { useSwapStore } from '../../src/store/swapStore';
import { signingService } from '../../src/services/signingService';
import { chainClient } from '../../src/services/chainClient';
import SwapScreen from '../../src/screens/Swap/SwapScreen';

const NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const USDC = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const ALLOWANCE_HOLDER = '0x0000000000001fF3684f28c67538d4D072C22734';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: mockNavigate,
      goBack: jest.fn(),
      canGoBack: () => true,
    }),
  };
});

jest.mock('../../src/store/walletStore', () => ({
  useWalletStore: () => ({
    wallets: [
      {
        address: '0x1234567890123456789012345678901234567890',
        name: 'Account 1',
        isHD: true,
      },
    ],
    activeWalletIndex: 0,
    activeNetworkChainId: 137,
    networks: [
      {
        chainId: 137,
        name: 'Polygon',
        symbol: 'MATIC',
        isTestnet: false,
        blockExplorerUrl: 'https://polygonscan.com',
      },
    ],
  }),
}));

const mockRequiresPin = jest.fn();
jest.mock('../../src/store/securityStore', () => ({
  useSecurityStore: () => ({ requiresTransactionPin: mockRequiresPin }),
}));

jest.mock('../../src/hooks/useBalance', () => ({
  useBalance: () => ({
    data: {
      wei: 10_000_000_000_000_000_000n,
      formatted: '10',
      symbol: 'MATIC',
    },
  }),
  useTokenBalance: (address?: string) => ({
    data: address
      ? { wei: 123_456_789n, formatted: '123.456789', symbol: '' }
      : undefined,
  }),
  useMultipleBalances: () => ({
    data: [
      {
        tokenAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        wei: 123_456_789n,
        formatted: '123.456789',
        symbol: 'USDC',
      },
    ],
  }),
}));

jest.mock('../../src/hooks/useFiat', () => ({
  useFiat: () => ({
    formatFiat: (value: number | null | undefined) =>
      value === null || value === undefined ? '—' : `$${value.toFixed(2)}`,
  }),
}));

jest.mock('../../src/services/signingService', () => ({
  signingService: { sendTransaction: jest.fn() },
}));

jest.mock('../../src/services/transactionTracker', () => ({
  transactionTracker: { reconcile: jest.fn() },
}));

jest.mock('../../src/services/chainClient', () => ({
  chainClient: { getClient: jest.fn(), getGasPrice: jest.fn() },
}));

let mockReviewProps: any;
jest.mock('../../src/components/swap', () => ({
  SwapReviewModal: (props: any) => {
    mockReviewProps = props;
    return null;
  },
  SwapSettingsModal: () => null,
}));

let mockPinProps: any;
jest.mock('../../src/components/common/PinConfirmModal', () => (props: any) => {
  mockPinProps = props;
  return null;
});

// ── 0x / CoinGecko 응답 ──────────────────────────────────────────
let priceResponse: { status: number; body: object };
let quoteCount = 0;
const fetchMock = jest.fn();

function param(url: string, name: string): string {
  return decodeURIComponent(new RegExp(`${name}=([^&]+)`).exec(url)?.[1] ?? '');
}

function buildQuote(url: string) {
  quoteCount += 1;
  const sellToken = param(url, 'sellToken');
  const buyToken = param(url, 'buyToken');
  const sellAmount = param(url, 'sellAmount');
  const isNativeSell = sellToken.toLowerCase() === NATIVE.toLowerCase();
  // 100 USDC($1) ↔ 200 MATIC($0.5) — 가격 영향 0%
  const buyAmount =
    buyToken.toLowerCase() === USDC.toLowerCase()
      ? '50000000'
      : '200000000000000000000';
  return {
    allowanceTarget: ALLOWANCE_HOLDER,
    buyAmount,
    buyToken,
    sellAmount,
    sellToken,
    minBuyAmount: buyAmount,
    liquidityAvailable: true,
    issues: {
      allowance: null,
      balance: null,
      simulationIncomplete: false,
      invalidSourcesPassed: [],
    },
    route: { fills: [] },
    transaction: {
      to: isNativeSell
        ? '0xdef1c0ded9bec7f1a1670819833240f027b25eff'
        : ALLOWANCE_HOLDER,
      data: `0x123456${quoteCount.toString(16).padStart(2, '0')}`,
      gas: '200000',
      gasPrice: '100000000000',
      value: isNativeSell ? sellAmount : '0',
    },
  };
}

function respond(status: number, body: unknown) {
  return { ok: status < 400, status, json: async () => body };
}

fetchMock.mockImplementation(async (url: string) => {
  if (url.includes('/swap/allowance-holder/price'))
    return respond(priceResponse.status, priceResponse.body);
  if (url.includes('/swap/allowance-holder/quote'))
    return respond(200, buildQuote(url));
  if (url.includes('/simple/token_price/'))
    return respond(200, { [USDC.toLowerCase()]: { usd: 1 } });
  if (url.includes('/simple/price'))
    return respond(200, { 'matic-network': { usd: 0.5 } });
  if (url.includes('exchange_rates')) return respond(500, {});
  throw new Error(`unexpected fetch ${url}`);
});

const readContract = jest.fn();
const waitForTransactionReceipt = jest.fn();
const estimateGas = jest.fn();
const estimateFeesPerGas = jest.fn();

const initialSwapState = useSwapStore.getState();

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  global.fetch = fetchMock as unknown as typeof fetch;
  useSwapStore.setState(initialSwapState, true);
  quoteCount = 0;
  mockReviewProps = undefined;
  mockPinProps = undefined;
  mockRequiresPin.mockReturnValue(false);
  priceResponse = {
    status: 200,
    body: { price: '2', buyAmount: '50000000', liquidityAvailable: true },
  };
  readContract.mockResolvedValue(0n);
  waitForTransactionReceipt.mockResolvedValue({
    status: 'success',
    blockNumber: 1n,
    gasUsed: 1n,
  });
  estimateGas.mockResolvedValue(150_000n);
  estimateFeesPerGas.mockResolvedValue({
    maxFeePerGas: 100_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
  });
  (chainClient.getClient as jest.Mock).mockReturnValue({
    readContract,
    waitForTransactionReceipt,
    estimateGas,
    estimateFeesPerGas,
  });
  (signingService.sendTransaction as jest.Mock)
    .mockResolvedValueOnce(`0x${'aa'.repeat(32)}`)
    .mockResolvedValueOnce(`0x${'bb'.repeat(32)}`);
});

afterEach(() => {
  jest.useRealTimers();
});

async function flush(ms = 600) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

async function enterAmount(view: ReturnType<typeof render>, amount: string) {
  fireEvent.changeText(view.getByTestId('swap-sell-amount-input'), amount);
  await flush();
}

async function sellUsdc(view: ReturnType<typeof render>) {
  fireEvent.press(view.getByTestId('swap-sell-token-button'));
  fireEvent.press(view.getByTestId('swap-token-picker-item-USDC'));
}

it('shows the selected ERC-20 balance, not the native balance', async () => {
  const view = render(<SwapScreen />);
  expect(view.getByTestId('swap-sell-balance')).toHaveTextContent(
    '잔액: 10 MATIC',
  );
  await sellUsdc(view);
  expect(view.getByTestId('swap-sell-balance')).toHaveTextContent(
    '잔액: 123.4568 USDC',
  );
});

it('shows a specific, retryable error when the price cannot be fetched', async () => {
  priceResponse = { status: 400, body: { name: 'INSUFFICIENT_LIQUIDITY' } };
  const view = render(<SwapScreen />);
  await enterAmount(view, '1');

  expect(view.getByTestId('swap-price-error')).toHaveTextContent(
    /유동성이 없습니다/,
  );
  expect(view.getByTestId('swap-review-button')).toBeDisabled();
  expect(view.getAllByText('견적을 가져올 수 없습니다').length).toBe(2);
  expect(view.queryByText('견적 조회 중...')).toBeNull();

  priceResponse = {
    status: 200,
    body: { price: '2', buyAmount: '50000000', liquidityAvailable: true },
  };
  fireEvent.press(view.getByTestId('swap-price-error-retry'));
  await flush(10);
  expect(view.queryByTestId('swap-price-error')).toBeNull();
  expect(view.getByTestId('swap-review-button')).toBeEnabled();
  expect(view.getByText('스왑 검토하기')).toBeTruthy();
});

it('blocks the swap when the balance is insufficient', async () => {
  const view = render(<SwapScreen />);
  await enterAmount(view, '11');
  expect(view.getByText('MATIC 잔액이 부족합니다')).toBeTruthy();
  expect(view.getByTestId('swap-review-button')).toBeDisabled();
});

it('shows a distinct state when the swap service is not configured', () => {
  const globals = global as unknown as { __DEV__: boolean };
  const previous = globals.__DEV__;
  globals.__DEV__ = false;
  try {
    const view = render(<SwapScreen />);
    expect(view.getByTestId('swap-not-configured')).toBeTruthy();
    expect(view.getByText('스왑 서비스가 설정되지 않았습니다')).toBeTruthy();
    expect(view.queryByText('스왑 미지원 네트워크')).toBeNull();
  } finally {
    globals.__DEV__ = previous;
  }
});

it('uses the persisted swapStore slippage for the quote', async () => {
  useSwapStore.setState({
    settings: { autoSlippage: false, defaultSlippage: 3 },
  });
  const view = render(<SwapScreen />);
  expect(view.getByTestId('swap-slippage-value')).toHaveTextContent('3% ›');

  await enterAmount(view, '1');
  fireEvent.press(view.getByTestId('swap-review-button'));
  await flush(10);

  const quoteUrl = fetchMock.mock.calls
    .map(([url]) => url as string)
    .find(url => url.includes('/quote'));
  expect(quoteUrl).toContain('slippageBps=300');
  expect(mockReviewProps.slippage).toBe(3);
});

it('requires re-review with a fresh quote when the approval outlasts the quote', async () => {
  const view = render(<SwapScreen />);
  await sellUsdc(view);
  await enterAmount(view, '100');

  fireEvent.press(view.getByTestId('swap-review-button'));
  await flush(10);
  expect(mockReviewProps.visible).toBe(true);
  expect(mockReviewProps.approval).toEqual({
    tokenSymbol: 'USDC',
    tokenAddress: USDC,
    amount: '100',
    spender: ALLOWANCE_HOLDER,
  });
  const firstQuote = mockReviewProps.quote;

  // 승인 확정을 기다리는 동안 90초 견적이 만료된다.
  waitForTransactionReceipt.mockImplementationOnce(async () => {
    jest.setSystemTime(Date.now() + 100_000);
    readContract.mockResolvedValue(100_000_000n);
    return { status: 'success', blockNumber: 1n, gasUsed: 1n };
  });
  await act(async () => {
    mockReviewProps.onConfirm();
  });
  await flush(10);

  // 승인 트랜잭션만 전송: 정확한 수량, AllowanceHolder 대상
  expect(signingService.sendTransaction).toHaveBeenCalledTimes(1);
  const [approveTx] = (signingService.sendTransaction as jest.Mock).mock
    .calls[0];
  expect(approveTx.to).toBe(USDC);
  expect(approveTx.data.toLowerCase()).toContain(
    ALLOWANCE_HOLDER.slice(2).toLowerCase(),
  );
  expect(approveTx.data).toContain((100_000_000).toString(16));

  // 새 견적으로 다시 검토 (스왑은 아직 보내지 않음)
  expect(mockReviewProps.visible).toBe(true);
  expect(mockReviewProps.quote).not.toBe(firstQuote);
  expect(mockReviewProps.quote.data).not.toBe(firstQuote.data);
  expect(mockReviewProps.notice).toMatch(/견적이 만료되어 새 견적/);
  expect(mockReviewProps.approval).toBeNull();
  const secondQuote = mockReviewProps.quote;

  await act(async () => {
    mockReviewProps.onConfirm();
  });
  await flush(10);
  expect(signingService.sendTransaction).toHaveBeenCalledTimes(2);
  const [swapTx] = (signingService.sendTransaction as jest.Mock).mock.calls[1];
  expect(swapTx.to).toBe(ALLOWANCE_HOLDER);
  expect(swapTx.data).toBe(secondQuote.data);
  expect(swapTx.data).not.toBe(firstQuote.data);
  expect(view.getByTestId('swap-submitted')).toBeTruthy();
});

it('passes the USD value of the swap to the PIN policy', async () => {
  mockRequiresPin.mockReturnValue(true);
  const view = render(<SwapScreen />);
  await enterAmount(view, '5');
  fireEvent.press(view.getByTestId('swap-review-button'));
  await flush(10);

  await act(async () => {
    mockReviewProps.onConfirm();
  });
  // 5 MATIC × $0.5
  expect(mockRequiresPin).toHaveBeenCalledWith(2.5);
  expect(mockPinProps.visible).toBe(true);
  expect(signingService.sendTransaction).not.toHaveBeenCalled();
});

it('shows the submitted view with explorer link, hash copy and detail', async () => {
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  const view = render(<SwapScreen />);
  await enterAmount(view, '5');
  fireEvent.press(view.getByTestId('swap-review-button'));
  await flush(10);
  await act(async () => {
    mockReviewProps.onConfirm();
  });
  await flush(10);

  const hash = `0x${'aa'.repeat(32)}`;
  expect(view.getByTestId('swap-submitted-hash')).toHaveTextContent(hash);
  fireEvent.press(view.getByTestId('swap-submitted-explorer'));
  expect(openURL).toHaveBeenCalledWith(`https://polygonscan.com/tx/${hash}`);
  fireEvent.press(view.getByTestId('swap-submitted-detail'));
  expect(mockNavigate).toHaveBeenCalledWith('TransactionDetail', {
    txHash: hash,
    chainId: 137,
  });
  expect(useSwapStore.getState().history[0]).toMatchObject({
    txHash: hash,
    chainId: 137,
    status: 'pending',
  });
  openURL.mockRestore();
});

it('keeps a bigint gas reserve for native MAX', async () => {
  const view = render(<SwapScreen />);
  fireEvent.press(view.getByTestId('swap-max-button'));
  await flush(10);
  // 10 MATIC − 300,000 gas × 100 gwei × 120% = 10 − 0.036
  expect(view.getByTestId('swap-sell-amount-input').props.value).toBe('9.964');
});

it('labels icon-only buttons for screen readers', () => {
  const view = render(<SwapScreen />);
  expect(view.getByLabelText('스왑 내역')).toBeTruthy();
  expect(view.getByLabelText('스왑 설정')).toBeTruthy();
  expect(view.getByLabelText('보내는 토큰과 받는 토큰 바꾸기')).toBeTruthy();
  fireEvent.press(view.getByLabelText('스왑 내역'));
  expect(mockNavigate).toHaveBeenCalledWith('SwapHistory');
});
