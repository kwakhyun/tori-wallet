/**
 * WalletConnect 서비스: 요청 큐/다중 구독/만료/세션 이벤트/설정 누락/URI 검증
 */

import Config from 'react-native-config';
import {
  wcService,
  parseWalletConnectUri,
  WalletConnectError,
  WC_NOT_CONFIGURED_MESSAGE,
} from '../../src/services/wcService';

const ADDRESS = '0x1234567890123456789012345678901234567890';
const SYM_KEY = 'a'.repeat(64);
const VALID_URI = `wc:${'b'.repeat(64)}@2?relay-protocol=irn&symKey=${SYM_KEY}`;

type Handler = (payload: unknown) => void;

function createKit(sessions: Record<string, unknown> = {}) {
  const handlers: Record<string, Handler> = {};
  return {
    handlers,
    kit: {
      on: jest.fn((event: string, handler: Handler) => {
        handlers[event] = handler;
      }),
      pair: jest.fn().mockResolvedValue(undefined),
      approveSession: jest.fn().mockResolvedValue({ topic: 'new-topic' }),
      rejectSession: jest.fn().mockResolvedValue(undefined),
      respondSessionRequest: jest.fn().mockResolvedValue(undefined),
      getActiveSessions: jest.fn(() => sessions),
      disconnectSession: jest.fn().mockResolvedValue(undefined),
      emitSessionEvent: jest.fn().mockResolvedValue(undefined),
      updateSession: jest.fn().mockResolvedValue({ acknowledged: jest.fn() }),
      getPendingSessionRequests: jest.fn(() => []),
    },
  };
}

function session(
  topic: string,
  chains: string[],
  events = ['chainChanged', 'accountsChanged'],
) {
  return {
    topic,
    peer: {
      metadata: {
        name: `dApp ${topic}`,
        url: `https://${topic}.example`,
        icons: [],
      },
    },
    namespaces: {
      eip155: {
        chains,
        methods: ['personal_sign', 'wallet_switchEthereumChain'],
        events,
        accounts: chains.map(chain => `${chain}:${ADDRESS}`),
      },
    },
    expiry: 9999999999,
  };
}

function request(id: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    topic: 'topic-1',
    params: {
      chainId: 'eip155:1',
      request: { method: 'personal_sign', params: ['hi', ADDRESS], ...extra },
    },
    verifyContext: { verified: { validation: 'VALID' } },
  };
}

