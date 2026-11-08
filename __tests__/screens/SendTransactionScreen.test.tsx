import React from 'react';
import { Alert, Linking } from 'react-native';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'styled-components/native';
import { decodeFunctionData, erc20Abi, formatEther, parseEther } from 'viem';
import { darkTheme } from '../../src/styles/theme';
import SendTransactionScreen from '../../src/screens/Send/SendTransactionScreen';
import { signingService } from '../../src/services/signingService';
import { chainClient } from '../../src/services/chainClient';
import { ensService } from '../../src/services/ensService';
import { transferService } from '../../src/services/transferService';

const mockAddress = '0x1234567890123456789012345678901234567890';
const recipient = '0x0987654321098765432109876543210987654321';
const contract = '0x1111111111111111111111111111111111111111';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const ensAddress = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

let mockRouteParams: Record<string, string | undefined>;
let mockPinProps: any;
let mockQrProps: any;
let mockAddressBookProps: any;
let mockRecentAddresses: { address: string; lastUsed: number }[];
let mockActiveChainId = 1;
const mockWallet = { address: mockAddress };
const mockRefetch = jest.fn();
const mockReadContract = jest.fn();
const mockNativeBalance = jest.fn();
const mockGetCode = jest.fn();
const mockEstimateFees = jest.fn();
const mockGetEnsAddress = jest.fn();
const mockNavigate = jest.fn();
const mockRequiresPin = jest.fn();
const mockAddRecent = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: jest.fn(),
    navigate: mockNavigate,
    canGoBack: () => true,
  }),
  useRoute: () => ({ params: mockRouteParams }),
}));
jest.mock('../../src/hooks/useTheme', () => ({
  useTheme: () => ({ isDarkMode: true }),
}));
jest.mock('../../src/hooks/useFiat', () => ({
  useFiat: () => ({
    formatFiat: (value: number | null | undefined) =>
      value === null || value === undefined ? '—' : `$${value.toFixed(2)}`,
  }),
}));
jest.mock('../../src/store/walletStore', () => ({
  useWalletStore: () => ({
    wallets: [mockWallet],
    activeWalletIndex: 0,
    activeNetworkChainId: mockActiveChainId,
    networks: [
      {
        chainId: 1,
        name: 'Ethereum',
        symbol: 'ETH',
        isTestnet: false,
        blockExplorerUrl: 'https://etherscan.io',
      },
      { chainId: 137, name: 'Polygon', symbol: 'MATIC' },
      { chainId: 8453, name: 'Base', symbol: 'ETH', isTestnet: false },
    ],
  }),
}));
jest.mock('../../src/store/securityStore', () => ({
  useSecurityStore: () => ({
    requiresTransactionPin: mockRequiresPin,
    addRecentAddress: mockAddRecent,
    recentAddresses: mockRecentAddresses,
    addressBook: [],
  }),
}));
jest.mock('../../src/hooks/useBalance', () => ({
  useBalance: () => ({
    data: { wei: 10000000000000000000n, formatted: '10' },
    refetch: mockRefetch,
  }),
}));
jest.mock('../../src/services/chainClient', () => ({
  chainClient: {
    getClient: () => ({
      getBalance: mockNativeBalance,
      readContract: mockReadContract,
      getCode: mockGetCode,
      estimateFeesPerGas: mockEstimateFees,
      getEnsAddress: mockGetEnsAddress,
    }),
    estimateGas: jest.fn(),
    getGasPrice: jest.fn(),
    getBalance: jest.fn(),
  },
  ChainError: class extends Error {},
}));
jest.mock('../../src/services/tokenService', () => ({
  tokenService: {
    getTokens: jest.fn(async () => [
      {
        symbol: 'ETH',
        name: 'Ethereum',
        address: 'native',
        decimals: 18,
        balance: '10',
        balanceRaw: '10',
        price: 2000,
        priceChange24h: 0,
        value: 20000,
      },
      {
        symbol: 'USDC',
        name: 'USD Coin',
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        decimals: 6,
        balance: '5',
        balanceRaw: '5',
        price: 1,
        priceChange24h: 0,
        value: 5,
      },
    ]),
  },
}));
jest.mock('../../src/services/enhancedSwapService', () => ({
  enhancedSwapService: {
    getUsdPrices: jest.fn(async (_chainId: number, tokens: any[]) =>
      Object.fromEntries(
        tokens.map(token => [
          token.address.toLowerCase(),
          token.address.toLowerCase().startsWith('0xeeee') ? 2000 : 1,
        ]),
      ),
    ),
    getNativeUsdPrice: jest.fn(async () => 2000),
  },
}));
jest.mock('../../src/services/signingService', () => ({
  signingService: { sendTransaction: jest.fn() },
}));
jest.mock('../../src/services/transactionTracker', () => ({
  transactionTracker: { reconcile: jest.fn() },
}));
jest.mock('../../src/components/common', () => ({
  QRScanner: (props: any) => {
    mockQrProps = props;
    return null;
  },
}));
jest.mock(
  '../../src/screens/Settings/AddressBookScreen',
  () => (props: any) => {
    const { View } = require('react-native');
    mockAddressBookProps = props;
    return <View testID="mock-address-book" />;
  },
);
jest.mock('../../src/components/common/PinConfirmModal', () => (props: any) => {
  mockPinProps = props;
  return null;
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  ensService.clearCache();
  mockRouteParams = {};
  mockRecentAddresses = [];
  mockActiveChainId = 1;
  mockRequiresPin.mockReturnValue(true);
  mockNativeBalance.mockResolvedValue(parseEther('10'));
  mockReadContract.mockImplementation(async ({ address, functionName }) => {
    const isUsdc = address.toLowerCase() === USDC.toLowerCase();
    return (
      {
        decimals: isUsdc ? 6 : 18,
        symbol: isUsdc ? 'USDC' : 'TEST',
        balanceOf: isUsdc ? 5_000_000n : 9007199254740993123456789n,
      } as Record<string, unknown>
    )[functionName as string];
  });
  mockGetCode.mockResolvedValue('0x');
  // 기본: EIP-1559 미지원 → 레거시 gasPrice
  mockEstimateFees.mockRejectedValue(new Error('not supported'));
  (chainClient.estimateGas as jest.Mock).mockResolvedValue(21000n);
  (chainClient.getGasPrice as jest.Mock).mockResolvedValue(1000000000n);
  (chainClient.getBalance as jest.Mock).mockResolvedValue({
    wei: parseEther('10'),
    formatted: '10',
  });
  (signingService.sendTransaction as jest.Mock).mockResolvedValue('0xhash');
});
afterEach(() => jest.useRealTimers());

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={darkTheme}>
        <SendTransactionScreen />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

