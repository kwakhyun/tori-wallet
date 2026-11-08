/**
 * SwapScreen 테스트
 *
 * 실제 swapService/enhancedSwapService 검증 파이프라인을 사용하고, 0x/CoinGecko
 * 응답만 fetch 목으로 대신한다.
 */

import React from 'react';
import { Alert, Linking } from 'react-native';
import { act, fireEvent } from '@testing-library/react-native';
import { render } from '../test-utils';
import { useSwapStore } from '../../src/store/swapStore';
import { useWalletStore } from '../../src/store/walletStore';
import { signingService } from '../../src/services/signingService';
import { chainClient } from '../../src/services/chainClient';
import { darkTheme } from '../../src/styles/theme';
import SwapScreen from '../../src/screens/Swap/SwapScreen';
import {
  InsufficientFundsError,
  TransactionExecutionError,
  WaitForTransactionReceiptTimeoutError,
} from 'viem';

const NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const USDC = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const ALLOWANCE_HOLDER = '0x0000000000001fF3684f28c67538d4D072C22734';

const mockNavigate = jest.fn();
const mockDispatch = jest.fn();
let mockIsFocused = true;
let mockNavListeners: Record<string, Set<() => void>> = {};
let mockPreventRemove: {
  prevent: boolean;
  callback: (options: { data: { action: unknown } }) => void;
} | null = null;
const mockNavigation = {
  navigate: (...args: unknown[]) => mockNavigate(...args),
  dispatch: (...args: unknown[]) => mockDispatch(...args),
  goBack: jest.fn(),
  canGoBack: () => true,
  isFocused: () => mockIsFocused,
  addListener: (event: string, listener: () => void) => {
    (mockNavListeners[event] ??= new Set()).add(listener);
    return () => mockNavListeners[event]?.delete(listener);
  },
};
jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => mockNavigation,
    usePreventRemove: (
      prevent: boolean,
      callback: (options: { data: { action: unknown } }) => void,
    ) => {
      mockPreventRemove = { prevent, callback };
    },
  };
});

const TAKER = '0x1234567890123456789012345678901234567890';
jest.mock('../../src/store/walletStore', () => {
  const { create } = jest.requireActual('zustand');
  return {
    useWalletStore: create(() => ({
      hasWallet: true,
      isLocked: false,
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
        {
          chainId: 1,
          name: 'Ethereum',
          symbol: 'ETH',
          isTestnet: false,
          blockExplorerUrl: 'https://etherscan.io',
        },
      ],
    })),
  };
});
const initialWalletState = useWalletStore.getState();

