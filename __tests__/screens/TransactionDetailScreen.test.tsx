import React from 'react';
import { Alert, Clipboard, Linking } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'styled-components/native';
import { encodeAbiParameters, encodeFunctionData, erc20Abi, pad } from 'viem';
import { darkTheme } from '../../src/styles/theme';
import TransactionDetailScreen from '../../src/screens/TransactionDetail/TransactionDetailScreen';
import { chainClient } from '../../src/services/chainClient';
import { transactionCacheService } from '../../src/realm/services';
import {
  txReplacementService,
  type ReplacementPlan,
} from '../../src/services/txReplacementService';
import { useToastStore } from '../../src/store/toastStore';
import { usePreferencesStore } from '../../src/store/preferencesStore';

const owner = '0x1234567890123456789012345678901234567890';
const recipient = '0x0987654321098765432109876543210987654321';
const usdc = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const hash = `0x${'a'.repeat(64)}`;
const gwei = 1_000_000_000n;

let mockParams: { txHash: string; chainId?: number };
let mockPinProps: any;
let mockRequiresPin = true;
/** 설정하면 requiresTransactionPin(usdValue)를 이 정책으로 판단한다 */
let mockPinPolicy: ((usd?: number | null) => boolean) | null = null;
let mockLockState = { hasWallet: true, isLocked: false };
const mockPush = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    push: mockPush,
    goBack: jest.fn(),
    canGoBack: () => true,
  }),
  useRoute: () => ({ params: mockParams }),
}));
jest.mock('../../src/store/walletStore', () => {
  const useWalletStore = () => ({
    wallets: [{ address: owner }],
    activeWalletIndex: 0,
    activeNetworkChainId: 1,
    networks: [
      {
        chainId: 1,
        name: 'Ethereum Mainnet',
        symbol: 'ETH',
        blockExplorerUrl: 'https://etherscan.io',
      },
    ],
  });
  useWalletStore.getState = () => mockLockState;
  return { useWalletStore };
});
jest.mock('../../src/store/securityStore', () => ({
  useSecurityStore: (selector: (state: unknown) => unknown) =>
    selector({
      requiresTransactionPin: (usd?: number | null) =>
        mockPinPolicy ? mockPinPolicy(usd) : mockRequiresPin,
    }),
}));
jest.mock('../../src/services/coinService', () => ({
  coinService: { getNativeTokenPrice: jest.fn(async () => 2000) },
}));
jest.mock('../../src/services/chainClient', () => ({
  chainClient: {
    getClient: jest.fn(),
    getChainInfo: () => ({ name: 'Ethereum', isTestnet: false }),
  },
}));
jest.mock('../../src/components/common/PinConfirmModal', () => (props: any) => {
  mockPinProps = props;
  return null;
});

const client = {
  getTransaction: jest.fn(),
  getTransactionReceipt: jest.fn(),
  getBlock: jest.fn(),
  readContract: jest.fn(),
};

const notFound = (name: string) =>
  Object.assign(new Error('not found'), { name });

const pendingTx = {
  hash,
  from: owner,
  to: recipient,
  value: 10n ** 17n,
  input: '0x',
  nonce: 4,
  gas: 21_000n,
  gasPrice: 20n * gwei,
  type: 'legacy',
  blockNumber: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  useToastStore.getState().reset();
  // KRW는 환율 조회(네트워크)를 시작하므로 테스트에서는 USD로 고정한다.
  usePreferencesStore.setState({ currency: 'USD', hideBalances: false });
  mockParams = { txHash: hash, chainId: 1 };
  mockRequiresPin = true;
  mockPinPolicy = null;
  mockLockState = { hasWallet: true, isLocked: false };
  mockPinProps = undefined;
  (chainClient.getClient as jest.Mock).mockReturnValue(client);
  client.getTransaction.mockResolvedValue(pendingTx);
  client.getTransactionReceipt.mockRejectedValue(
    notFound('TransactionReceiptNotFoundError'),
  );
  client.getBlock.mockResolvedValue({ timestamp: 1_700_000_000n });
  client.readContract.mockImplementation(async ({ functionName }) =>
    functionName === 'symbol' ? 'USDC' : 6,
  );
  (transactionCacheService.getByHash as jest.Mock).mockResolvedValue(null);
  (transactionCacheService.getByAddress as jest.Mock).mockResolvedValue([]);
});