async function flush(ms = 600) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

async function fill(
  view: ReturnType<typeof mount>,
  amount = '1.000000000000000001',
  to = recipient,
) {
  fireEvent.changeText(view.getByTestId('send-address-input'), to);
  fireEvent.changeText(view.getByTestId('send-amount-input'), amount);
  await flush();
}

async function review(view: ReturnType<typeof mount>) {
  await waitFor(() =>
    expect(view.getByTestId('send-continue-button')).toBeEnabled(),
  );
  await act(async () => {
    fireEvent.press(view.getByTestId('send-continue-button'));
  });
}

async function confirmWithPin(view: ReturnType<typeof mount>) {
  fireEvent.press(view.getByTestId('send-confirm-button'));
  await act(async () => {
    mockPinProps.onConfirm();
  });
}

it.each([false, true])(
  'completes review and PIN with the correct native/token transaction (token=%s)',
  async isToken => {
    if (isToken) mockRouteParams = { tokenAddress: contract };
    const view = mount();
    await fill(view);
    await review(view);
    expect(view.getByText('최대 수수료')).toBeTruthy();
    fireEvent.press(view.getByTestId('send-confirm-button'));
    expect(mockPinProps.visible).toBe(true);
    expect(signingService.sendTransaction).not.toHaveBeenCalled();
    await act(async () => {
      mockPinProps.onConfirm();
    });
    const transaction = (signingService.sendTransaction as jest.Mock).mock
      .calls[0][0];
    expect(transaction.to).toBe(isToken ? contract : recipient);
    expect(transaction.value).toBe(isToken ? '0' : '1000000000000000001');
    if (isToken)
      expect(
        decodeFunctionData({ abi: erc20Abi, data: transaction.data }).args,
      ).toEqual([recipient, 1000000000000000001n]);
    expect(view.getByText('전송 제출 완료')).toBeTruthy();
  },
);

