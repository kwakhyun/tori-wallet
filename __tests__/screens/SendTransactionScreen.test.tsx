import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'styled-components/native';
import { decodeFunctionData, erc20Abi, parseEther } from 'viem';
import { darkTheme } from '../../src/styles/theme';
import SendTransactionScreen from '../../src/screens/Send/SendTransactionScreen';
import { signingService } from '../../src/services/signingService';
import { chainClient } from '../../src/services/chainClient';

const mockAddress = '0x1234567890123456789012345678901234567890';
const recipient = '0x0987654321098765432109876543210987654321';
const contract = '0x1111111111111111111111111111111111111111';
let mockTokenAddress: string | undefined;
let mockPinProps: any;
const mockWallet = { address: mockAddress };
const mockRefetch = jest.fn();
const mockReadContract = jest.fn();
const mockNativeBalance = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn() }),
  useRoute: () => ({ params: { tokenAddress: mockTokenAddress } }),
}));
jest.mock('../../src/hooks/useTheme', () => ({
  useTheme: () => ({ isDarkMode: true }),
}));
jest.mock('../../src/store/walletStore', () => ({
  useWalletStore: () => ({
    wallets: [mockWallet],
    activeWalletIndex: 0,
    activeNetworkChainId: 1,
    networks: [{ chainId: 1, name: 'Ethereum', symbol: 'ETH' }],
  }),
}));
jest.mock('../../src/store/securityStore', () => ({
  useSecurityStore: () => ({
    requiresTransactionPin: () => true,
    addRecentAddress: jest.fn(),
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
    }),
    estimateGas: jest.fn(),
    getGasPrice: jest.fn(),
  },
  ChainError: class extends Error {},
}));
jest.mock('../../src/services/signingService', () => ({
  signingService: { sendTransaction: jest.fn() },
}));
jest.mock('../../src/services/transactionTracker', () => ({
  transactionTracker: { reconcile: jest.fn() },
}));
jest.mock('../../src/components/common', () => ({ QRScanner: () => null }));
jest.mock('../../src/screens/Settings/AddressBookScreen', () => () => null);
jest.mock('../../src/components/common/PinConfirmModal', () => (props: any) => {
  mockPinProps = props;
  return null;
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockTokenAddress = undefined;
  mockNativeBalance.mockResolvedValue(parseEther('10'));
  mockReadContract.mockImplementation(
    async ({ functionName }) =>
      ({ decimals: 18, symbol: 'TEST', balanceOf: 9007199254740993123456789n }[
        functionName as string
      ]),
  );
  (chainClient.estimateGas as jest.Mock).mockResolvedValue(21000n);
  (chainClient.getGasPrice as jest.Mock).mockResolvedValue(1000000000n);
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
async function fill(
  view: ReturnType<typeof mount>,
  amount = '1.000000000000000001',
) {
  fireEvent.changeText(view.getByTestId('send-address-input'), recipient);
  fireEvent.changeText(view.getByTestId('send-amount-input'), amount);
  await act(async () => {
    await jest.advanceTimersByTimeAsync(600);
  });
}

it.each([false, true])(
  'completes review and PIN with the correct native/token transaction (token=%s)',
  async isToken => {
    if (isToken) mockTokenAddress = contract;
    const view = mount();
    await fill(view);
    await waitFor(() =>
      expect(view.getByTestId('send-continue-button')).toBeEnabled(),
    );
    await act(async () => {
      fireEvent.press(view.getByTestId('send-continue-button'));
    });
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
  mockTokenAddress = contract;
  const view = mount();
  await act(async () => {
    await jest.advanceTimersByTimeAsync(50);
  });
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
  mockTokenAddress = contract;
  mockReadContract.mockRejectedValue(new Error('metadata unavailable'));
  const view = mount();
  await fill(view);
  expect(view.getByTestId('send-continue-button')).toBeDisabled();
  expect(view.getByText('metadata unavailable')).toBeTruthy();
  expect(signingService.sendTransaction).not.toHaveBeenCalled();
});

it('keeps review blocked when token precision is exceeded or gas estimation fails', async () => {
  mockTokenAddress = contract;
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
