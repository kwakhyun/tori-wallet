/**
 * 토큰 서비스 테스트
 * - 조회 실패를 0으로 위장하지 않는다 (가짜 0 금지)
 * - 테스트넷 자산은 가격이 없다
 * - 사용자 토큰 포함 / 숨긴 토큰 제외
 */

import {
  tokenService,
  Token,
  TokenBalanceError,
} from '../../src/services/tokenService';

const mockGetBalance = jest.fn();
const mockReadContract = jest.fn();

jest.mock('viem', () => {
  const actual = jest.requireActual('viem');
  return {
    ...actual,
    createPublicClient: jest.fn(() => ({
      getBalance: (...args: unknown[]) => mockGetBalance(...args),
      readContract: (...args: unknown[]) => mockReadContract(...args),
    })),
    http: jest.fn(() => 'http-transport'),
  };
});

const mockGetHiddenTokens = jest.fn();
const mockGetCustomTokens = jest.fn();
jest.mock('../../src/realm/services', () => ({
  tokenListService: {
    getHiddenTokens: (...args: unknown[]) => mockGetHiddenTokens(...args),
    getCustomTokens: (...args: unknown[]) => mockGetCustomTokens(...args),
  },
}));

const ADDRESS = '0x1234567890123456789012345678901234567890';
const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const CUSTOM = '0x514910771AF9Ca656af840dff83E8264EcF986CA';

const priceResponse = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  json: jest.fn().mockResolvedValue(body),
});

function token(overrides: Partial<Token>): Token {
  return {
    symbol: 'ETH',
    name: 'Ethereum',
    address: 'native',
    decimals: 18,
    balance: '1',
    balanceRaw: '1',
    price: 0,
    priceChange24h: 0,
    value: 0,
    ...overrides,
  };
}