const mockShowToast = jest.fn();
jest.mock('../../src/store/toastStore', () => ({
  ...jest.requireActual('../../src/store/toastStore'),
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));

function setWalletLocked(isLocked: boolean) {
  act(() => {
    useWalletStore.setState({ isLocked });
  });
}

const mockRequiresPin = jest.fn();
jest.mock('../../src/store/securityStore', () => ({
  useSecurityStore: () => ({ requiresTransactionPin: mockRequiresPin }),
}));

const DEFAULT_NATIVE_BALANCE = {
  data: {
    wei: 10_000_000_000_000_000_000n,
    formatted: '10',
    symbol: 'MATIC',
  },
  isError: false,
};
const DEFAULT_TOKEN_BALANCES = [
  {
    tokenAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    wei: 123_456_789n,
    formatted: '123.456789',
    symbol: 'USDC',
    error: false,
  },
];
let mockNativeBalance: { data?: unknown; isError?: boolean } =
  DEFAULT_NATIVE_BALANCE;
let mockTokenBalances: unknown[] = DEFAULT_TOKEN_BALANCES;
jest.mock('../../src/hooks/useBalance', () => ({
  useBalance: () => mockNativeBalance,
  useTokenBalance: (address?: string) => ({
    data: address
      ? { wei: 123_456_789n, formatted: '123.456789', symbol: '' }
      : undefined,
  }),
  useMultipleBalances: () => ({ data: mockTokenBalances }),
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
/** 설정하면 /quote 응답이 이 약속이 풀릴 때까지 지연된다. */
let quoteGate: Promise<void> | null = null;
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
  if (url.includes('/swap/allowance-holder/quote')) {
    if (quoteGate) await quoteGate;
    return respond(200, buildQuote(url));
  }
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
let alertSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  global.fetch = fetchMock as unknown as typeof fetch;
  useSwapStore.setState(initialSwapState, true);
  useWalletStore.setState(initialWalletState, true);
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockIsFocused = true;
  mockNavListeners = {};
  mockPreventRemove = null;
  quoteCount = 0;
  quoteGate = null;
  mockNativeBalance = DEFAULT_NATIVE_BALANCE;
  mockTokenBalances = DEFAULT_TOKEN_BALANCES;
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
  alertSpy.mockRestore();
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

// ── 후속 수정 회귀 테스트 ─────────────────────────────────────────

const SWAP_HASH = `0x${'bb'.repeat(32)}`;
const OK_RECEIPT = { status: 'success', blockNumber: 1n, gasUsed: 1n };

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

function quoteRequests() {
  return fetchMock.mock.calls.filter(([url]) =>
    (url as string).includes('/swap/allowance-holder/quote'),
  ).length;
}

function sentTransactions() {
  return (signingService.sendTransaction as jest.Mock).mock.calls.map(
    ([tx]) => tx,
  );
}

/** USDC 100 → MATIC 검토 모달까지 연다. */
async function openUsdcReview(view: ReturnType<typeof render>) {
  await sellUsdc(view);
  await enterAmount(view, '100');
  fireEvent.press(view.getByTestId('swap-review-button'));
  await flush(10);
  expect(mockReviewProps.visible).toBe(true);
}

/** 검토를 확인해 승인 트랜잭션을 보내고, 확정은 테스트가 직접 풀게 한다. */
async function confirmWithPendingReceipt(view: ReturnType<typeof render>) {
  await openUsdcReview(view);
  const receipt = deferred<typeof OK_RECEIPT>();
  waitForTransactionReceipt.mockImplementationOnce(() => receipt.promise);
  await act(async () => {
    mockReviewProps.onConfirm();
  });
  await flush(10);
  expect(sentTransactions()).toHaveLength(1);
  expect(view.getByTestId('swap-review-button')).toHaveTextContent(
    '승인 확정 대기 중… (1/2)',
  );
  return receipt;
}

describe('review preparation (stale quotes)', () => {
  it('drops a slow quote when the intent changes while it loads and locks the inputs', async () => {
    const view = render(<SwapScreen />);
    await enterAmount(view, '1');

    const gate = deferred();
    quoteGate = gate.promise;
    fireEvent.press(view.getByTestId('swap-review-button'));
    await flush(10);

    // 견적을 받는 동안 입력을 바꿀 수 없다.
    expect(view.getByTestId('swap-sell-amount-input').props.editable).toBe(
      false,
    );
    expect(view.getByTestId('swap-switch-tokens')).toBeDisabled();
    expect(view.getByTestId('swap-sell-token-button')).toBeDisabled();
    expect(view.getByTestId('swap-buy-token-button')).toBeDisabled();
    expect(view.getByTestId('swap-max-button')).toBeDisabled();
    expect(view.getByTestId('swap-slippage-row')).toBeDisabled();
    expect(view.getByTestId('swap-history-button')).toBeDisabled();

    // 그래도 의도가 바뀌면 (설정 변경 등) 늦게 온 견적은 버린다.
    act(() => {
      useSwapStore.setState({
        settings: { autoSlippage: false, defaultSlippage: 3 },
      });
    });
    gate.resolve();
    await flush(10);

    expect(mockReviewProps.visible).toBe(false);
    expect(mockReviewProps.quote).toBeNull();
    expect(view.getByTestId('swap-sell-amount-input').props.editable).toBe(
      true,
    );
  });

  it('keeps the busy review button readable instead of greying it out', async () => {
    const view = render(<SwapScreen />);
    await enterAmount(view, '1');
    const gate = deferred();
    quoteGate = gate.promise;
    fireEvent.press(view.getByTestId('swap-review-button'));
    await flush(10);

    const button = view.getByTestId('swap-review-button');
    expect(button).toBeDisabled();
    expect(button).toHaveStyle({ backgroundColor: darkTheme.colors.primary });
    expect(view.getByTestId('swap-review-button-spinner').props.color).toBe(
      darkTheme.colors.onPrimary,
    );

    gate.resolve();
    await flush(10);
  });

  it('does not reopen the review when it is closed during a refresh', async () => {
    const view = render(<SwapScreen />);
    await openUsdcReview(view);

    const gate = deferred();
    quoteGate = gate.promise;
    act(() => {
      mockReviewProps.onRefreshQuote();
    });
    expect(mockReviewProps.isRefreshing).toBe(true);
    act(() => {
      mockReviewProps.onClose();
    });
    expect(mockReviewProps.visible).toBe(false);

    gate.resolve();
    await flush(3000);
    expect(mockReviewProps.visible).toBe(false);
    expect(mockReviewProps.isRefreshing).toBe(false);
  });

  it('does not open the review over another screen', async () => {
    const view = render(<SwapScreen />);
    await enterAmount(view, '1');
    const gate = deferred();
    quoteGate = gate.promise;
    fireEvent.press(view.getByTestId('swap-review-button'));
    await flush(10);
    mockIsFocused = false;
    gate.resolve();
    await flush(10);
    expect(mockReviewProps.visible).toBe(false);
    expect(view.queryByTestId('swap-review-button-spinner')).toBeNull();
  });

  it('keeps the flow busy while re-quoting after an approval without PIN', async () => {
    const view = render(<SwapScreen />);
    await openUsdcReview(view);

    const gate = deferred();
    waitForTransactionReceipt.mockImplementationOnce(async () => {
      jest.setSystemTime(Date.now() + 100_000);
      readContract.mockResolvedValue(100_000_000n);
      quoteGate = gate.promise;
      return OK_RECEIPT;
    });
    await act(async () => {
      mockReviewProps.onConfirm();
    });
    await flush(10);

    // 새 견적을 기다리는 동안 버튼은 진행 중이며 다시 누를 수 없다.
    const button = view.getByTestId('swap-review-button');
    expect(button).toHaveTextContent('새 견적 확인 중…');
    expect(button).toBeDisabled();
    const requestsBefore = quoteRequests();
    fireEvent.press(button);
    expect(quoteRequests()).toBe(requestsBefore);

    gate.resolve();
    await flush(10);
    expect(mockReviewProps.visible).toBe(true);
    expect(mockReviewProps.isRefreshing).toBe(false);
    expect(mockReviewProps.isLoading).toBe(false);
    expect(mockReviewProps.notice).toMatch(/견적이 만료되어 새 견적/);
    expect(quoteRequests()).toBe(requestsBefore);
  });
});

describe('auto-lock during the approve → swap flow', () => {
  it('does not send the swap or alert over the lock screen, then re-reviews after unlock', async () => {
    const view = render(<SwapScreen />);
    const receipt = await confirmWithPendingReceipt(view);
    const firstQuote = mockReviewProps.quote;
    const isAuthorized = (signingService.sendTransaction as jest.Mock).mock
      .calls[0][2];
    expect(isAuthorized()).toBe(true);

    setWalletLocked(true);
    // 서명 승인 확인에 잠금 상태가 포함된다.
    expect(isAuthorized()).toBe(false);

    readContract.mockResolvedValue(100_000_000n);
    await act(async () => {
      receipt.resolve(OK_RECEIPT);
    });
    await flush(10);

    // 스왑은 보내지 않고, 잠금 화면 위에 Alert을 띄우지 않는다.
    expect(sentTransactions()).toHaveLength(1);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringMatching(
        /지갑이 잠겨 스왑을 보내지 않았습니다.*승인은 완료/,
      ),
      'warning',
    );
    expect(mockReviewProps.visible).toBe(false);
    const requestsWhileLocked = quoteRequests();
    await flush(1000);
    expect(quoteRequests()).toBe(requestsWhileLocked);

    // 잠금 해제 → 새 견적으로 다시 검토
    setWalletLocked(false);
    await flush(10);
    expect(mockReviewProps.visible).toBe(true);
    expect(mockReviewProps.notice).toMatch(
      /지갑이 잠겨 스왑을 보내지 않았으므로/,
    );
    expect(mockReviewProps.quote.data).not.toBe(firstQuote.data);
    expect(mockReviewProps.approval).toBeNull();

    await act(async () => {
      mockReviewProps.onConfirm();
    });
    await flush(10);
    expect(sentTransactions()).toHaveLength(2);
    expect(sentTransactions()[1].data).toBe(mockReviewProps.quote.data);
    expect(view.getByTestId('swap-submitted')).toBeTruthy();
  });

  it('does not resume the swap when the wallet was locked and unlocked during the wait', async () => {
    const view = render(<SwapScreen />);
    const receipt = await confirmWithPendingReceipt(view);

    setWalletLocked(true);
    setWalletLocked(false);
    readContract.mockResolvedValue(100_000_000n);
    await act(async () => {
      receipt.resolve(OK_RECEIPT);
    });
    await flush(10);

    // 잠금 해제 후라도 이어서 서명하지 않고 바로 다시 검토한다.
    expect(sentTransactions()).toHaveLength(1);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockReviewProps.visible).toBe(true);
    expect(mockReviewProps.notice).toMatch(/지갑이 잠겨/);
    // 이미 풀려 있으므로 '잠금을 해제하면 …' 토스트는 띄우지 않는다 (모달 안내가 설명).
    expect(mockShowToast).not.toHaveBeenCalledWith(
      expect.stringContaining('잠금을 해제하면'),
      expect.anything(),
    );
  });

  it('does not raise a failure Alert over another screen', async () => {
    const view = render(<SwapScreen />);
    await openUsdcReview(view);
    // 승인 확정 후 다른 화면이 위에 올라온 상태에서 스왑 시뮬레이션이 실패한다.
    waitForTransactionReceipt.mockImplementationOnce(async () => {
      mockIsFocused = false;
      return OK_RECEIPT;
    });
    estimateGas.mockRejectedValueOnce(new Error('execution reverted'));
    await act(async () => {
      mockReviewProps.onConfirm();
    });
    await flush(10);

    expect(sentTransactions()).toHaveLength(1);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringMatching(
        /토큰 승인은 완료되었지만 스왑을 보내지 못했습니다.*시뮬레이션/,
      ),
      'error',
    );
  });

  it('turns a plain swap failure into a toast when another screen is on top', async () => {
    const view = render(<SwapScreen />);
    await enterAmount(view, '5');
    fireEvent.press(view.getByTestId('swap-review-button'));
    await flush(10);
    estimateGas.mockImplementationOnce(async () => {
      mockIsFocused = false;
      throw new Error('execution reverted');
    });
    await act(async () => {
      mockReviewProps.onConfirm();
    });
    await flush(10);

    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('시뮬레이션에 실패'),
      'error',
    );
  });

  it('turns a lock while sending into a held toast instead of an Alert', async () => {
    const view = render(<SwapScreen />);
    await enterAmount(view, '5');
    fireEvent.press(view.getByTestId('swap-review-button'));
    await flush(10);

    estimateGas.mockImplementationOnce(async () => {
      useWalletStore.setState({ isLocked: true });
      return 150_000n;
    });
    (signingService.sendTransaction as jest.Mock)
      .mockReset()
      .mockRejectedValue(new Error('Wallet is locked'));
    await act(async () => {
      mockReviewProps.onConfirm();
    });
    await flush(10);

    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('지갑이 잠겨 스왑을 보내지 않았습니다'),
      'warning',
    );
    expect(view.queryByTestId('swap-submitted')).toBeNull();
  });

  it('does not open the first review while the wallet is locked', async () => {
    const view = render(<SwapScreen />);
    await enterAmount(view, '1');
    const gate = deferred();
    quoteGate = gate.promise;
    fireEvent.press(view.getByTestId('swap-review-button'));
    await flush(10);
    setWalletLocked(true);
    gate.resolve();
    await flush(10);
    expect(mockReviewProps.visible).toBe(false);

    setWalletLocked(false);
    await flush(10);
    // 사용자가 승인한 것이 없으므로 저절로 열리지 않는다.
    expect(mockReviewProps.visible).toBe(false);
    expect(view.getByTestId('swap-review-button')).toBeEnabled();
  });
});

