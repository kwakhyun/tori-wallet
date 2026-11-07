import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'styled-components/native';
import { darkTheme } from '../../src/styles/theme';
import TokenApprovalsScreen, {
  APPROVAL_SCOPE_NOTE,
} from '../../src/screens/Settings/TokenApprovalsScreen';
import {
  approvalService,
  type RevokePlan,
  type TokenApproval,
} from '../../src/services/approvalService';
import { useToastStore } from '../../src/store/toastStore';
import { usePreferencesStore } from '../../src/store/preferencesStore';

const owner = '0x1234567890123456789012345678901234567890';
const usdc = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const holder = '0x0000000000001fF3684f28c67538d4D072C22734';

let mockPinProps: any;
let mockRequiresPin = true;

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
    selector({ requiresTransactionPin: () => mockRequiresPin }),
}));
jest.mock('../../src/services/coinService', () => ({
  coinService: { getNativeTokenPrice: jest.fn(async () => 2000) },
}));
jest.mock('../../src/components/common/PinConfirmModal', () => (props: any) => {
  mockPinProps = props;
  return null;
});

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
  useToastStore.getState().reset();
  usePreferencesStore.setState({ currency: 'USD', hideBalances: false });
  mockRequiresPin = true;
  mockPinProps = undefined;
});

function mount() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={darkTheme}>
        <TokenApprovalsScreen />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

it('lists approvals with the spender label, 무제한 amount and scope note', async () => {
  jest.spyOn(approvalService, 'listAllowances').mockResolvedValue({
    approvals: [approval],
    tokensChecked: 4,
    spendersChecked: 1,
    failedChecks: 0,
  });
  const view = mount();
  expect(await view.findByText('USDC')).toBeTruthy();
  expect(view.getByText('0x AllowanceHolder · 0x0000...2734')).toBeTruthy();
  expect(view.getByText('무제한')).toBeTruthy();
  expect(view.getByText(APPROVAL_SCOPE_NOTE)).toBeTruthy();
  expect(view.getByLabelText('USDC 0x AllowanceHolder 권한 취소')).toBeTruthy();
  expect(approvalService.listAllowances).toHaveBeenCalledWith(owner, 1);
});

it('shows the empty state with an honest scope note', async () => {
  jest.spyOn(approvalService, 'listAllowances').mockResolvedValue({
    approvals: [],
    tokensChecked: 4,
    spendersChecked: 1,
    failedChecks: 0,
  });
  const view = mount();
  expect(await view.findByText('부여된 토큰 승인이 없습니다')).toBeTruthy();
  expect(view.getByTestId('approvals-scope-note')).toBeTruthy();
});

it('shows an error with retry', async () => {
  const list = jest
    .spyOn(approvalService, 'listAllowances')
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({
      approvals: [approval],
      tokensChecked: 4,
      spendersChecked: 1,
      failedChecks: 0,
    });
  const view = mount();
  expect(await view.findByText('승인 정보를 불러오지 못했습니다')).toBeTruthy();
  fireEvent.press(view.getByTestId('approvals-error-retry'));
  expect(await view.findByText('USDC')).toBeTruthy();
  expect(list).toHaveBeenCalledTimes(2);
});

it('revokes only after review and PIN authorization', async () => {
  jest.spyOn(approvalService, 'listAllowances').mockResolvedValue({
    approvals: [approval],
    tokensChecked: 4,
    spendersChecked: 1,
    failedChecks: 0,
  });
  const prepare = jest
    .spyOn(approvalService, 'prepareRevoke')
    .mockResolvedValue(plan);
  const submit = jest
    .spyOn(approvalService, 'submitRevoke')
    .mockResolvedValue(`0x${'f'.repeat(64)}`);
  const view = mount();
  await view.findByText('USDC');

  await act(async () => {
    fireEvent.press(view.getByTestId(`revoke-${approval.id}`));
  });
  expect(prepare).toHaveBeenCalledWith({
    owner,
    chainId: 1,
    token: approval.token,
    spender: approval.spender,
  });
  expect(view.getByTestId('revoke-review')).toBeTruthy();
  expect(view.getByTestId('revoke-review-data')).toHaveTextContent(
    /approve\(0x0000\.\.\.2734, 0\)/,
  );
  expect(submit).not.toHaveBeenCalled();

  fireEvent.press(view.getByTestId('revoke-review-confirm'));
  expect(mockPinProps.visible).toBe(true);
  expect(submit).not.toHaveBeenCalled();

  await act(async () => {
    mockPinProps.onConfirm();
  });
  expect(submit).toHaveBeenCalledWith(plan, expect.any(Function));
  expect(submit.mock.calls[0][1]()).toBe(true);
  expect(useToastStore.getState().current?.message).toBe(
    '권한 취소 거래를 제출했습니다',
  );
  expect(await view.findByText('취소 처리 중')).toBeTruthy();
});

it('does not sign when the review is cancelled or PIN is dismissed', async () => {
  jest.spyOn(approvalService, 'listAllowances').mockResolvedValue({
    approvals: [approval],
    tokensChecked: 4,
    spendersChecked: 1,
    failedChecks: 0,
  });
  jest.spyOn(approvalService, 'prepareRevoke').mockResolvedValue(plan);
  const submit = jest.spyOn(approvalService, 'submitRevoke');
  const view = mount();
  await view.findByText('USDC');
  await act(async () => {
    fireEvent.press(view.getByTestId(`revoke-${approval.id}`));
  });
  fireEvent.press(view.getByTestId('revoke-review-confirm'));
  act(() => mockPinProps.onCancel());
  expect(mockPinProps.visible).toBe(false);
  fireEvent.press(view.getByTestId('revoke-review-cancel'));
  expect(view.queryByTestId('revoke-review')).toBeNull();
  expect(submit).not.toHaveBeenCalled();
});
