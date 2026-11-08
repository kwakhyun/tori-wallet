/**
 * WalletConnect 전역 호스트: WalletConnectScreen 없이도 요청을 처리하고, 잠금 중에는
 * 서비스 큐에서 기다렸다가 해제 후 표시하며, 승인 사본에만 서명한다.
 */

import React from 'react';
import { Alert, Linking } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { ThemeProvider } from 'styled-components/native';
import { darkTheme } from '../../src/styles/theme';

const ADDRESS = '0x1234567890123456789012345678901234567890';
const ADDRESS_B = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const SPENDER = '0x111111125421ca6dc452d289314280a0f8842a65';
const TX_HASH = `0x${'ab'.repeat(32)}`;
const SYM_KEY = 'd'.repeat(64);

let mockSignProps: any;
let mockPinProps: any;
let mockProposalProps: any;
let mockChainProps: any;
const mockHandleRequest = jest.fn().mockResolvedValue('0xsigned');
const mockRequiresPin = jest.fn((_usd?: number) => true);
const mockShowToast = jest.fn();
const mockPrice = jest.fn().mockResolvedValue(2000);
const mockSetActiveNetwork = jest.fn((chainId: number) => {
  mockWalletState.activeNetworkChainId = chainId;
});
const mockSetActiveWallet = jest.fn((index: number) => {
  mockWalletState.activeWalletIndex = index;
});
const mockReconcile = jest.fn(() => Promise.resolve());
const mockWalletState: any = {};