function resetService() {
  const service = wcService as any;
  service.walletKit = null;
  service.initializationPromise = null;
  service.status = 'idle';
  service.lastError = null;
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

async function initWith(kitBundle: ReturnType<typeof createKit>) {
  const { WalletKit } = require('@reown/walletkit');
  WalletKit.init.mockResolvedValue(kitBundle.kit);
  await wcService.initialize();
  return kitBundle;
}

beforeEach(() => {
  jest.clearAllMocks();
  resetService();
  (Config as any).WALLETCONNECT_PROJECT_ID = 'test_project_id';
});

afterEach(() => {
  jest.restoreAllMocks();
  resetService();
});

describe('request queue', () => {
  it('buffers requests that arrive before any subscriber and delivers them on subscribe', async () => {
    const { handlers } = await initWith(createKit());
    handlers.session_request(request(1));
    handlers.session_request(request(2));
    expect(wcService.getPendingCounts().requests).toBe(2);

    const listener = jest.fn();
    wcService.onSessionRequest(listener);
    expect(listener.mock.calls.map(call => call[0].id)).toEqual([1, 2]);
    expect(wcService.getPendingCounts().requests).toBe(0);
  });

  it('delivers live requests to every subscriber and stops after unsubscribe', async () => {
    const { handlers } = await initWith(createKit());
    const first = jest.fn();
    const second = jest.fn();
    const unsubscribeFirst = wcService.onSessionRequest(first);
    wcService.onSessionRequest(second);

    handlers.session_request(request(3));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    unsubscribeFirst();
    handlers.session_request(request(4));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it('ignores a duplicated request id (live event + recovered pending request)', async () => {
    const bundle = createKit();
    bundle.kit.getPendingSessionRequests.mockReturnValue([request(5)] as any);
    const { handlers } = await initWith(bundle);
    handlers.session_request(request(5));
    const listener = jest.fn();
    wcService.onSessionRequest(listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('rejects requests that expire while waiting and reports them once a listener exists', async () => {
    const { kit, handlers } = await initWith(createKit());
    const now = Date.now();
    handlers.session_request(
      request(6, { expiryTimestamp: Math.floor(now / 1000) + 30 }),
    );
    jest.spyOn(Date, 'now').mockReturnValue(now + 31_000);

    const onRequest = jest.fn();
    wcService.onSessionRequest(onRequest);
    expect(onRequest).not.toHaveBeenCalled();
    expect(kit.respondSessionRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'topic-1',
        response: expect.objectContaining({ id: 6, error: expect.any(Object) }),
      }),
    );

    const onExpired = jest.fn();
    wcService.onExpired(onExpired);
    expect(onExpired).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'request', id: 6, source: 'buffer' }),
    );
  });

  it('applies the default 5 minute TTL to requests without an expiry', async () => {
    const { handlers } = await initWith(createKit());
    const now = Date.now();
    handlers.session_request(request(7));
    jest.spyOn(Date, 'now').mockReturnValue(now + 5 * 60_000 + 1);
    expect(wcService.getPendingCounts().requests).toBe(0);
  });

  it('removes a buffered request when the SDK reports its expiry', async () => {
    const { handlers } = await initWith(createKit());
    handlers.session_request(request(8));
    handlers.session_request_expire({ id: 8 });
    const onExpired = jest.fn();
    wcService.onExpired(onExpired);
    expect(onExpired).toHaveBeenCalledWith(
      expect.objectContaining({ id: 8, source: 'buffer' }),
    );
    expect(wcService.getPendingCounts().requests).toBe(0);
  });

  it('buffers proposals until a proposal subscriber exists', async () => {
    const { handlers } = await initWith(createKit());
    handlers.session_proposal({
      id: 11,
      params: { proposer: { metadata: { name: 'A' } } },
    });
    const listener = jest.fn();
    wcService.onSessionProposal(listener);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ id: 11 }));
  });
});

describe('session events', () => {
  it('emits sessionsChanged when the dApp deletes the session', async () => {
    const { handlers } = await initWith(createKit());
    const listener = jest.fn();
    wcService.onSessionsChanged(listener);
    handlers.session_delete({ id: 1, topic: 'gone' });
    expect(listener).toHaveBeenCalledWith({
      reason: 'deleted_by_peer',
      topic: 'gone',
    });
  });

  it('emits sessionsChanged after a local disconnect', async () => {
    await initWith(createKit());
    const listener = jest.fn();
    wcService.onSessionsChanged(listener);
    await wcService.disconnectSession('topic-1');
    expect(listener).toHaveBeenCalledWith({
      reason: 'disconnected',
      topic: 'topic-1',
    });
  });

  it('sends chainChanged only to sessions that include the new chain', async () => {
    const { kit } = await initWith(
      createKit({
        a: session('a', ['eip155:1', 'eip155:137']),
        b: session('b', ['eip155:1']),
        c: session('c', ['eip155:137'], []),
      }),
    );
    const count = await wcService.emitChainChanged(137, ADDRESS);
    expect(count).toBe(1);
    expect(kit.emitSessionEvent).toHaveBeenCalledWith({
      topic: 'a',
      event: { name: 'chainChanged', data: 137 },
      chainId: 'eip155:137',
    });
    expect(kit.emitSessionEvent).toHaveBeenCalledWith({
      topic: 'a',
      event: { name: 'accountsChanged', data: [ADDRESS] },
      chainId: 'eip155:137',
    });
    expect(kit.emitSessionEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'b' }),
    );
    // c는 이벤트를 승인하지 않았다.
    expect(kit.emitSessionEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'c' }),
    );
  });

  it('adds a known chain to the session through updateSession', async () => {
    const { kit } = await initWith(
      createKit({ a: session('a', ['eip155:1']) }),
    );
    await expect(wcService.ensureSessionChain('a', 137)).resolves.toBe(true);
    expect(kit.updateSession).toHaveBeenCalledWith({
      topic: 'a',
      namespaces: {
        eip155: expect.objectContaining({
          chains: ['eip155:1', 'eip155:137'],
          accounts: [`eip155:1:${ADDRESS}`, `eip155:137:${ADDRESS}`],
        }),
      },
    });
  });

  it('adds only the accounts already approved for the session to a new chain', async () => {
    const { kit } = await initWith(
      createKit({ a: session('a', ['eip155:1', 'eip155:10']) }),
    );
    expect(wcService.getSessionAddresses('a')).toEqual([ADDRESS]);
    expect(wcService.sessionHasAddress('a', ADDRESS)).toBe(true);
    expect(
      wcService.sessionHasAddress(
        'a',
        '0x9999999999999999999999999999999999999999',
      ),
    ).toBe(false);
    await wcService.ensureSessionChain('a', 137);
    const accounts =
      kit.updateSession.mock.calls[0][0].namespaces.eip155.accounts;
    expect(accounts).toEqual([
      `eip155:1:${ADDRESS}`,
      `eip155:10:${ADDRESS}`,
      `eip155:137:${ADDRESS}`,
    ]);
  });
});