describe('leaving during the two-step swap', () => {
  it('blocks leaving while swapping and asks before discarding the swap', async () => {
    const view = render(<SwapScreen />);
    expect(mockPreventRemove?.prevent).toBe(false);
    await confirmWithPendingReceipt(view);

    expect(view.getByTestId('swap-back-button')).toBeDisabled();
    expect(view.getByTestId('swap-history-button')).toBeDisabled();
    expect(view.getByTestId('swap-settings-button')).toBeDisabled();
    expect(mockPreventRemove?.prevent).toBe(true);

    const action = { type: 'GO_BACK' };
    act(() => {
      mockPreventRemove!.callback({ data: { action } });
    });
    expect(alertSpy).toHaveBeenCalledWith(
      '스왑 진행 중',
      expect.stringContaining('아직 보내지 않은 스왑은 전송되지 않습니다'),
      expect.any(Array),
    );
    const buttons = alertSpy.mock.calls[0][2] as {
      text: string;
      onPress?: () => void;
    }[];
    buttons.find(b => b.text === '머무르기')?.onPress?.();
    expect(mockDispatch).not.toHaveBeenCalled();
    buttons.find(b => b.text === '나가기')?.onPress?.();
    expect(mockDispatch).toHaveBeenCalledWith(action);
  });

  it('tells the user when the approval confirms after they left', async () => {
    const view = render(<SwapScreen />);
    const receipt = await confirmWithPendingReceipt(view);
    view.unmount();
    readContract.mockResolvedValue(100_000_000n);
    await act(async () => {
      receipt.resolve(OK_RECEIPT);
    });
    await flush(10);
    expect(sentTransactions()).toHaveLength(1);
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining(
        '토큰 승인은 완료되었지만 스왑은 전송되지 않았습니다',
      ),
      'warning',
    );
    expect(alertSpy).not.toHaveBeenCalled();
  });
});

