/**
 * 커스텀 네트워크 검증/레지스트리 및 chainClient 연동 테스트
 */

import {
  customNetworkRegistry,
  isHttpsUrl,
  toViemChain,
  validateCustomNetworkInput,
} from '../../src/services/customNetworks';
import { chainClient } from '../../src/services/chainClient';
import {
  useWalletStore,
  BUILT_IN_CHAIN_IDS,
} from '../../src/store/walletStore';

const BSC = {
  chainId: 56,
  name: 'BNB Smart Chain',
  rpcUrl: 'https://bsc-dataseed.binance.org',
  symbol: 'BNB',
  blockExplorerUrl: 'https://bscscan.com',
  isTestnet: false,
};

const validInput = {
  name: ' BNB Smart Chain ',
  rpcUrl: 'https://bsc-dataseed.binance.org',
  chainId: '56',
  symbol: 'bnb',
  blockExplorerUrl: 'https://bscscan.com/',
  isTestnet: false,
};

describe('validateCustomNetworkInput', () => {
  it('normalizes a valid network', () => {
    const result = validateCustomNetworkInput(validInput, [1, 11155111], []);
    expect(result).toEqual({
      ok: true,
      network: { ...BSC },
    });
  });

  it('requires https RPC and explorer URLs', () => {
    expect(isHttpsUrl('https://rpc.example.com/v1/KEY')).toBe(true);
    expect(isHttpsUrl('https://rpc.example.com:8545')).toBe(true);
    expect(isHttpsUrl('http://rpc.example.com')).toBe(false);
    expect(isHttpsUrl('https://user:pass@rpc.example.com')).toBe(false);
    expect(isHttpsUrl('data:text/html,hi')).toBe(false);

    const result = validateCustomNetworkInput(
      {
        ...validInput,
        rpcUrl: 'http://bsc-dataseed.binance.org',
        blockExplorerUrl: 'ftp://bscscan.com',
      },
      [],
      [],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.rpcUrl).toContain('https://');
      expect(result.errors.blockExplorerUrl).toContain('https://');
    }
  });

  it('rejects duplicates of built-in and existing chain IDs', () => {
    const builtIn = validateCustomNetworkInput(
      { ...validInput, chainId: '1' },
      BUILT_IN_CHAIN_IDS,
      [],
    );
    expect(builtIn.ok).toBe(false);
    if (!builtIn.ok) expect(builtIn.errors.chainId).toContain('기본');

    const existing = validateCustomNetworkInput(validInput, [1], [1, 56]);
    expect(existing.ok).toBe(false);
    if (!existing.ok) expect(existing.errors.chainId).toContain('이미 추가');
  });

  it('validates chain ID, name and symbol formats', () => {
    const result = validateCustomNetworkInput(
      { ...validInput, name: '', chainId: '0x38', symbol: 'TOO-LONG-SYMBOL' },
      [],
      [],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.name).toBeDefined();
      expect(result.errors.chainId).toBeDefined();
      expect(result.errors.symbol).toBeDefined();
    }
    const zero = validateCustomNetworkInput(
      { ...validInput, chainId: '0' },
      [],
      [],
    );
    expect(zero.ok).toBe(false);
  });
});