describe('not configured', () => {
  it('reports not_configured without throwing and refuses to pair with a clear message', async () => {
    (Config as any).WALLETCONNECT_PROJECT_ID = '';
    expect(wcService.isConfigured()).toBe(false);
    expect(wcService.getStatus()).toBe('not_configured');
    await expect(wcService.initialize()).resolves.toBeUndefined();
    expect(wcService.isReady()).toBe(false);

    const error = await wcService.pairWithUri(VALID_URI).catch(e => e);
    expect(error).toBeInstanceOf(WalletConnectError);
    expect(error.code).toBe('not_configured');
    expect(error.message).toBe(WC_NOT_CONFIGURED_MESSAGE);
  });
});

describe('pairWithUri', () => {
  it('initializes and pairs a valid v2 URI', async () => {
    const { kit } = await initWith(createKit());
    await wcService.pairWithUri(`  ${VALID_URI} `);
    expect(kit.pair).toHaveBeenCalledWith({ uri: VALID_URI });
  });

  it('explains v1 links instead of a generic failure', async () => {
    await initWith(createKit());
    await expect(
      wcService.pairWithUri('wc:abc@1?bridge=https%3A%2F%2Fb.example&key=12'),
    ).rejects.toThrow('v1');
  });

  it('maps an already-used pairing to a readable error', async () => {
    const { kit } = await initWith(createKit());
    kit.pair.mockRejectedValueOnce(new Error('Pairing already exists'));
    await expect(wcService.pairWithUri(VALID_URI)).rejects.toThrow(
      '이미 사용된 연결 QR',
    );
  });
});

describe('parseWalletConnectUri', () => {
  it.each([
    ['', 'empty'],
    ['https://example.com', 'not_wc'],
    ['wc:abc@1?bridge=x&key=y', 'v1'],
    ['wc:abc', 'malformed'],
    ['wc:abc@2?relay-protocol=irn', 'malformed'],
    [
      `wc:abc@2?relay-protocol=irn&symKey=${SYM_KEY}&expiryTimestamp=1`,
      'expired',
    ],
  ])('rejects %s as %s', (input, code) => {
    const result = parseWalletConnectUri(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(code);
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });

  it('accepts a valid v2 URI', () => {
    expect(parseWalletConnectUri(VALID_URI)).toMatchObject({
      ok: true,
      uri: VALID_URI,
    });
  });
});