jest.mock('../../src/store/walletStore', () => ({
  useWalletStore: Object.assign(
    (selector: (state: unknown) => unknown) => selector(mockWalletState),
    { getState: () => mockWalletState },
  ),
}));
jest.mock('../../src/services/transactionTracker', () => ({
  transactionTracker: { reconcile: () => mockReconcile() },
}));
jest.mock('../../src/store/securityStore', () => ({
  useSecurityStore: (selector: (state: unknown) => unknown) =>
    selector({ requiresTransactionPin: mockRequiresPin }),
}));
jest.mock('../../src/store/toastStore', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));
jest.mock('../../src/services/coinService', () => ({
  coinService: {
    getNativeTokenPrice: (...args: unknown[]) => mockPrice(...args),
  },
}));
jest.mock('../../src/services/chainClient', () => ({
  chainClient: {
    getClient: () => ({
      getGasPrice: jest.fn().mockResolvedValue(1_000_000_000n),
      estimateGas: jest.fn().mockResolvedValue(21_000n),
      estimateFeesPerGas: jest.fn().mockResolvedValue({
        maxFeePerGas: 2_000_000_000n,
        maxPriorityFeePerGas: 1_000_000_000n,
      }),
    }),
  },
}));
jest.mock('../../src/services/signingService', () => ({
  signingService: {
    handleRequest: (...args: unknown[]) => mockHandleRequest(...args),
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
jest.mock('../../src/components/walletconnect/ProposalModal', () => ({
  ProposalModal: (props: any) => {
    mockProposalProps = props;
    return null;
  },
}));
jest.mock('../../src/components/walletconnect/ChainSwitchModal', () => ({
  ChainSwitchModal: (props: any) => {
    mockChainProps = props;
    return null;
  },
}));

import { WalletConnectHost } from '../../src/components/walletconnect/WalletConnectHost';
import { wcService } from '../../src/services/wcService';

// 호스트 모듈이 로드될 때 등록한 딥링크 리스너
const emitLink = (Linking.addEventListener as jest.Mock).mock.calls.find(
  call => call[0] === 'url',
)?.[1] as (event: { url: string }) => void;

type Handler = (payload: unknown) => void;
let kitHandlers: Record<string, Handler>;
let sessions: Record<string, any>;
let kit: any;

function makeSession(chains: string[]) {
  return {
    topic: 'session',
    peer: {
      metadata: { name: 'dapp', url: 'https://dapp.example', icons: [] },
    },
    namespaces: {
      eip155: {
        chains,
        methods: [
          'personal_sign',
          'eth_sendTransaction',
          'wallet_switchEthereumChain',
          'wallet_addEthereumChain',
        ],
        events: ['chainChanged', 'accountsChanged'],
        accounts: chains.map(chain => `${chain}:${ADDRESS}`),
      },
    },
    expiry: 9999999999,
  };
}

function resetService() {
  const service = wcService as any;
  service.walletKit = null;
  service.initializationPromise = null;
  service.status = 'idle';
  service.proposalListeners.clear();
  service.requestListeners.clear();
  service.expiredListeners.clear();
  service.sessionsListeners.clear();
  service.statusListeners.clear();
  service.bufferedProposals = [];
  service.bufferedRequests = [];
  service.pendingNotices = [];
  service.seenRequestIds = [];
}

const signRequest = (
  id: number,
  message: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  topic: 'session',
  params: {
    chainId: 'eip155:1',
    request: { method: 'personal_sign', params: [message, ADDRESS], ...extra },
  },
  verifyContext: { verified: { validation: 'VALID' } },
});

const sendTransactionRequest = (
  id: number,
  tx: Record<string, unknown>,
  from: string = ADDRESS,
) => ({
  id,
  topic: 'session',
  params: {
    chainId: 'eip155:1',
    request: {
      method: 'eth_sendTransaction',
      params: [{ from, gas: '60000', gasPrice: '1000000000', ...tx }],
    },
  },
  verifyContext: { verified: { validation: 'VALID' } },
});

const approveData = (spender: string, amount: bigint) =>
  `0x095ea7b3${spender.slice(2).toLowerCase().padStart(64, '0')}${amount
    .toString(16)
    .padStart(64, '0')}`;

const realmServices = () =>
  require('../../src/realm/services') as {
    transactionCacheService: { createLocalTransaction: jest.Mock };
  };

const flush = async () => {
  for (let i = 0; i < 5; i += 1)
    await new Promise(resolve => setImmediate(resolve));
};

const ui = () => (
  <ThemeProvider theme={darkTheme}>
    <WalletConnectHost />
  </ThemeProvider>
);

async function mount() {
  const view = render(ui());
  await act(flush);
  return view;
}

async function emit(event: string, payload: unknown) {
  await act(async () => {
    kitHandlers[event](payload);
    await flush();
  });
}

async function setLocked(view: ReturnType<typeof render>, locked: boolean) {
  mockWalletState.isLocked = locked;
  view.rerender(ui());
  await act(flush);
}

beforeEach(() => {
  jest.clearAllMocks();
  resetService();
  mockSignProps = undefined;
  mockPinProps = undefined;
  mockProposalProps = undefined;
  mockChainProps = undefined;
  mockRequiresPin.mockImplementation(() => true);
  mockPrice.mockResolvedValue(2000);
  Object.assign(mockWalletState, {
    hasWallet: true,
    isLocked: false,
    wallets: [{ address: ADDRESS, name: '계정 1', isHD: true }],
    activeWalletIndex: 0,
    activeNetworkChainId: 1,
    networks: [
      { chainId: 1, name: 'Ethereum Mainnet', symbol: 'ETH', rpcUrl: '' },
      { chainId: 137, name: 'Polygon', symbol: 'POL', rpcUrl: '' },
    ],
    setActiveNetwork: mockSetActiveNetwork,
    setActiveWallet: mockSetActiveWallet,
  });
  mockHandleRequest.mockResolvedValue('0xsigned');
  kitHandlers = {};
  sessions = { session: makeSession(['eip155:1']) };
  kit = {
    on: jest.fn((event: string, handler: Handler) => {
      kitHandlers[event] = handler;
    }),
    pair: jest.fn().mockResolvedValue(undefined),
    approveSession: jest.fn().mockResolvedValue({ topic: 'new', expiry: 1 }),
    rejectSession: jest.fn().mockResolvedValue(undefined),
    respondSessionRequest: jest.fn().mockResolvedValue(undefined),
    getActiveSessions: jest.fn(() => sessions),
    disconnectSession: jest.fn().mockResolvedValue(undefined),
    emitSessionEvent: jest.fn().mockResolvedValue(undefined),
    updateSession: jest.fn().mockResolvedValue({}),
    getPendingSessionRequests: jest.fn(() => []),
  };
  const { WalletKit } = require('@reown/walletkit');
  WalletKit.init.mockResolvedValue(kit);
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const rejectedIds = () =>
  kit.respondSessionRequest.mock.calls
    .filter((call: any[]) => call[0].response.error)
    .map((call: any[]) => call[0].response.id);

describe('global request handling', () => {
  it('initializes WalletConnect and handles requests without the WalletConnect screen', async () => {
    await mount();
    const { WalletKit } = require('@reown/walletkit');
    expect(WalletKit.init).toHaveBeenCalled();
    await emit('session_request', signRequest(1, 'hello'));
    expect(mockSignProps.visible).toBe(true);
    expect(mockSignProps.request.id).toBe(1);
    expect(mockSignProps.dAppName).toBe('dapp');
  });

  it('PIN for A signs only A while B waits for its own review', async () => {
    await mount();
    await emit('session_request', signRequest(1, 'reviewed A'));
    act(() => mockSignProps.onApprove());
    expect(mockPinProps.visible).toBe(true);
    await emit('session_request', signRequest(2, 'unreviewed B'));
    expect(mockSignProps.request.id).toBe(1);
    expect(mockSignProps.queuePosition).toEqual({ index: 1, total: 2 });
    await act(async () => {
      mockPinProps.onConfirm();
      await flush();
    });
    expect(mockHandleRequest).toHaveBeenCalledTimes(1);
    expect(mockHandleRequest).toHaveBeenCalledWith(
      'personal_sign',
      ['reviewed A', ADDRESS],
      1,
      expect.any(Function),
    );
    expect(mockSignProps.request.id).toBe(2);
    expect(mockSignProps.queuePosition).toBeUndefined();
  });

  it('copies incoming request arguments and rejects repeated confirmation', async () => {
    await mount();
    const incoming = signRequest(1, 'original');
    await emit('session_request', incoming);
    act(() => mockSignProps.onApprove());
    incoming.params.request.params[0] = 'mutated';
    const confirm = mockPinProps.onConfirm;
    await act(async () => {
      confirm();
      confirm();
      await flush();
    });
    expect(mockHandleRequest).toHaveBeenCalledTimes(1);
    expect(mockHandleRequest.mock.calls[0][1][0]).toBe('original');
  });

  test.each(['cancel', 'unmount', 'disconnected', 'expired', 'locked'])(
    'does not sign after %s during PIN verification',
    async action => {
      const view = await mount();
      await emit('session_request', signRequest(1, 'A'));
      act(() => mockSignProps.onApprove());
      const confirm = mockPinProps.onConfirm;
      if (action === 'cancel') act(() => mockPinProps.onCancel());
      if (action === 'unmount') view.unmount();
      if (action === 'disconnected')
        jest.spyOn(wcService, 'validateSessionRequest').mockReturnValue(false);
      if (action === 'locked') await setLocked(view, true);
      const now =
        action === 'expired'
          ? jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 600_000)
          : undefined;
      await act(async () => {
        confirm();
        await flush();
      });
      expect(mockHandleRequest).not.toHaveBeenCalled();
      now?.mockRestore();
    },
  );

  it('passes the USD value of eth_sendTransaction to the PIN policy', async () => {
    mockRequiresPin.mockImplementation(() => false);
    await mount();
    await emit('session_request', {
      id: 9,
      topic: 'session',
      params: {
        chainId: 'eip155:1',
        request: {
          method: 'eth_sendTransaction',
          params: [
            {
              from: ADDRESS,
              to: '0x0987654321098765432109876543210987654321',
              value: '500000000000000000',
              gas: '21000',
              gasPrice: '1000000000',
            },
          ],
        },
      },
      verifyContext: { verified: { validation: 'VALID' } },
    });
    expect(mockSignProps.request.id).toBe(9);
    await act(async () => {
      mockSignProps.onApprove();
      await flush();
    });
    expect(mockPrice).toHaveBeenCalledWith(1);
    expect(mockRequiresPin).toHaveBeenCalledWith(1000);
    expect(mockHandleRequest).toHaveBeenCalledTimes(1);
  });

  it('never tells the dApp USER_REJECTED once a transaction was broadcast', async () => {
    mockRequiresPin.mockImplementation(() => false);
    mockHandleRequest.mockResolvedValue(TX_HASH);
    await mount();
    // dApp 세션 삭제/SDK 만료/릴레이 오류로 결과 전달만 실패하는 경우
    kit.respondSessionRequest.mockImplementation(({ response }: any) =>
      response.error
        ? Promise.resolve()
        : Promise.reject(new Error('No matching key')),
    );
    await emit(
      'session_request',
      sendTransactionRequest(21, {
        to: '0x0987654321098765432109876543210987654321',
        value: '1000',
      }),
    );
    await act(async () => {
      mockSignProps.onApprove();
      await flush();
    });
    expect(mockHandleRequest).toHaveBeenCalledTimes(1);
    expect(rejectedIds()).toEqual([]);
    expect(Alert.alert).toHaveBeenCalledWith(
      '트랜잭션 제출됨',
      expect.stringContaining('네트워크에 제출되었지만 dApp에 결과를 전달하지 못했습니다'),
    );
    expect(Alert.alert).not.toHaveBeenCalledWith('서명 실패', expect.anything());
    // 거래는 활동 탭과 상태 알림이 추적할 수 있도록 기록된다.
    expect(
      realmServices().transactionCacheService.createLocalTransaction,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ hash: TX_HASH, type: 'send', chainId: 1 }),
    );
    expect(mockSignProps.request).toBeNull();
  });

  it('records a dApp approve as an approval without delaying the dApp response', async () => {
    mockRequiresPin.mockImplementation(() => false);
    mockHandleRequest.mockResolvedValue(TX_HASH);
    const { createLocalTransaction } = realmServices().transactionCacheService;
    // Realm 쓰기가 끝나지 않아도 dApp 응답은 보내야 한다.
    createLocalTransaction.mockImplementationOnce(() => new Promise(() => {}));
    await mount();
    await emit(
      'session_request',
      sendTransactionRequest(22, {
        to: USDC,
        value: '0x0',
        data: approveData(SPENDER, 2n ** 256n - 1n),
      }),
    );
    await act(async () => {
      mockSignProps.onApprove();
      await flush();
    });
    expect(createLocalTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        hash: TX_HASH,
        chainId: 1,
        from: ADDRESS,
        to: USDC,
        type: 'approve',
        tokenAddress: USDC,
        tokenSymbol: 'USDC',
        method: 'wc:dapp',
      }),
    );
    expect(kit.respondSessionRequest).toHaveBeenCalledWith({
      topic: 'session',
      response: { id: 22, jsonrpc: '2.0', result: TX_HASH },
    });
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('트랜잭션을 네트워크에 제출했습니다 (0xabab…abab)'),
      'success',
      expect.any(Number),
    );
  });

  it('reconciles pending transactions after recording a dApp transaction', async () => {
    mockRequiresPin.mockImplementation(() => false);
    mockHandleRequest.mockResolvedValue(TX_HASH);
    await mount();
    await emit(
      'session_request',
      sendTransactionRequest(23, { to: USDC, data: '0x12345678' }),
    );
    await act(async () => {
      mockSignProps.onApprove();
      await flush();
    });
    expect(
      realmServices().transactionCacheService.createLocalTransaction,
    ).toHaveBeenCalledWith(expect.objectContaining({ type: 'contract' }));
    expect(mockReconcile).toHaveBeenCalled();
  });

  it('still rejects and reports a failure that happens before signing', async () => {
    mockRequiresPin.mockImplementation(() => false);
    mockHandleRequest.mockRejectedValueOnce(new Error('잔액이 부족합니다.'));
    await mount();
    await emit('session_request', signRequest(24, 'hello'));
    await act(async () => {
      mockSignProps.onApprove();
      await flush();
    });
    expect(rejectedIds()).toContain(24);
    expect(Alert.alert).toHaveBeenCalledWith('서명 실패', '잔액이 부족합니다.');
    expect(
      realmServices().transactionCacheService.createLocalTransaction,
    ).not.toHaveBeenCalled();
  });

  it('shows a failure that finishes after an auto-lock as a held toast, not an Alert over the lock screen', async () => {
    mockRequiresPin.mockImplementation(() => false);
    let fail: ((error: Error) => void) | undefined;
    mockHandleRequest.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          fail = reject;
        }),
    );
    const view = await mount();
    await emit('session_request', signRequest(25, 'hello'));
    await act(async () => {
      mockSignProps.onApprove();
      await flush();
    });
    expect(mockHandleRequest).toHaveBeenCalledTimes(1);
    await setLocked(view, true);
    await act(async () => {
      fail?.(new Error('서명 승인이 취소되었습니다.'));
      await flush();
    });
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('서명 실패'),
      'error',
      expect.any(Number),
    );
  });

  it('auto-rejects a request that cannot be safely reviewed and tells the user', async () => {
    await mount();
    jest.spyOn(wcService, 'validateSessionRequest').mockReturnValue(false);
    await emit('session_request', signRequest(3, 'out of scope'));
    expect(rejectedIds()).toContain(3);
    expect(mockSignProps.request).toBeNull();
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('안전하게 확인할 수 없어 자동으로 거부했습니다'),
      'error',
      expect.any(Number),
    );
  });

  it('turns a long viem review error into a short Korean reason', async () => {
    const { EstimateGasExecutionError, InsufficientFundsError } =
      jest.requireActual('viem');
    const signingReview = require('../../src/services/signingReviewService');
    jest
      .spyOn(signingReview, 'prepareSigningRequest')
      .mockRejectedValueOnce(
        new EstimateGasExecutionError(new InsufficientFundsError({}), {
          account: { address: ADDRESS },
          to: USDC,
          data: '0x12345678',
        }),
      );
    await mount();
    await emit(
      'session_request',
      sendTransactionRequest(26, { to: USDC, data: '0x12345678' }),
    );
    expect(rejectedIds()).toContain(26);
    const message = mockShowToast.mock.calls.find(call =>
      String(call[0]).includes('자동으로 거부했습니다'),
    )?.[0] as string;
    expect(message).toBe(
      'dapp 요청을 안전하게 확인할 수 없어 자동으로 거부했습니다. (잔액이 부족합니다)',
    );
  });
});

