/**
 * Tori Wallet - Token List Service Tests
 */

import { tokenListService } from '../../src/realm/services/tokenListService';
import { realmDB } from '../../src/realm/database';

// Realm mock
jest.mock('../../src/realm/database', () => {
  const mockTokens: any[] = [];

  return {
    realmDB: {
      getRealm: jest.fn().mockResolvedValue({
        objects: jest.fn(() => ({
          filtered: jest.fn().mockReturnValue({
            sorted: jest.fn().mockReturnValue(mockTokens),
            length: mockTokens.length,
            [Symbol.iterator]: function* () {
              yield* mockTokens;
            },
          }),
          sorted: jest.fn().mockReturnValue(mockTokens),
          length: mockTokens.length,
        })),
        objectForPrimaryKey: jest.fn((schemaName: string, id: string) => {
          return mockTokens.find(t => t.id === id) || null;
        }),
        create: jest.fn((schemaName: string, obj: any) => {
          mockTokens.push(obj);
          return obj;
        }),
        write: jest.fn((callback: () => void) => callback()),
        delete: jest.fn(),
      }),
      deleteAllOf: jest.fn().mockResolvedValue(undefined),
    },
  };
});

describe('TokenListService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('addToken', () => {
    it('should add a new token', async () => {
      const input = {
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        chainId: 1,
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
      };

      const result = await tokenListService.addToken(input);

      expect(result).toBeDefined();
      expect(result.symbol).toBe('USDC');
      expect(result.decimals).toBe(6);
      expect(result.isHidden).toBe(false);
      expect(result.isSpam).toBe(false);
    });

    it('should mark custom tokens correctly', async () => {
      const input = {
        address: '0x1234567890123456789012345678901234567890',
        chainId: 1,
        symbol: 'CUSTOM',
        name: 'Custom Token',
        decimals: 18,
        isCustom: true,
      };

      const result = await tokenListService.addToken(input);

      expect(result.isCustom).toBe(true);
    });
  });

  describe('addTokensBatch', () => {
    it('should add multiple tokens', async () => {
      const tokens = [
        {
          address: 'native',
          chainId: 1,
          symbol: 'ETH',
          name: 'Ethereum',
          decimals: 18,
        },
        {
          address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
          chainId: 1,
          symbol: 'USDT',
          name: 'Tether USD',
          decimals: 6,
        },
      ];

      const addedCount = await tokenListService.addTokensBatch(tokens);

      expect(addedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getVisibleTokens', () => {
    it('should return visible tokens for chain', async () => {
      const result = await tokenListService.getVisibleTokens(1);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getHiddenTokens', () => {
    it('should return hidden tokens', async () => {
      const result = await tokenListService.getHiddenTokens(1);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getSpamTokens', () => {
    it('should return spam tokens', async () => {
      const result = await tokenListService.getSpamTokens();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('searchTokens', () => {
    it('should search tokens by query', async () => {
      const result = await tokenListService.searchTokens('ETH', 1);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('count', () => {
    it('should return token count', async () => {
      const count = await tokenListService.count(1);
      expect(typeof count).toBe('number');
    });
  });

  describe('deleteAll', () => {
    it('should call deleteAllOf with TokenList', async () => {
      await tokenListService.deleteAll();
      expect(realmDB.deleteAllOf).toHaveBeenCalledWith('TokenList');
    });
  });
});