it('uses the entire exact token balance for maximum amount', async () => {
  mockRouteParams = { tokenAddress: contract };
  const view = mount();
  await flush(50);
  await waitFor(() =>
    expect(
      view.getByTestId('send-balance-text').props.children.join(''),
    ).toContain('9007199.254740993123456789'),
  );
  fireEvent.press(view.getByTestId('send-max-button'));
  expect(view.getByTestId('send-amount-input').props.value).toBe(
    '9007199.254740993123456789',
  );
});

it('blocks review when token metadata is unavailable and never sends native currency instead', async () => {
  mockRouteParams = { tokenAddress: contract };
  mockReadContract.mockRejectedValue(new Error('metadata unavailable'));
  const view = mount();
  await fill(view);
  expect(view.getByTestId('send-continue-button')).toBeDisabled();
  expect(view.getAllByText('metadata unavailable').length).toBeGreaterThan(0);
  expect(signingService.sendTransaction).not.toHaveBeenCalled();
});

it('keeps review blocked when token precision is exceeded or gas estimation fails', async () => {
  mockRouteParams = { tokenAddress: contract };
  const view = mount();
  await fill(view, '1.0000000000000000001');
  expect(view.getByTestId('send-continue-button')).toBeDisabled();
  (chainClient.estimateGas as jest.Mock).mockRejectedValue(
    new Error('offline'),
  );
  await fill(view, '1');
  expect(view.getByTestId('send-continue-button')).toBeDisabled();
  expect(signingService.sendTransaction).not.toHaveBeenCalled();
});

it('shows the prepared recipient even if input changes while review is loading', async () => {
  const view = mount();
  await fill(view, '1');
  let resolve!: (value: bigint) => void;
  mockNativeBalance.mockReturnValueOnce(
    new Promise(r => {
      resolve = r;
    }),
  );
  fireEvent.press(view.getByTestId('send-continue-button'));
  fireEvent.changeText(view.getByTestId('send-address-input'), contract);
  await act(async () => {
    resolve(parseEther('10'));
  });
  expect(view.getByText(recipient)).toBeTruthy();
  fireEvent.press(view.getByTestId('send-confirm-button'));
  await act(async () => {
    mockPinProps.onConfirm();
  });
  expect(signingService.sendTransaction).toHaveBeenCalledWith(
    expect.objectContaining({ to: recipient }),
    1,
    expect.any(Function),
  );
});

describe('inline recipient validation', () => {
  it('rejects an invalid format and disables Next', async () => {
    const view = mount();
    await fill(view, '1', 'invalid-address');
    expect(view.getByTestId('send-recipient-error')).toHaveTextContent(
      '유효하지 않은 주소입니다.',
    );
    expect(view.getByTestId('send-continue-button')).toBeDisabled();
  });

  it('reports a bad checksum with a distinct message', async () => {
    const view = mount();
    // 올바른 체크섬 주소의 대소문자 하나를 바꾼다.
    await fill(view, '1', '0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed');
    expect(view.getByTestId('send-recipient-error')).toHaveTextContent(
      /주소의 대소문자\(체크섬\)가 올바르지 않습니다/,
    );
    expect(view.getByTestId('send-continue-button')).toBeDisabled();
    expect(chainClient.estimateGas).not.toHaveBeenCalled();
  });

  it('blocks sending to the own wallet address', async () => {
    const view = mount();
    await fill(view, '1', mockAddress);
    expect(view.getByTestId('send-recipient-error')).toHaveTextContent(
      /내 지갑 주소입니다/,
    );
    expect(view.getByTestId('send-continue-button')).toBeDisabled();
  });

  it('warns about contract recipients without blocking', async () => {
    mockGetCode.mockResolvedValue('0x6080604052');
    const view = mount();
    await fill(view, '1');
    expect(
      view.getByTestId('send-recipient-contract-warning'),
    ).toHaveTextContent(
      '컨트랙트 주소입니다. 토큰을 직접 보내면 되찾지 못할 수 있습니다',
    );
    expect(view.getByTestId('send-continue-button')).toBeEnabled();
  });

  it('notes a first-time recipient but not a recent one', async () => {
    const view = mount();
    await fill(view, '1');
    expect(view.getByTestId('send-recipient-first-time')).toBeTruthy();
    view.unmount();

    mockRecentAddresses = [{ address: recipient, lastUsed: Date.now() }];
    const again = mount();
    await fill(again, '1');
    expect(again.queryByTestId('send-recipient-first-time')).toBeNull();
  });
});