describe('TokenService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    tokenService.clearCache();
    global.fetch = jest.fn();
    mockGetHiddenTokens.mockResolvedValue([]);
    mockGetCustomTokens.mockResolvedValue([]);
    // 1 ETH, 1000 USDT(6), 0 USDC
    mockGetBalance.mockResolvedValue(10n ** 18n);
    mockReadContract.mockImplementation(({ address }: { address: string }) =>
      Promise.resolve(address === USDT ? 1000n * 10n ** 6n : 0n),
    );
  });

  describe('getTotalValue', () => {
    it('sums only known USD values', () => {
      const tokens = [
        token({ usdValue: 3000, value: 3000 }),
        token({ symbol: 'USDC', usdValue: 500, value: 500 }),
        token({ symbol: 'X', usdValue: null, value: 0, priceAvailable: false }),
      ];
      expect(tokenService.getTotalValue(tokens)).toBe(3500);
    });

    it('falls back to legacy value field and returns 0 for empty list', () => {
      expect(tokenService.getTotalValue([token({ value: 250 })])).toBe(250);
      expect(tokenService.getTotalValue([])).toBe(0);
    });

    it('reports whether the total is complete', () => {
      expect(
        tokenService.isTotalComplete([
          token({ usdValue: 10 }),
          token({ usdValue: null, balanceRaw: '0' }),
        ]),
      ).toBe(true);
      expect(
        tokenService.isTotalComplete([token({ usdValue: null, balanceRaw: '2' })]),
      ).toBe(false);
      expect(
        tokenService.isTotalComplete([token({ balanceError: true })]),
      ).toBe(false);
    });
  });

  describe('getTokens', () => {
    it('returns an empty list for unsupported chains', async () => {
      await expect(tokenService.getTokens(ADDRESS, 999999)).resolves.toEqual(
        [],
      );
    });

    it('fills balances, prices and USD values on success', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        priceResponse({
          ethereum: { usd: 2000, usd_24h_change: 5 },
          tether: { usd: 1, usd_24h_change: 0.1 },
          'usd-coin': { usd: 1, usd_24h_change: 0 },
        }),
      );

      const tokens = await tokenService.getTokens(ADDRESS, 1);
      const eth = tokens.find(t => t.symbol === 'ETH')!;
      const usdt = tokens.find(t => t.symbol === 'USDT')!;

      expect(eth).toMatchObject({
        balance: '1',
        priceAvailable: true,
        usdValue: 2000,
        value: 2000,
        balanceError: false,
        isTestnet: false,
        coingeckoId: 'ethereum',
      });
      expect(usdt.usdValue).toBe(1000);
      expect(usdt.balance).toBe('1,000');
    });

    it('does not fake a zero price when the price request fails', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('API Error'));

      const tokens = await tokenService.getTokens(ADDRESS, 1);
      const eth = tokens.find(t => t.symbol === 'ETH')!;

      // 잔액은 그대로, 가치는 "모름"
      expect(eth.balance).toBe('1');
      expect(eth.priceAvailable).toBe(false);
      expect(eth.usdValue).toBeNull();
      expect(tokenService.isTotalComplete(tokens)).toBe(false);
    });

    it('treats HTTP 429 as a failed price lookup', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        priceResponse({ status: { error_code: 429 } }, false, 429),
      );
      const tokens = await tokenService.getTokens(ADDRESS, 1);
      expect(tokens.every(t => t.priceAvailable === false)).toBe(true);
      expect(tokens.every(t => t.usdValue === null)).toBe(true);
    });

    it('does not cache failed price lookups', async () => {
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce(
          priceResponse({ ethereum: { usd: 2000, usd_24h_change: 1 } }),
        );

      const first = await tokenService.getTokens(ADDRESS, 1);
      expect(first.find(t => t.symbol === 'ETH')!.usdValue).toBeNull();

      const second = await tokenService.getTokens(ADDRESS, 1);
      expect(second.find(t => t.symbol === 'ETH')!.usdValue).toBe(2000);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('caches successful prices', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        priceResponse({
          ethereum: { usd: 2000, usd_24h_change: 5 },
          tether: { usd: 1 },
          'usd-coin': { usd: 1 },
        }),
      );
      await tokenService.getTokens(ADDRESS, 1);
      await tokenService.getTokens(ADDRESS, 1);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('flags a failed balance instead of returning 0', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        priceResponse({ ethereum: { usd: 2000 }, tether: { usd: 1 } }),
      );
      mockReadContract.mockImplementation(({ address }: { address: string }) =>
        address === USDT
          ? Promise.reject(new Error('RPC error'))
          : Promise.resolve(0n),
      );

      const tokens = await tokenService.getTokens(ADDRESS, 1);
      const usdt = tokens.find(t => t.symbol === 'USDT')!;

      expect(usdt.balanceError).toBe(true);
      expect(usdt.balance).toBe('—');
      expect(usdt.usdValue).toBeNull();
      // 다른 토큰은 정상
      expect(tokens.find(t => t.symbol === 'ETH')!.usdValue).toBe(2000);
    });

    it('throws when every balance lookup fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(priceResponse({}));
      mockGetBalance.mockRejectedValue(new Error('RPC down'));
      mockReadContract.mockRejectedValue(new Error('RPC down'));

      await expect(tokenService.getTokens(ADDRESS, 1)).rejects.toBeInstanceOf(
        TokenBalanceError,
      );
    });

    it('never prices testnet assets (Sepolia)', async () => {
      const tokens = await tokenService.getTokens(ADDRESS, 11155111);

      expect(global.fetch).not.toHaveBeenCalled();
      expect(tokens).toHaveLength(1);
      expect(tokens[0]).toMatchObject({
        balance: '1',
        isTestnet: true,
        priceAvailable: false,
        usdValue: null,
        value: 0,
      });
      expect(tokenService.isTestnet(11155111)).toBe(true);
      await expect(tokenService.getPrice('ethereum', 11155111)).resolves.toBe(
        null,
      );
    });

    it('includes visible custom tokens and excludes hidden ones', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(priceResponse({}));
      mockGetHiddenTokens.mockResolvedValue([
        { address: USDT.toLowerCase(), isHidden: true },
      ]);
      mockGetCustomTokens.mockResolvedValue([
        {
          address: CUSTOM.toLowerCase(),
          symbol: 'LINK',
          name: 'Chainlink',
          decimals: 18,
          isHidden: false,
          isSpam: false,
          isCustom: true,
        },
        {
          address: '0x0000000000000000000000000000000000000001',
          symbol: 'HIDDEN',
          name: 'Hidden custom',
          decimals: 18,
          isHidden: true,
          isSpam: false,
          isCustom: true,
        },
      ]);

      const tokens = await tokenService.getTokens(ADDRESS, 1);
      const symbols = tokens.map(t => t.symbol);

      expect(symbols).toContain('LINK');
      expect(symbols).not.toContain('USDT');
      expect(symbols).not.toContain('HIDDEN');
      expect(symbols).toContain('ETH');
      expect(tokens.find(t => t.symbol === 'LINK')!.isCustom).toBe(true);
    });

    it('still returns default tokens when the local token list cannot be read', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(priceResponse({}));
      mockGetHiddenTokens.mockRejectedValue(new Error('realm closed'));

      const tokens = await tokenService.getTokens(ADDRESS, 1);
      expect(tokens.map(t => t.symbol)).toEqual(['ETH', 'USDT', 'USDC']);
    });
  });

  describe('getDefaultTokens', () => {
    it('returns copies of the default token list', () => {
      const tokens = tokenService.getDefaultTokens(1);
      expect(tokens.map(t => t.address)).toEqual(['native', USDT, USDC]);
      tokens[0].symbol = 'CHANGED';
      expect(tokenService.getDefaultTokens(1)[0].symbol).toBe('ETH');
    });
  });

  describe('getTokenMetadata', () => {
    it('rejects invalid addresses before any RPC call', async () => {
      await expect(
        tokenService.getTokenMetadata('0x123', 1),
      ).rejects.toThrow('올바른 컨트랙트 주소');
      expect(mockReadContract).not.toHaveBeenCalled();
    });

    it('reads symbol, name and decimals on-chain', async () => {
      mockReadContract.mockImplementation(
        ({ functionName }: { functionName: string }) =>
          Promise.resolve(
            { symbol: 'LINK', name: 'Chainlink', decimals: 18 }[functionName],
          ),
      );
      await expect(tokenService.getTokenMetadata(CUSTOM, 1)).resolves.toEqual({
        address: CUSTOM,
        symbol: 'LINK',
        name: 'Chainlink',
        decimals: 18,
      });
    });

    it('explains when the address is not an ERC-20 contract', async () => {
      mockReadContract.mockRejectedValue(new Error('execution reverted'));
      await expect(tokenService.getTokenMetadata(CUSTOM, 1)).rejects.toThrow(
        'ERC-20 토큰 정보를 읽을 수 없습니다',
      );
    });
  });
});