describe('approval errors', () => {
  it('reports a receipt timeout as a pending approval, not a failed swap', async () => {
    const view = render(<SwapScreen />);
    await openUsdcReview(view);
    waitForTransactionReceipt.mockRejectedValueOnce(
      new WaitForTransactionReceiptTimeoutError({
        hash: `0x${'aa'.repeat(32)}`,
      }),
    );
    await act(async () => {
      mockReviewProps.onConfirm();
    });
    await flush(10);

    expect(sentTransactions()).toHaveLength(1);
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [title, message] = alertSpy.mock.calls[0];
    expect(title).toBe('승인 확인 필요');
    expect(message).toMatch(/아직 확정되지 않았습니다.*활동 내역/);
    expect(message).not.toMatch(/Timed out|0x/);
  });

  it('shows a Korean message instead of the viem dump when gas funds are missing', async () => {
    const view = render(<SwapScreen />);
    await openUsdcReview(view);
    (signingService.sendTransaction as jest.Mock).mockReset().mockRejectedValue(
      new TransactionExecutionError(new InsufficientFundsError(), {
        account: { address: TAKER, type: 'json-rpc' } as never,
        to: USDC,
        data: '0x095ea7b3',
      }),
    );
    await act(async () => {
      mockReviewProps.onConfirm();
    });
    await flush(10);

    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [title, message] = alertSpy.mock.calls[0];
    expect(title).toBe('스왑 실패');
    expect(message).toMatch(/가스비로 쓸 MATIC 잔액이 부족합니다/);
    expect(message).not.toMatch(/Version|Request Arguments|0x095ea7b3/);
  });
});

