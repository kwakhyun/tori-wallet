import React from 'react';
import { render, act } from '@testing-library/react-native';
import { ThemeProvider } from 'styled-components/native';
import { darkTheme } from '../../src/styles/theme';

let mockRequestHandler: any;
let mockSignProps: any;
let mockPinProps: any;
const mockAddress = '0x1234567890123456789012345678901234567890';
const mockHandleRequest = jest.fn().mockResolvedValue('0xsigned');
const mockLog = jest.fn().mockResolvedValue(undefined);

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn() }),
  useRoute: () => ({ params: {} }),
}));
jest.mock('../../src/hooks/useTheme', () => ({
  useTheme: () => ({ isDarkMode: true }),
}));
jest.mock('../../src/store/walletStore', () => ({
  useWalletStore: () => ({
    wallets: [{ address: mockAddress }],
    activeWalletIndex: 0,
    activeNetworkChainId: 1,
    networks: [{ chainId: 1, name: 'Ethereum' }],
  }),
}));
jest.mock('../../src/store/securityStore', () => ({
  useSecurityStore: () => ({ requiresTransactionPin: () => true }),
}));
jest.mock('../../src/realm/hooks', () => ({
  useWCActiveSessions: () => ({
    logSessionConnected: mockLog,
    logSessionDisconnected: mockLog,
  }),
  useWCRequestLog: () => ({ logRequest: mockLog }),
}));
jest.mock('../../src/services/wcService', () => ({
  wcService: {
    initialize: jest.fn().mockResolvedValue(undefined),
    getActiveSessions: () => [
      {
        topic: 'session',
        name: 'dapp',
        url: 'https://dapp.example',
        chains: ['eip155:1'],
        accounts: [mockAddress],
      },
    ],
    onSessionProposal: jest.fn(() => jest.fn()),
    onSessionRequest: (cb: any) => {
      mockRequestHandler = cb;
      return jest.fn();
    },
    getDAppVerification: () => ({ validation: 'VALID', isScam: false }),
    isVerificationBlocked: () => false,
    validateSessionRequest: jest.fn(() => true),
    respondRequest: jest.fn().mockResolvedValue(undefined),
    rejectRequest: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('../../src/services/signingService', () => ({
  signingService: {
    handleRequest: (...args: any[]) => mockHandleRequest(...args),
  },
}));
jest.mock('../../src/components/SignRequestModal', () => ({
  SignRequestModal: (props: any) => {
    mockSignProps = props;
    return null;
  },
}));
jest.mock('../../src/components/common/PinConfirmModal', () => ({
  __esModule: true,
  default: (props: any) => {
    mockPinProps = props;
    return null;
  },
}));

import WalletConnectScreen from '../../src/screens/WalletConnect/WalletConnectScreen';
import { wcService } from '../../src/services/wcService';
const request = (id: number, message: string) => ({
  id,
  topic: 'session',
  params: {
    chainId: 'eip155:1',
    request: { method: 'personal_sign', params: [message, mockAddress] },
  },
});
const mount = () =>
  render(
    <ThemeProvider theme={darkTheme}>
      <WalletConnectScreen />
    </ThemeProvider>,
  );
beforeEach(() => {
  jest.clearAllMocks();
  (wcService.validateSessionRequest as jest.Mock).mockReturnValue(true);
});

test('PIN for A signs only A while B waits for its own review', async () => {
  mount();
  await act(async () => {
    await mockRequestHandler(request(1, 'reviewed A'));
  });
  act(() => mockSignProps.onApprove());
  expect(mockPinProps.visible).toBe(true);
  await act(async () => {
    await mockRequestHandler(request(2, 'unreviewed B'));
  });
  expect(mockSignProps.request.id).toBe(1);
  await act(async () => {
    mockPinProps.onConfirm();
  });
  expect(mockHandleRequest).toHaveBeenCalledTimes(1);
  expect(mockHandleRequest).toHaveBeenCalledWith(
    'personal_sign',
    ['reviewed A', mockAddress],
    1,
    expect.any(Function),
  );
  expect(mockSignProps.request.id).toBe(2);
});

test('copies incoming request arguments and rejects repeated confirmation', async () => {
  mount();
  const incoming = request(1, 'original');
  await act(async () => {
    await mockRequestHandler(incoming);
  });
  act(() => mockSignProps.onApprove());
  incoming.params.request.params[0] = 'mutated';
  const confirm = mockPinProps.onConfirm;
  await act(async () => {
    confirm();
    confirm();
  });
  expect(mockHandleRequest).toHaveBeenCalledTimes(1);
  expect(mockHandleRequest.mock.calls[0][1][0]).toBe('original');
});

test.each(['cancel', 'unmount', 'disconnected', 'expired'])(
  'does not sign after %s during PIN verification',
  async action => {
    const view = mount();
    await act(async () => {
      await mockRequestHandler(request(1, 'A'));
    });
    act(() => mockSignProps.onApprove());
    const confirm = mockPinProps.onConfirm;
    if (action === 'cancel') act(() => mockPinProps.onCancel());
    if (action === 'unmount') view.unmount();
    if (action === 'disconnected')
      (wcService.validateSessionRequest as jest.Mock).mockReturnValue(false);
    const now =
      action === 'expired'
        ? jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 600_000)
        : undefined;
    await act(async () => {
      confirm();
    });
    expect(mockHandleRequest).not.toHaveBeenCalled();
    now?.mockRestore();
  },
);