describe('requests for an account that is not active', () => {
  beforeEach(() => {
    mockWalletState.wallets = [
      { address: ADDRESS, name: '계정 1', isHD: true },
      { address: ADDRESS_B, name: '계정 2', isHD: true },
    ];
    mockWalletState.activeWalletIndex = 1;
  });

  it('blocks approval before any PIN prompt and offers to switch accounts', async () => {
    const view = await mount();
    await emit('session_request', signRequest(30, 'for account 1'));
    expect(mockSignProps.request.id).toBe(30);
    expect(mockSignProps.inactiveAccount).toEqual({
      name: '계정 1',
      onSwitch: expect.any(Function),
    });
    act(() => mockSignProps.onApprove());
    expect(mockPinProps.visible).toBe(false);
    expect(mockHandleRequest).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('이 요청은 계정 "계정 1"용입니다'),
      'warning',
      expect.any(Number),
    );
    expect(rejectedIds()).toEqual([]);

    act(() => mockSignProps.inactiveAccount.onSwitch());
    expect(mockSetActiveWallet).toHaveBeenCalledWith(0);
    view.rerender(ui());
    await act(flush);
    expect(mockSignProps.inactiveAccount).toBeUndefined();
    act(() => mockSignProps.onApprove());
    expect(mockPinProps.visible).toBe(true);
  });
});