function mount() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={darkTheme}>
        <TransactionDetailScreen />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

it('shows a pending transaction with max fee, no block and replacement actions', async () => {
  const view = mount();
  expect(await view.findByText('대기 중')).toBeTruthy();
  expect(view.getByText('보냄')).toBeTruthy();
  expect(view.getByTestId('tx-amount')).toHaveTextContent('0.1 ETH');
  expect(view.getByText('최대 수수료')).toBeTruthy();
  expect(view.getByTestId('tx-fee')).toHaveTextContent(/0\.00042 ETH/);
  expect(view.getByTestId('tx-block')).toHaveTextContent(/아직 포함되지 않음/);
  expect(view.getByTestId('tx-nonce')).toHaveTextContent(/Nonce4$/);
  expect(view.getByTestId('tx-speed-up')).toBeTruthy();
  expect(view.getByTestId('tx-cancel')).toBeTruthy();
});

it('shows a confirmed transaction with the fee paid, block and explorer/copy actions', async () => {
  client.getTransaction.mockResolvedValue({ ...pendingTx, blockNumber: 99n });
  client.getTransactionReceipt.mockResolvedValue({
    status: 'success',
    blockNumber: 99n,
    gasUsed: 21_000n,
    effectiveGasPrice: 10n * gwei,
    from: owner,
    to: recipient,
  });
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  const setString = jest.spyOn(Clipboard, 'setString');
  const view = mount();
  expect(await view.findByText('완료')).toBeTruthy();
  expect(view.getByText('지불한 수수료')).toBeTruthy();
  expect(view.getByTestId('tx-fee')).toHaveTextContent(/0\.00021 ETH/);
  expect(view.getByTestId('tx-fee')).toHaveTextContent(/\$0\.42/);
  expect(view.getByTestId('tx-block')).toHaveTextContent(/99$/);
  expect(view.queryByTestId('tx-speed-up')).toBeNull();

  fireEvent.press(view.getByTestId('tx-open-explorer'));
  expect(openURL).toHaveBeenCalledWith(`https://etherscan.io/tx/${hash}`);
  fireEvent.press(view.getByTestId('tx-copy-hash-button'));
  expect(setString).toHaveBeenCalledWith(hash);
  expect(useToastStore.getState().current?.message).toBe(
    '거래 해시를 복사했습니다',
  );
});

it('shows a failed transaction', async () => {
  client.getTransaction.mockResolvedValue({ ...pendingTx, blockNumber: 7n });
  client.getTransactionReceipt.mockResolvedValue({
    status: 'reverted',
    blockNumber: 7n,
    gasUsed: 30_000n,
    effectiveGasPrice: gwei,
  });
  const view = mount();
  expect(await view.findByText('실패')).toBeTruthy();
  expect(view.getByTestId('tx-status-badge').props.accessibilityLabel).toBe(
    '상태: 실패',
  );
});

it('decodes ERC-20 transfers', async () => {
  client.getTransaction.mockResolvedValue({
    ...pendingTx,
    to: usdc,
    value: 0n,
    input: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [recipient, 5_000_000n],
    }),
  });
  const view = mount();
  await waitFor(() =>
    expect(view.getByTestId('tx-amount')).toHaveTextContent('5 USDC'),
  );
  expect(view.getByText('토큰 받는 주소')).toBeTruthy();
  expect(view.getByText('컨트랙트')).toBeTruthy();
});