it('resolves an ENS name, sends to the resolved address and shows the name in review', async () => {
  mockGetEnsAddress.mockResolvedValue(ensAddress);
  const view = mount();
  await fill(view, '1', 'Vitalik.eth');
  expect(view.getByTestId('send-ens-resolved')).toHaveTextContent(
    `vitalik.eth → 아래 주소로 보냅니다${ensAddress}`,
  );
  expect(mockGetEnsAddress).toHaveBeenCalledWith({ name: 'vitalik.eth' });

  await review(view);
  expect(view.getByTestId('send-confirm-ens')).toHaveTextContent('vitalik.eth');
  expect(view.getByText(ensAddress)).toBeTruthy();
  await confirmWithPin(view);
  expect(signingService.sendTransaction).toHaveBeenCalledWith(
    expect.objectContaining({ to: ensAddress }),
    1,
    expect.any(Function),
  );
});

it('shows an error for an ENS name without an address', async () => {
  mockGetEnsAddress.mockResolvedValue(null);
  const view = mount();
  await fill(view, '1', 'nobody.eth');
  expect(view.getByTestId('send-recipient-error')).toHaveTextContent(
    /찾을 수 없습니다/,
  );
  expect(view.getByTestId('send-continue-button')).toBeDisabled();
});

it('sends EIP-1559 fees for the selected speed and shows the fee in native + fiat', async () => {
  mockEstimateFees.mockResolvedValue({
    maxFeePerGas: 30_000_000_000n,
    maxPriorityFeePerGas: 2_000_000_000n,
  });
  const view = mount();
  fireEvent.press(view.getByTestId('send-fee-speed-fast'));
  await fill(view, '1');
  // 21,000 × 120% × 38 gwei = 0.0009576 ETH ≈ $1.92
  expect(view.getByTestId('send-fee-estimate')).toHaveTextContent(
    /0\.000958 ETH≈ \$1\.92/,
  );
  expect(view.getByTestId('send-amount-fiat')).toHaveTextContent('≈ $2000.00');

  await review(view);
  await confirmWithPin(view);
  const transaction = (signingService.sendTransaction as jest.Mock).mock
    .calls[0][0];
  expect(transaction.maxPriorityFeePerGas).toBe('3000000000');
  expect(transaction.maxFeePerGas).toBe('38000000000');
  expect(transaction.gasPrice).toBeUndefined();
});

it('calculates native MAX before a recipient is entered and reserves the fee', async () => {
  const view = mount();
  fireEvent.press(view.getByTestId('send-max-button'));
  await flush(10);

  // 받는 주소가 없으므로 내 주소로 추정
  expect(chainClient.estimateGas).toHaveBeenCalledWith(
    expect.objectContaining({ to: mockAddress, from: mockAddress }),
    expect.anything(),
  );
  const fee = 25_200n * 1_000_000_000n;
  expect(view.getByTestId('send-amount-input').props.value).toBe(
    formatEther(parseEther('10') - fee),
  );

  fireEvent.changeText(view.getByTestId('send-address-input'), recipient);
  await flush();
  await review(view);
  await confirmWithPin(view);
  const transaction = (signingService.sendTransaction as jest.Mock).mock
    .calls[0][0];
  expect(
    BigInt(transaction.value) + BigInt(transaction.gas) * 1_000_000_000n,
  ).toBe(parseEther('10'));
});