describe('lock handling', () => {
  it('keeps requests in the service queue while locked and presents them after unlock', async () => {
    mockWalletState.isLocked = true;
    const view = await mount();
    await emit('session_request', signRequest(4, 'while locked'));
    expect(mockSignProps.visible).toBe(false);
    expect(mockSignProps.request).toBeNull();
    expect(wcService.getPendingCounts().requests).toBe(1);

    await setLocked(view, false);
    expect(wcService.getPendingCounts().requests).toBe(0);
    expect(mockSignProps.request.id).toBe(4);
    expect(mockSignProps.visible).toBe(true);
  });

  it('hides a visible request when the wallet locks and shows it again after unlock', async () => {
    const view = await mount();
    await emit('session_request', signRequest(5, 'A'));
    expect(mockSignProps.visible).toBe(true);
    await setLocked(view, true);
    expect(mockSignProps.visible).toBe(false);
    await setLocked(view, false);
    expect(mockSignProps.visible).toBe(true);
    expect(mockSignProps.request.id).toBe(5);
  });

  it('rejects requests that expired while locked with a toast after unlock', async () => {
    mockWalletState.isLocked = true;
    const view = await mount();
    const now = Date.now();
    await emit(
      'session_request',
      signRequest(6, 'stale', { expiryTimestamp: Math.floor(now / 1000) + 30 }),
    );
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now + 60_000);
    await setLocked(view, false);
    expect(rejectedIds()).toContain(6);
    expect(mockSignProps.request).toBeNull();
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('만료'),
      'warning',
      expect.any(Number),
    );
    clock.mockRestore();
  });

  it('pairs a deep link received while locked only after unlock', async () => {
    mockWalletState.isLocked = true;
    const view = await mount();
    const link = `toriwallet://wc?uri=${encodeURIComponent(
      `wc:${'e'.repeat(64)}@2?relay-protocol=irn&symKey=${SYM_KEY}`,
    )}`;
    expect(emitLink).toBeDefined();
    act(() => emitLink({ url: link }));
    await act(flush);
    expect(kit.pair).not.toHaveBeenCalled();

    await setLocked(view, false);
    expect(kit.pair).toHaveBeenCalledWith({
      uri: `wc:${'e'.repeat(64)}@2?relay-protocol=irn&symKey=${SYM_KEY}`,
    });
  });

  it('pairs the same deep link again when the first attempt failed', async () => {
    await mount();
    const pairUri = `wc:${'f'.repeat(64)}@2?relay-protocol=irn&symKey=${SYM_KEY}`;
    kit.pair.mockRejectedValueOnce(new Error('relay unreachable'));
    act(() => emitLink({ url: pairUri }));
    await act(flush);
    expect(kit.pair).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('연결에 실패했습니다'),
      'error',
      5000,
    );
    act(() => emitLink({ url: pairUri }));
    await act(flush);
    expect(kit.pair).toHaveBeenCalledTimes(2);
    // 성공한 뒤에는 같은 링크를 다시 처리하지 않는다.
    act(() => emitLink({ url: pairUri }));
    await act(flush);
    expect(kit.pair).toHaveBeenCalledTimes(2);
  });
});