it('shows replaced transactions from the local record when the RPC no longer knows them', async () => {
  const replacement = `0x${'b'.repeat(64)}`;
  client.getTransaction.mockRejectedValue(notFound('TransactionNotFoundError'));
  (transactionCacheService.getByHash as jest.Mock).mockResolvedValue({
    hash,
    from: owner,
    to: recipient,
    valueWei: '100000000000000000',
    gasPrice: '20000000000',
    gasLimit: '21000',
    timestamp: 1_700_000_000,
    status: 'cancelled',
    type: 'send',
    errorMessage: `다른 거래로 대체됨: ${replacement}`,
  });
  const view = mount();
  expect(await view.findByText('대체됨')).toBeTruthy();
  fireEvent.press(view.getByLabelText('대체한 거래 보기'));
  expect(mockPush).toHaveBeenCalledWith('TransactionDetail', {
    txHash: replacement,
    chainId: 1,
  });
});

it('shows a not-found error with retry', async () => {
  client.getTransaction.mockRejectedValue(notFound('TransactionNotFoundError'));
  const view = mount();
  expect(await view.findByText('거래를 찾을 수 없습니다')).toBeTruthy();
  client.getTransaction.mockResolvedValue(pendingTx);
  fireEvent.press(view.getByTestId('tx-error-retry'));
  expect(await view.findByText('대기 중')).toBeTruthy();
});