it('discards a slow native MAX result after the user switches to a token', async () => {
  const prepare = jest.spyOn(transferService, 'prepare');
  let resolveBalance!: (value: { wei: bigint; formatted: string }) => void;
  (chainClient.getBalance as jest.Mock).mockReturnValueOnce(
    new Promise(resolve => {
      resolveBalance = resolve;
    }),
  );
  const view = mount();
  await flush(10);
  fireEvent.press(view.getByTestId('send-max-button'));
  expect(view.getByTestId('send-max-button')).toHaveTextContent('계산중...');

  fireEvent.press(view.getByTestId('send-asset-button'));
  fireEvent.press(view.getByTestId('send-token-picker-item-USDC'));
  // 선택을 바꾸면 계산 표시도 바로 풀린다.
  expect(view.getByTestId('send-max-button')).toHaveTextContent('최대');
  await act(async () => {
    resolveBalance({ wei: parseEther('10'), formatted: '10' });
  });
  await flush(10);

  expect(view.getByTestId('send-asset-button')).toHaveTextContent(/USDC/);
  expect(view.getByTestId('send-amount-input').props.value).toBe('');
  fireEvent.changeText(view.getByTestId('send-address-input'), recipient);
  await flush();
  expect(prepare).not.toHaveBeenCalledWith(
    expect.objectContaining({ sendMax: true }),
  );
  prepare.mockRestore();
});

it('reserves the L1 data fee for native MAX on Base and shows it in review', async () => {
  mockActiveChainId = 8453;
  const l1Fee = 1_000_000_000_000n;
  mockReadContract.mockImplementation(async ({ functionName }) =>
    functionName === 'getL1Fee' ? l1Fee : undefined,
  );
  const view = mount();
  fireEvent.press(view.getByTestId('send-max-button'));
  await flush(10);

  const executionFee = 25_200n * 1_000_000_000n;
  const l1Reserve = l1Fee * 2n;
  expect(view.getByTestId('send-amount-input').props.value).toBe(
    formatEther(parseEther('10') - executionFee - l1Reserve),
  );

  fireEvent.changeText(view.getByTestId('send-address-input'), recipient);
  await flush();
  expect(view.getByTestId('send-fee-l1-note')).toHaveTextContent(
    'L1 데이터 수수료 포함',
  );
  await review(view);
  expect(view.getByText('최대 수수료')).toBeTruthy();
  expect(view.queryByText(/L1 비용 별도/)).toBeNull();
  expect(view.getByTestId('send-confirm-l1-fee')).toHaveTextContent(
    /L1 데이터 수수료 최대 0\.000002 ETH 포함/,
  );
  await confirmWithPin(view);
  const transaction = (signingService.sendTransaction as jest.Mock).mock
    .calls[0][0];
  // 노드의 잔액 검사(value + gas × 가스 가격 + L1 비용)를 통과할 여유가 남는다.
  expect(
    BigInt(transaction.value) +
      BigInt(transaction.gas) * 1_000_000_000n +
      l1Reserve,
  ).toBe(parseEther('10'));
  expect(signingService.sendTransaction).toHaveBeenCalledWith(
    expect.anything(),
    8453,
    expect.any(Function),
  );
});

it('passes the USD value of the transfer to the PIN policy', async () => {
  mockRequiresPin.mockReturnValue(false);
  const view = mount();
  await fill(view, '1');
  await waitFor(() =>
    expect(view.getByTestId('send-amount-fiat')).toHaveTextContent(
      '≈ $2000.00',
    ),
  );
  await review(view);
  await act(async () => {
    fireEvent.press(view.getByTestId('send-confirm-button'));
  });
  expect(mockRequiresPin).toHaveBeenCalledWith(2000);
  expect(signingService.sendTransaction).toHaveBeenCalled();
});