describe('sessions and chains', () => {
  it('notifies and drops queued requests when the dApp deletes the session', async () => {
    await mount();
    await emit('session_request', signRequest(7, 'A'));
    expect(mockSignProps.request.id).toBe(7);
    sessions = {};
    await emit('session_delete', { id: 1, topic: 'session' });
    expect(mockSignProps.request).toBeNull();
    expect(mockShowToast).toHaveBeenCalledWith(
      'dApp이 연결을 해제했습니다',
      'info',
    );
  });

  it('asks before wallet_switchEthereumChain, then switches and emits chainChanged', async () => {
    sessions = { session: makeSession(['eip155:1', 'eip155:137']) };
    await mount();
    await emit('session_request', {
      id: 10,
      topic: 'session',
      params: {
        chainId: 'eip155:1',
        request: {
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x89' }],
        },
      },
      verifyContext: { verified: { validation: 'VALID' } },
    });
    expect(mockChainProps.visible).toBe(true);
    expect(mockChainProps.toNetworkName).toBe('Polygon');
    expect(mockSetActiveNetwork).not.toHaveBeenCalled();

    await act(async () => {
      await mockChainProps.onApprove();
      await flush();
    });
    expect(mockSetActiveNetwork).toHaveBeenCalledWith(137);
    expect(kit.respondSessionRequest).toHaveBeenCalledWith({
      topic: 'session',
      response: { id: 10, jsonrpc: '2.0', result: null },
    });
    expect(kit.emitSessionEvent).toHaveBeenCalledWith({
      topic: 'session',
      event: { name: 'chainChanged', data: 137 },
      chainId: 'eip155:137',
    });
  });

  const switchRequest = (id: number, chainId: string) => ({
    id,
    topic: 'session',
    params: {
      chainId: 'eip155:1',
      request: {
        method: 'wallet_switchEthereumChain',
        params: [{ chainId }],
      },
    },
    verifyContext: { verified: { validation: 'VALID' } },
  });

  it('adds a new chain to the session only for the account the dApp is connected to', async () => {
    await mount();
    await emit('session_request', switchRequest(12, '0x89'));
    expect(mockChainProps.accountAddress).toBe(ADDRESS);
    expect(mockChainProps.accountName).toBe('계정 1');
    expect(mockChainProps.accountMismatch).toBe(false);
    await act(async () => {
      await mockChainProps.onApprove();
      await flush();
    });
    expect(kit.updateSession).toHaveBeenCalledWith({
      topic: 'session',
      namespaces: {
        eip155: expect.objectContaining({
          chains: ['eip155:1', 'eip155:137'],
          accounts: [`eip155:1:${ADDRESS}`, `eip155:137:${ADDRESS}`],
        }),
      },
    });
    expect(mockSetActiveNetwork).toHaveBeenCalledWith(137);
  });

  it('never exposes another app account to the dApp when switching chains', async () => {
    mockWalletState.wallets = [
      { address: ADDRESS, name: '계정 1', isHD: true },
      { address: ADDRESS_B, name: '계정 2', isHD: true },
    ];
    mockWalletState.activeWalletIndex = 1;
    await mount();
    await emit('session_request', switchRequest(13, '0x89'));
    // 모달은 dApp에 연결된 계정을 보여주고 승인을 막는다.
    expect(mockChainProps.accountAddress).toBe(ADDRESS);
    expect(mockChainProps.accountMismatch).toBe(true);
    expect(mockChainProps.onSwitchAccount).toEqual(expect.any(Function));
    // 그래도 승인이 호출되면 세션을 바꾸지 않고 거부한다.
    await act(async () => {
      await mockChainProps.onApprove();
      await flush();
    });
    expect(kit.updateSession).not.toHaveBeenCalled();
    expect(kit.emitSessionEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({
        event: { name: 'accountsChanged', data: [ADDRESS_B] },
      }),
    );
    expect(mockSetActiveNetwork).not.toHaveBeenCalled();
    expect(rejectedIds()).toContain(13);
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('이 dApp은 계정 "계정 1"에 연결되어 있습니다'),
      'error',
      expect.any(Number),
    );
  });

  it('ignores Android back while a chain switch is being applied', async () => {
    let finishUpdate: (() => void) | undefined;
    kit.updateSession.mockImplementation(
      () =>
        new Promise(resolve => {
          finishUpdate = () => resolve({});
        }),
    );
    await mount();
    await emit('session_request', switchRequest(14, '0x89'));
    let approving: Promise<void> | undefined;
    act(() => {
      approving = mockChainProps.onApprove();
    });
    await act(flush);
    expect(mockChainProps.isProcessing).toBe(true);
    await act(async () => {
      await mockChainProps.onReject();
      await flush();
    });
    expect(rejectedIds()).toEqual([]);
    await act(async () => {
      finishUpdate?.();
      await approving;
      await flush();
    });
    expect(rejectedIds()).toEqual([]);
    expect(kit.respondSessionRequest).toHaveBeenCalledWith({
      topic: 'session',
      response: { id: 14, jsonrpc: '2.0', result: null },
    });
  });

  it('does not time out a chain switch that is already being applied', async () => {
    let finishUpdate: (() => void) | undefined;
    kit.updateSession.mockImplementation(
      () =>
        new Promise(resolve => {
          finishUpdate = () => resolve({});
        }),
    );
    await mount();
    await emit('session_request', switchRequest(15, '0x89'));
    let approving: Promise<void> | undefined;
    act(() => {
      approving = mockChainProps.onApprove();
    });
    await act(flush);
    expect(mockChainProps.isProcessing).toBe(true);
    // 검토 시간이 지나 만료 정리가 돌아도 처리 중인 전환은 거부하지 않는다.
    const later = Date.now() + 600_000;
    jest.spyOn(Date, 'now').mockReturnValue(later);
    await act(() => new Promise<void>(resolve => setTimeout(resolve, 1100)));
    expect(rejectedIds()).toEqual([]);
    expect(mockShowToast).not.toHaveBeenCalledWith(
      expect.stringContaining('시간 초과'),
      'warning',
      expect.any(Number),
    );
    await act(async () => {
      finishUpdate?.();
      await approving;
      await flush();
    });
    expect(rejectedIds()).toEqual([]);
    expect(kit.respondSessionRequest).toHaveBeenCalledWith({
      topic: 'session',
      response: { id: 15, jsonrpc: '2.0', result: null },
    });
  });

  it('rejects switching to a network the wallet does not know', async () => {
    await mount();
    await emit('session_request', {
      id: 11,
      topic: 'session',
      params: {
        chainId: 'eip155:1',
        request: {
          method: 'wallet_addEthereumChain',
          params: [{ chainId: '0x38', chainName: 'BNB' }],
        },
      },
      verifyContext: { verified: { validation: 'VALID' } },
    });
    expect(kit.respondSessionRequest).toHaveBeenCalledWith({
      topic: 'session',
      response: {
        id: 11,
        jsonrpc: '2.0',
        error: { code: 4902, message: 'Unrecognized chain ID' },
      },
    });
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('설정 > 네트워크에서 직접 추가할 수 있습니다'),
      'warning',
      expect.any(Number),
    );
  });

  it('emits chainChanged to matching sessions when the network changes in the app', async () => {
    sessions = { session: makeSession(['eip155:1', 'eip155:137']) };
    const view = await mount();
    mockWalletState.activeNetworkChainId = 137;
    view.rerender(ui());
    await act(flush);
    expect(kit.emitSessionEvent).toHaveBeenCalledWith({
      topic: 'session',
      event: { name: 'chainChanged', data: 137 },
      chainId: 'eip155:137',
    });
  });
});