describe('speed-up', () => {
  const plan = {
    kind: 'speedUp',
    chainId: 1,
    from: owner,
    originalHash: hash,
    rootHash: hash,
    nonce: 4,
    to: recipient,
    value: 10n ** 17n,
    data: undefined,
    gas: 21_000n,
    fees: { type: 'legacy', gasPrice: 22_500_000_000n },
    originalFees: { type: 'legacy', gasPrice: 20n * gwei },
    originalMaxCostWei: 21_000n * 20n * gwei,
    newMaxCostWei: 21_000n * 22_500_000_000n,
    extraCostWei: 21_000n * 2_500_000_000n,
    totalAtRiskWei: 10n ** 17n + 21_000n * 22_500_000_000n,
    transaction: { from: owner, to: recipient, value: '100000000000000000' },
    expiresAt: Date.now() + 60_000,
  } as unknown as ReplacementPlan;

  it('requires review and PIN before signing the replacement', async () => {
    const prepare = jest
      .spyOn(txReplacementService, 'prepare')
      .mockResolvedValue(plan);
    const newHash = `0x${'c'.repeat(64)}`;
    const submit = jest
      .spyOn(txReplacementService, 'submit')
      .mockResolvedValue(newHash);
    const view = mount();
    await view.findByText('대기 중');
    await act(async () => {
      fireEvent.press(view.getByTestId('tx-speed-up'));
    });
    expect(prepare).toHaveBeenCalledWith({
      kind: 'speedUp',
      hash,
      chainId: 1,
      activeAddress: owner,
    });
    expect(view.getByText('거래 가속 검토')).toBeTruthy();
    expect(view.getByTestId('review-nonce')).toHaveTextContent(/Nonce4$/);
    expect(view.getByTestId('review-extra-cost')).toHaveTextContent(
      /0\.000053 ETH \(\$0\.11\)/,
    );

    fireEvent.press(view.getByTestId('replacement-review-confirm'));
    expect(mockPinProps.visible).toBe(true);
    expect(submit).not.toHaveBeenCalled();

    await act(async () => {
      mockPinProps.onConfirm();
    });
    expect(submit).toHaveBeenCalledWith(plan, expect.any(Function), {
      nativeSymbol: 'ETH',
    });
    const isAuthorized = submit.mock.calls[0][1];
    expect(isAuthorized()).toBe(true);
    expect(mockPush).toHaveBeenCalledWith('TransactionDetail', {
      txHash: newHash,
      chainId: 1,
    });
    expect(useToastStore.getState().current?.message).toBe(
      '가속 거래를 제출했습니다',
    );
    prepare.mockRestore();
    submit.mockRestore();
  });

  it('cancelling the review signs nothing', async () => {
    jest.spyOn(txReplacementService, 'prepare').mockResolvedValue(plan);
    const submit = jest.spyOn(txReplacementService, 'submit');
    const view = mount();
    await view.findByText('대기 중');
    await act(async () => {
      fireEvent.press(view.getByTestId('tx-speed-up'));
    });
    fireEvent.press(view.getByTestId('replacement-review-cancel'));
    expect(view.queryByText('거래 가속 검토')).toBeNull();
    expect(submit).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it('hides replacement actions for transactions from other accounts', async () => {
    client.getTransaction.mockResolvedValue({
      ...pendingTx,
      from: recipient,
      to: owner,
    });
    const view = mount();
    await view.findByText('대기 중');
    expect(view.queryByTestId('tx-speed-up')).toBeNull();
    expect(view.getByText('받음')).toBeTruthy();
  });
});

describe('token movement from receipt logs', () => {
  const bridge = '0x3333333333333333333333333333333333333333';
  const relayer = '0x4444444444444444444444444444444444444444';
  const transferTopic =
    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  const transferLog = (
    from: string,
    to: string,
    amount: bigint,
    token = usdc,
  ) => ({
    address: token,
    topics: [
      transferTopic,
      pad(from as `0x${string}`),
      pad(to as `0x${string}`),
    ],
    data: encodeAbiParameters([{ type: 'uint256' }], [amount]),
  });
  const mined = (logs: unknown[]) => {
    client.getTransaction.mockResolvedValue({
      ...pendingTx,
      from: relayer,
      to: bridge,
      value: 0n,
      input: '0x12345678',
      blockNumber: 50n,
    });
    client.getTransactionReceipt.mockResolvedValue({
      status: 'success',
      blockNumber: 50n,
      gasUsed: 80_000n,
      effectiveGasPrice: gwei,
      from: relayer,
      to: bridge,
      logs,
    });
  };

  it('shows a token received through a contract as 받음 with the token amount', async () => {
    mined([transferLog(bridge, owner, 500_000_000n)]);
    const view = mount();
    await waitFor(() =>
      expect(view.getByTestId('tx-amount')).toHaveTextContent('500 USDC'),
    );
    expect(view.getByText('받음')).toBeTruthy();
  });

  it('shows a dApp swap from Transfer logs as 스왑 with both legs', async () => {
    const weth = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
    mined([
      transferLog(owner, bridge, 1_000_000_000n),
      transferLog(bridge, owner, 3n * 10n ** 17n, weth),
    ]);
    client.readContract.mockImplementation(async ({ address, functionName }) =>
      address === weth
        ? functionName === 'symbol'
          ? 'WETH'
          : 18
        : functionName === 'symbol'
        ? 'USDC'
        : 6,
    );
    const view = mount();
    await waitFor(() =>
      expect(view.getByTestId('tx-amount')).toHaveTextContent('1,000 USDC'),
    );
    expect(view.getByText('스왑')).toBeTruthy();
    expect(view.getByText('→ 0.3 WETH')).toBeTruthy();
  });

  it('ignores Transfer logs that do not involve the viewing account', async () => {
    mined([transferLog(bridge, recipient, 500_000_000n)]);
    const view = mount();
    await waitFor(() =>
      expect(view.getByTestId('tx-amount')).toHaveTextContent('0 ETH'),
    );
    expect(view.getByText('거래')).toBeTruthy();
  });
});

describe('replacement policy and labels', () => {
  const basePlan = {
    kind: 'speedUp',
    acceleratesCancel: false,
    chainId: 1,
    from: owner,
    originalHash: hash,
    rootHash: hash,
    nonce: 4,
    to: usdc,
    value: 0n,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [recipient, 5_000_000_000n],
    }),
    gas: 60_000n,
    fees: { type: 'legacy', gasPrice: 22_500_000_000n },
    originalFees: { type: 'legacy', gasPrice: 20n * gwei },
    originalMaxCostWei: 60_000n * 20n * gwei,
    newMaxCostWei: 60_000n * 22_500_000_000n,
    extraCostWei: 60_000n * 2_500_000_000n,
    totalAtRiskWei: 60_000n * 22_500_000_000n,
    transaction: { from: owner, to: usdc, value: '0' },
    expiresAt: Date.now() + 60_000,
  } as unknown as ReplacementPlan;

  async function openReview(plan: ReplacementPlan) {
    jest.spyOn(txReplacementService, 'prepare').mockResolvedValue(plan);
    const view = mount();
    await view.findByText('대기 중');
    await act(async () => {
      fireEvent.press(view.getByTestId('tx-speed-up'));
    });
    return view;
  }

  afterEach(() => jest.restoreAllMocks());

  it('treats a speed-up that re-signs calldata as unknown value for the PIN limit', async () => {
    // PIN 토글 꺼짐 + 한도 $50: 알 수 없는 금액이면 PIN 필요
    const seen: (number | null | undefined)[] = [];
    mockPinPolicy = usd => {
      seen.push(usd);
      return usd === undefined || usd === null || usd > 50;
    };
    const submit = jest.spyOn(txReplacementService, 'submit');
    const view = await openReview(basePlan);
    fireEvent.press(view.getByTestId('replacement-review-confirm'));
    expect(seen).toEqual([undefined]);
    expect(mockPinProps.visible).toBe(true);
    expect(submit).not.toHaveBeenCalled();
  });

  it('prices a plain native speed-up by value plus fee', async () => {
    const seen: (number | null | undefined)[] = [];
    mockPinPolicy = usd => {
      seen.push(usd);
      return false;
    };
    const submit = jest
      .spyOn(txReplacementService, 'submit')
      .mockResolvedValue(`0x${'c'.repeat(64)}`);
    const view = await openReview({
      ...basePlan,
      to: recipient,
      data: undefined,
    } as ReplacementPlan);
    await act(async () => {
      fireEvent.press(view.getByTestId('replacement-review-confirm'));
    });
    expect(typeof seen[0]).toBe('number');
    expect(submit).toHaveBeenCalled();
  });

  it('shows the fiat cost being authorized even when balances are hidden', async () => {
    usePreferencesStore.setState({ hideBalances: true });
    const view = await openReview(basePlan);
    expect(view.getByTestId('review-extra-cost')).toHaveTextContent(
      /0\.00015 ETH \(\$0\.30\)/,
    );
    expect(view.getByTestId('review-extra-cost')).not.toHaveTextContent(/••••/);
  });

  it('offers only 취소 가속 on a pending cancel transaction', async () => {
    (transactionCacheService.getByHash as jest.Mock).mockResolvedValue({
      hash,
      from: owner,
      to: owner,
      valueWei: '0',
      gasPrice: '20000000000',
      timestamp: 1_700_000_000,
      status: 'pending',
      type: 'send',
      method: `replacement:cancel:0x${'d'.repeat(64)}`,
    });
    const view = await openReview({
      ...basePlan,
      kind: 'cancel',
      acceleratesCancel: true,
      to: owner,
      data: undefined,
    } as ReplacementPlan);
    expect(view.getByText('취소 가속 검토')).toBeTruthy();
    fireEvent.press(view.getByTestId('replacement-review-cancel'));
    expect(view.getByTestId('tx-speed-up')).toHaveTextContent('취소 가속');
    expect(view.queryByTestId('tx-cancel')).toBeNull();
  });

  it('reports a failure as a toast instead of an Alert when the wallet locked meanwhile', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    jest.spyOn(txReplacementService, 'prepare').mockImplementation(async () => {
      mockLockState = { hasWallet: true, isLocked: true };
      throw new Error('네트워크 오류');
    });
    const view = mount();
    await view.findByText('대기 중');
    await act(async () => {
      fireEvent.press(view.getByTestId('tx-speed-up'));
    });
    expect(alert).not.toHaveBeenCalled();
    expect(useToastStore.getState().current).toMatchObject({
      message: '가속할 수 없습니다 · 네트워크 오류',
      type: 'error',
    });
  });

  it('still uses an Alert while the wallet is unlocked', async () => {
    const alert = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);
    jest
      .spyOn(txReplacementService, 'prepare')
      .mockRejectedValue(new Error('네트워크 오류'));
    const view = mount();
    await view.findByText('대기 중');
    await act(async () => {
      fireEvent.press(view.getByTestId('tx-speed-up'));
    });
    expect(alert).toHaveBeenCalledWith('가속할 수 없습니다', '네트워크 오류');
  });
});