describe('QR payment requests', () => {
  it('applies the recipient and amount of a native payment request', async () => {
    const view = mount();
    await act(async () => {
      await mockQrProps.onScan({
        kind: 'payment',
        recipient,
        chainId: 1,
        amountRaw: 1_500_000_000_000_000_000n,
        raw: '',
      });
    });
    expect(view.getByTestId('send-address-input').props.value).toBe(recipient);
    expect(view.getByTestId('send-amount-input').props.value).toBe('1.5');
  });

  it('clears the previous token amount and MAX when a native request has no amount', async () => {
    const prepare = jest.spyOn(transferService, 'prepare');
    const view = mount();
    await flush(10);
    fireEvent.press(view.getByTestId('send-asset-button'));
    fireEvent.press(view.getByTestId('send-token-picker-item-USDC'));
    await flush(10);
    fireEvent.press(view.getByTestId('send-max-button'));
    expect(view.getByTestId('send-amount-input').props.value).toBe('5');

    await act(async () => {
      await mockQrProps.onScan({
        kind: 'payment',
        recipient,
        chainId: 1,
        raw: `ethereum:${recipient}@1`,
      });
    });
    expect(view.getByTestId('send-asset-button')).toHaveTextContent(/ETH/);
    expect(view.getByTestId('send-address-input').props.value).toBe(recipient);
    expect(view.getByTestId('send-amount-input').props.value).toBe('');
    await flush();
    // 이전 USDC의 MAX가 네이티브 전체 잔액 전송으로 이어지지 않는다.
    expect(prepare).not.toHaveBeenCalledWith(
      expect.objectContaining({ sendMax: true }),
    );
    expect(view.queryByText('수수료를 뺀 전체 잔액을 보냅니다.')).toBeNull();
    prepare.mockRestore();
  });

  it('selects a known token and formats the amount with its decimals', async () => {
    const view = mount();
    await flush(10);
    await act(async () => {
      await mockQrProps.onScan({
        kind: 'payment',
        recipient,
        chainId: 1,
        tokenAddress: USDC,
        amountRaw: 2_500_000n,
        raw: '',
      });
    });
    expect(view.getByTestId('send-amount-input').props.value).toBe('2.5');
    await flush(10);
    expect(view.getByTestId('send-asset-button')).toHaveTextContent(/USDC/);
  });

  it('warns before applying an unknown token contract', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation();
    const view = mount();
    await flush(10);
    await act(async () => {
      await mockQrProps.onScan({
        kind: 'payment',
        recipient,
        chainId: 1,
        tokenAddress: contract,
        amountRaw: 3n * 10n ** 18n,
        raw: '',
      });
    });
    expect(alert).toHaveBeenCalledWith(
      '목록에 없는 토큰',
      expect.stringContaining(contract),
      expect.any(Array),
    );
    expect(view.getByTestId('send-address-input').props.value).toBe('');
    const buttons = alert.mock.calls[0][2] as any[];
    await act(async () => {
      buttons.find(button => button.text === '확인 후 계속').onPress();
    });
    expect(view.getByTestId('send-amount-input').props.value).toBe('3');
    expect(view.getByTestId('send-address-input').props.value).toBe(recipient);
    alert.mockRestore();
  });

  it('warns about a different chain and does not apply the request silently', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation();
    const view = mount();
    await act(async () => {
      await mockQrProps.onScan({
        kind: 'payment',
        recipient,
        chainId: 137,
        amountRaw: 10n ** 18n,
        raw: '',
      });
    });
    expect(alert).toHaveBeenCalledWith(
      '다른 네트워크의 결제 요청',
      expect.stringContaining('Polygon'),
      expect.any(Array),
    );
    expect(view.getByTestId('send-address-input').props.value).toBe('');
    expect(view.getByTestId('send-amount-input').props.value).toBe('');

    const buttons = alert.mock.calls[0][2] as any[];
    expect(buttons[0]).toMatchObject({ text: '취소', style: 'cancel' });
    await act(async () => {
      buttons.find(button => button.text === '수신 주소만 사용').onPress();
    });
    expect(view.getByTestId('send-address-input').props.value).toBe(recipient);
    expect(view.getByTestId('send-amount-input').props.value).toBe('');
    alert.mockRestore();
  });
});