describe('session proposals', () => {
  const proposal = (required: string[], optional: string[] = []) => ({
    id: 77,
    params: {
      id: 77,
      expiryTimestamp: Math.floor(Date.now() / 1000) + 300,
      relays: [],
      pairingTopic: 'p',
      proposer: {
        publicKey: 'pk',
        metadata: {
          name: 'Swap',
          description: '',
          url: 'https://swap.example',
          icons: [],
        },
      },
      requiredNamespaces: {
        eip155: {
          chains: required,
          methods: ['personal_sign'],
          events: ['chainChanged'],
        },
      },
      optionalNamespaces: optional.length
        ? {
            eip155: {
              chains: optional,
              methods: ['eth_sendTransaction'],
              events: [],
            },
          }
        : {},
    },
    verifyContext: {
      verified: { validation: 'VALID', origin: 'https://swap.example' },
    },
  });

  it('shows the account and every supported chain, then approves them all', async () => {
    await mount();
    await emit(
      'session_proposal',
      proposal(['eip155:1'], ['eip155:137', 'eip155:56']),
    );
    expect(mockProposalProps.visible).toBe(true);
    expect(mockProposalProps.accountAddress).toBe(ADDRESS);
    expect(mockProposalProps.chains).toEqual([
      { chainId: 1, name: 'Ethereum Mainnet', required: true },
      { chainId: 137, name: 'Polygon', required: false },
    ]);
    expect(mockProposalProps.methodLabels).toEqual([
      '트랜잭션 전송 요청',
      '메시지 서명 요청',
    ]);
    await act(async () => {
      await mockProposalProps.onApprove(false);
      await flush();
    });
    const namespaces = kit.approveSession.mock.calls[0][0].namespaces;
    expect(namespaces.eip155.chains).toEqual(['eip155:1', 'eip155:137']);
  });

  it('rejects a proposal that requires an unsupported chain with a clear message', async () => {
    await mount();
    await emit('session_proposal', proposal(['eip155:56']));
    expect(kit.rejectSession).toHaveBeenCalledWith({
      id: 77,
      reason: expect.objectContaining({ code: expect.any(Number) }),
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      '연결할 수 없는 dApp',
      expect.stringContaining('체인 56'),
    );
    expect(mockProposalProps).toBeUndefined();
  });

  it('rejects an optional-only proposal on unsupported chains instead of offering the active network', async () => {
    await mount();
    const input = proposal([], ['eip155:56']);
    input.params.requiredNamespaces = {} as any;
    await emit('session_proposal', input);
    expect(kit.rejectSession).toHaveBeenCalledWith({
      id: 77,
      reason: expect.objectContaining({ message: expect.any(String) }),
    });
    const reason = kit.rejectSession.mock.calls[0][0].reason;
    const { getSdkError } = require('@walletconnect/utils');
    expect(reason).toEqual(getSdkError('UNSUPPORTED_CHAINS'));
    expect(Alert.alert).toHaveBeenCalledWith(
      '연결할 수 없는 dApp',
      expect.stringContaining('요청한 네트워크(체인 56)를 토리월렛이 지원하지 않아'),
    );
    expect(mockProposalProps).toBeUndefined();
    expect(kit.approveSession).not.toHaveBeenCalled();
  });

  it('rejects a proposal that only asks for non-EVM namespaces as an unsupported namespace', async () => {
    await mount();
    const input = proposal([]);
    input.params.requiredNamespaces = {} as any;
    input.params.optionalNamespaces = {
      solana: { chains: ['solana:main'], methods: [], events: [] },
    } as any;
    await emit('session_proposal', input);
    const { getSdkError } = require('@walletconnect/utils');
    expect(kit.rejectSession).toHaveBeenCalledWith({
      id: 77,
      reason: getSdkError('UNSUPPORTED_NAMESPACE_KEY'),
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      '연결할 수 없는 dApp',
      expect.stringContaining('요청한 네트워크(solana'),
    );
    expect(mockProposalProps).toBeUndefined();
  });

  it('does not expire a proposal while its approval is in flight', async () => {
    let finishApprove: (() => void) | undefined;
    kit.approveSession.mockImplementation(
      () =>
        new Promise(resolve => {
          finishApprove = () => resolve({ topic: 'new', expiry: 1 });
        }),
    );
    await mount();
    await emit('session_proposal', proposal(['eip155:1']));
    let approving: Promise<void> | undefined;
    act(() => {
      approving = mockProposalProps.onApprove(false);
    });
    await act(flush);
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 600_000);
    await act(() => new Promise<void>(resolve => setTimeout(resolve, 1100)));
    expect(kit.rejectSession).not.toHaveBeenCalled();
    await act(async () => {
      finishApprove?.();
      await approving;
      await flush();
    });
    expect(kit.rejectSession).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith('Swap에 연결되었습니다.', 'success');
  });

  it('ignores Android back while the connection is being approved', async () => {
    let finishApprove: (() => void) | undefined;
    kit.approveSession.mockImplementation(
      () =>
        new Promise(resolve => {
          finishApprove = () => resolve({ topic: 'new', expiry: 1 });
        }),
    );
    await mount();
    await emit('session_proposal', proposal(['eip155:1']));
    let approving: Promise<void> | undefined;
    act(() => {
      approving = mockProposalProps.onApprove(false);
    });
    await act(flush);
    expect(mockProposalProps.isProcessing).toBe(true);
    await act(async () => {
      await mockProposalProps.onReject();
      await flush();
    });
    expect(kit.rejectSession).not.toHaveBeenCalled();
    await act(async () => {
      finishApprove?.();
      await approving;
      await flush();
    });
    expect(kit.rejectSession).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith('Swap에 연결되었습니다.', 'success');
  });
});
