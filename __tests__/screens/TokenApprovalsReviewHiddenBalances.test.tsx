/**
 * 권한 취소 검토의 수수료는 잔액 숨기기와 관계없이 법정화폐로 보여 준다
 * (송금/스왑/가속 검토와 같은 기준: 서명으로 승인하는 비용은 가리지 않음).
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'styled-components/native';
import { darkTheme } from '../../src/styles/theme';
import TokenApprovalsScreen from '../../src/screens/Settings/TokenApprovalsScreen';
import {
  approvalService,
  type RevokePlan,
  type TokenApproval,
} from '../../src/services/approvalService';
import { usePreferencesStore } from '../../src/store/preferencesStore';

const owner = '0x1234567890123456789012345678901234567890';
const usdc = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const holder = '0x0000000000001fF3684f28c67538d4D072C22734';

jest.mock('../../src/store/walletStore', () => ({
  useWalletStore: () => ({
    wallets: [{ address: owner }],
    activeWalletIndex: 0,
    activeNetworkChainId: 1,
    networks: [{ chainId: 1, name: 'Ethereum Mainnet', symbol: 'ETH' }],
  }),
}));
jest.mock('../../src/store/securityStore', () => ({
  useSecurityStore: (selector: (state: unknown) => unknown) =>
    selector({ requiresTransactionPin: () => true }),
}));
jest.mock('../../src/services/coinService', () => ({
  coinService: { getNativeTokenPrice: jest.fn(async () => 2000) },
}));
jest.mock('../../src/components/common/PinConfirmModal', () => () => null);

const approval: TokenApproval = {
  id: `1:${usdc.toLowerCase()}:${holder.toLowerCase()}`,
  chainId: 1,
  owner,
  token: { address: usdc, symbol: 'USDC', decimals: 6 },
  spender: { address: holder, label: '0x AllowanceHolder' },
  allowance: 2n ** 256n - 1n,
  isUnlimited: true,
  formattedAmount: '무제한',
};

const plan: RevokePlan = {
  owner,
  chainId: 1,
  token: approval.token,
  spender: approval.spender,
  data: '0x095ea7b3',
  feeWei: 600_000_000_000_000n,
  transaction: { from: owner, to: usdc, value: '0', data: '0x095ea7b3' },
  expiresAt: Date.now() + 60_000,
};

beforeEach(() => {
  jest.restoreAllMocks();
  usePreferencesStore.setState({ currency: 'USD', hideBalances: true });
});

afterAll(() => {
  usePreferencesStore.setState({ hideBalances: false });
});

it('shows the revoke fee in fiat while balances are hidden', async () => {
  jest.spyOn(approvalService, 'listAllowances').mockResolvedValue({
    approvals: [approval],
    tokensChecked: 4,
    spendersChecked: 1,
    failedChecks: 0,
  });
  jest.spyOn(approvalService, 'prepareRevoke').mockResolvedValue(plan);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={darkTheme}>
        <TokenApprovalsScreen />
      </ThemeProvider>
    </QueryClientProvider>,
  );
  await view.findByText('USDC');
  await act(async () => {
    fireEvent.press(view.getByTestId(`revoke-${approval.id}`));
  });
  expect(view.getByTestId('revoke-review')).toHaveTextContent(
    /0\.0006 ETH \(\$1\.20\)/,
  );
  expect(view.getByTestId('revoke-review')).not.toHaveTextContent(/••••/);
});