describe('mainnet USDT allowance reset', () => {
  const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

  async function reviewUsdt(view: ReturnType<typeof render>) {
    fireEvent.press(view.getByTestId('swap-sell-token-button'));
    fireEvent.press(view.getByTestId('swap-token-picker-item-USDT'));
    await enterAmount(view, '120');
    fireEvent.press(view.getByTestId('swap-review-button'));
    await flush(10);
    expect(mockReviewProps.visible).toBe(true);
  }

  it('resets a leftover allowance to zero before approving the exact amount', async () => {
    useWalletStore.setState({ activeNetworkChainId: 1 });
    // 이전에 승인하고 쓰지 않은 100 USDT가 남아 있다.
    readContract.mockResolvedValue(100_000_000n);
    (signingService.sendTransaction as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce(`0x${'a1'.repeat(32)}`)
      .mockResolvedValueOnce(`0x${'a2'.repeat(32)}`)
      .mockResolvedValueOnce(SWAP_HASH);

    const view = render(<SwapScreen />);
    await reviewUsdt(view);
    expect(mockReviewProps.approval).toMatchObject({
      tokenSymbol: 'USDT',
      amount: '120',
      resetRequired: true,
    });

    const receipts = [
      deferred<typeof OK_RECEIPT>(),
      deferred<typeof OK_RECEIPT>(),
    ];
    let receiptIndex = 0;
    waitForTransactionReceipt.mockImplementation(
      () => receipts[receiptIndex++].promise,
    );
    await act(async () => {
      mockReviewProps.onConfirm();
    });
    await flush(10);
    expect(view.getByTestId('swap-review-button')).toHaveTextContent(
      '초기화 확정 대기 중… (1/3)',
    );
    expect(sentTransactions()).toHaveLength(1);

    await act(async () => {
      receipts[0].resolve(OK_RECEIPT);
    });
    await flush(10);
    expect(view.getByTestId('swap-review-button')).toHaveTextContent(
      '승인 확정 대기 중… (2/3)',
    );
    expect(sentTransactions()).toHaveLength(2);

    await act(async () => {
      receipts[1].resolve(OK_RECEIPT);
    });
    await flush(10);
    expect(sentTransactions()).toHaveLength(3);
    const [reset, approve, swap] = sentTransactions();
    expect(reset.to).toBe(USDT);
    expect(reset.data.slice(0, 10)).toBe('0x095ea7b3');
    expect(reset.data.toLowerCase()).toContain(
      ALLOWANCE_HOLDER.slice(2).toLowerCase(),
    );
    expect(reset.data.endsWith('0'.repeat(64))).toBe(true);
    expect(approve.to).toBe(USDT);
    expect(approve.data).toContain((120_000_000).toString(16));
    expect(swap.to).toBe(ALLOWANCE_HOLDER);
    expect(view.getByTestId('swap-submitted')).toBeTruthy();
  });

  it('approves directly when no allowance is left', async () => {
    useWalletStore.setState({ activeNetworkChainId: 1 });
    readContract.mockResolvedValue(0n);
    const view = render(<SwapScreen />);
    await reviewUsdt(view);
    expect(mockReviewProps.approval.resetRequired).toBeUndefined();

    await act(async () => {
      mockReviewProps.onConfirm();
    });
    await flush(10);
    expect(sentTransactions()).toHaveLength(2);
    expect(sentTransactions()[0].data).toContain((120_000_000).toString(16));
  });
});

describe('token picker balances', () => {
  it('marks failed balances as unknown instead of "—" text or hiding them', () => {
    mockNativeBalance = { data: undefined, isError: true };
    mockTokenBalances = [
      {
        tokenAddress: USDC,
        wei: null,
        formatted: null,
        symbol: 'USDC',
        error: true,
      },
    ];
    const view = render(<SwapScreen />);
    fireEvent.press(view.getByTestId('swap-sell-token-button'));

    expect(
      view.getByTestId('swap-token-picker-item-USDC').props.accessibilityLabel,
    ).toBe('USDC USD Coin, 잔액 알 수 없음');
    expect(
      view.getByTestId('swap-token-picker-item-MATIC').props.accessibilityLabel,
    ).toBe('MATIC Polygon, 잔액 알 수 없음');
  });

  it('omits the balance while it is still loading', () => {
    mockNativeBalance = { data: undefined, isError: false };
    mockTokenBalances = [];
    const view = render(<SwapScreen />);
    fireEvent.press(view.getByTestId('swap-sell-token-button'));
    expect(
      view.getByTestId('swap-token-picker-item-MATIC').props.accessibilityLabel,
    ).toBe('MATIC Polygon');
  });
});