it('honors route params for recipient, token and raw amount', async () => {
  mockRouteParams = {
    tokenAddress: USDC,
    recipient,
    amountRaw: '1234567',
  };
  const view = mount();
  await flush(10);
  expect(view.getByTestId('send-address-input').props.value).toBe(recipient);
  expect(view.getByTestId('send-amount-input').props.value).toBe('1.234567');
  expect(view.getByTestId('send-asset-button')).toHaveTextContent(/USDC/);
});

it('lets the user pick an ERC-20 token from the active chain list', async () => {
  const view = mount();
  await flush(10);
  fireEvent.press(view.getByTestId('send-asset-button'));
  fireEvent.press(view.getByTestId('send-token-picker-item-USDC'));
  await flush(10);
  expect(view.getByTestId('send-asset-button')).toHaveTextContent(/USDC/);
  await fill(view, '1');
  await review(view);
  await confirmWithPin(view);
  const transaction = (signingService.sendTransaction as jest.Mock).mock
    .calls[0][0];
  expect(transaction.to).toBe(USDC);
  expect(
    decodeFunctionData({ abi: erc20Abi, data: transaction.data }).args,
  ).toEqual([recipient, 1_000_000n]);
});

it('shows the active network on the input step', () => {
  const view = mount();
  expect(view.getByTestId('send-network-badge')).toHaveTextContent(/Ethereum/);
});

it('embeds the address book with its own close header instead of a second title bar', async () => {
  const view = mount();
  expect(view.queryByTestId('mock-address-book')).toBeNull();
  fireEvent.press(view.getByTestId('send-address-book-button'));
  expect(view.getByTestId('mock-address-book')).toBeTruthy();
  expect(mockAddressBookProps).toMatchObject({
    selectionMode: true,
    onSelectAddress: expect.any(Function),
    onClose: expect.any(Function),
  });
  // Send는 별도의 래퍼 헤더를 그리지 않는다 (AddressBookScreen 헤더 하나만).
  expect(view.queryByTestId('send-address-book-close')).toBeNull();
  expect(view.queryByText('받는 주소 선택')).toBeNull();
  await act(async () => {
    mockAddressBookProps.onClose();
  });
  expect(view.queryByTestId('mock-address-book')).toBeNull();
});

it('ignores the placeholder name for recent addresses from the address book', async () => {
  const view = mount();
  fireEvent.press(view.getByTestId('send-address-book-button'));
  expect(view.getByTestId('mock-address-book')).toBeTruthy();
  await act(async () => {
    mockAddressBookProps.onSelectAddress(recipient, '최근 주소');
  });
  expect(view.getByTestId('send-address-input').props.value).toBe(recipient);
  expect(view.queryByTestId('send-address-name-badge')).toBeNull();

  await act(async () => {
    mockAddressBookProps.onSelectAddress(recipient, '친구');
  });
  expect(view.getByTestId('send-address-name-badge')).toHaveTextContent(
    '주소록: 친구',
  );
});

it('offers explorer, hash copy, detail and a real way home after submitting', async () => {
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  const view = mount();
  await fill(view, '1');
  await review(view);
  await confirmWithPin(view);

  expect(view.getByTestId('send-success-hash')).toHaveTextContent('0xhash');
  await act(async () => {
    fireEvent.press(view.getByTestId('send-success-explorer'));
  });
  expect(openURL).toHaveBeenCalledWith('https://etherscan.io/tx/0xhash');
  fireEvent.press(view.getByTestId('send-success-detail'));
  expect(mockNavigate).toHaveBeenCalledWith('TransactionDetail', {
    txHash: '0xhash',
    chainId: 1,
  });
  fireEvent.press(view.getByTestId('send-success-primary'));
  expect(mockNavigate).toHaveBeenCalledWith('Main', { screen: 'Home' });
  openURL.mockRestore();
});