describe('custom networks in chainClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    customNetworkRegistry.set([]);
  });

  it('builds a viem chain definition', () => {
    const chain = toViemChain(BSC);
    expect(chain.id).toBe(56);
    expect(chain.nativeCurrency.symbol).toBe('BNB');
    expect(chain.rpcUrls.default.http).toEqual([BSC.rpcUrl]);
    expect(chain.blockExplorers?.default.url).toBe(BSC.blockExplorerUrl);
  });

  it('creates clients only for registered custom chains', () => {
    expect(() => chainClient.getClient(56)).toThrow('Unsupported chain');
    expect(chainClient.isSupportedChain(56)).toBe(false);

    customNetworkRegistry.set([BSC]);

    const client = chainClient.getClient(56);
    expect(client.chain?.id).toBe(56);
    expect(chainClient.getRpcUrl(56)).toBe(BSC.rpcUrl);
    expect(chainClient.isCustomChain(56)).toBe(true);
    expect(chainClient.getSupportedChainIds()).toContain(56);
    expect(chainClient.getChainInfo(56)).toEqual({
      name: 'BNB Smart Chain',
      isTestnet: false,
    });

    customNetworkRegistry.set([]);
    expect(() => chainClient.getClient(56)).toThrow('Unsupported chain');
  });

  it('accepts an RPC only when eth_chainId matches', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ jsonrpc: '2.0', id: 1, result: '0x38' }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(chainClient.verifyRpcChainId(BSC.rpcUrl, 56)).resolves.toEqual(
      { ok: true },
    );
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { method: string; body: string },
    ];
    expect(url).toBe(BSC.rpcUrl);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body).method).toBe('eth_chainId');

    await expect(chainClient.verifyRpcChainId(BSC.rpcUrl, 97)).resolves.toEqual(
      { ok: false, reason: 'mismatch', actualChainId: 56 },
    );
  });

  it('reports unreachable or malformed RPC responses', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('Network request failed');
    }) as unknown as typeof fetch;
    await expect(
      chainClient.verifyRpcChainId(BSC.rpcUrl, 56),
    ).resolves.toMatchObject({ ok: false, reason: 'unreachable' });

    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ error: { message: 'nope' } }),
    })) as unknown as typeof fetch;
    await expect(
      chainClient.verifyRpcChainId(BSC.rpcUrl, 56),
    ).resolves.toMatchObject({ ok: false, reason: 'unreachable' });

    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    await expect(
      chainClient.verifyRpcChainId(BSC.rpcUrl, 56),
    ).resolves.toMatchObject({ ok: false, reason: 'unreachable' });
  });

  it('times out slow RPC endpoints', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(
      () => new Promise(() => undefined),
    ) as unknown as typeof fetch;
    const check = chainClient.fetchChainId(BSC.rpcUrl, 1000);
    jest.advanceTimersByTime(1001);
    await expect(check).rejects.toThrow('시간 초과');
    jest.useRealTimers();
  });
});

describe('walletStore custom networks', () => {
  const initial = useWalletStore.getState();

  beforeEach(() => {
    useWalletStore.setState(initial);
  });

  afterEach(() => {
    customNetworkRegistry.set([]);
  });

  it('registers added networks with the chain registry and marks them custom', () => {
    useWalletStore.getState().addNetwork(BSC);
    const added = useWalletStore
      .getState()
      .networks.find(network => network.chainId === 56);
    expect(added?.isCustom).toBe(true);
    expect(customNetworkRegistry.get(56)?.rpcUrl).toBe(BSC.rpcUrl);
    expect(chainClient.getClient(56).chain?.id).toBe(56);
  });

  it('rejects duplicates of built-in and already added chain IDs', () => {
    expect(() =>
      useWalletStore.getState().addNetwork({ ...BSC, chainId: 1 }),
    ).toThrow('기본');
    useWalletStore.getState().addNetwork(BSC);
    expect(() => useWalletStore.getState().addNetwork(BSC)).toThrow(
      '이미 추가',
    );
  });

  it('removes only custom networks and falls back from an active one', () => {
    const { addNetwork, setActiveNetwork, removeNetwork } =
      useWalletStore.getState();
    addNetwork(BSC);
    setActiveNetwork(56);
    expect(useWalletStore.getState().activeNetworkChainId).toBe(56);

    expect(() => removeNetwork(1)).toThrow();
    removeNetwork(56);

    const state = useWalletStore.getState();
    expect(state.networks.some(network => network.chainId === 56)).toBe(false);
    expect(state.activeNetworkChainId).toBe(11155111);
    expect(customNetworkRegistry.has(56)).toBe(false);
  });

  it('ignores switching to an unknown network', () => {
    useWalletStore.getState().setActiveNetwork(999999);
    expect(useWalletStore.getState().activeNetworkChainId).toBe(
      initial.activeNetworkChainId,
    );
  });

  it('keeps built-in definitions current and custom networks when rehydrating', () => {
    const merge = useWalletStore.persist.getOptions().merge!;
    const merged = merge(
      {
        networks: [
          {
            chainId: 1,
            name: 'Old mainnet',
            rpcUrl: 'https://stale.example',
            symbol: 'ETH',
          },
          { ...BSC, isCustom: undefined },
        ],
        activeNetworkChainId: 56,
        wallets: [],
        activeWalletIndex: 4,
      },
      useWalletStore.getState(),
    );
    expect(merged.networks.find(n => n.chainId === 1)?.rpcUrl).not.toBe(
      'https://stale.example',
    );
    expect(merged.networks.find(n => n.chainId === 56)?.isCustom).toBe(true);
    expect(merged.activeNetworkChainId).toBe(56);
    expect(merged.activeWalletIndex).toBe(0);
  });
});
