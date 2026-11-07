/**
 * 스왑 스토어 테스트
 */

import { useSwapStore, resolveSlippage } from '../../src/store/swapStore';

const historyItem = (chainId: number, txHash: string) => ({
  timestamp: Date.now(),
  chainId,
  sellToken: { symbol: 'ETH', address: '0x0', amount: '1.0' },
  buyToken: { symbol: 'USDC', address: '0x1', amount: '2000' },
  txHash,
  status: 'success' as const,
  rate: '2000',
});

// Zustand store를 테스트하기 위한 설정
const initialState = useSwapStore.getState();

describe('SwapStore', () => {
  beforeEach(() => {
    // 각 테스트 전에 스토어 초기화
    useSwapStore.setState(initialState);
  });

  describe('History', () => {
    it('should add history item', () => {
      const { addHistoryItem } = useSwapStore.getState();

      addHistoryItem({
        timestamp: Date.now(),
        chainId: 1,
        sellToken: {
          symbol: 'ETH',
          address: '0x0000000000000000000000000000000000000000',
          amount: '1.0',
        },
        buyToken: {
          symbol: 'USDC',
          address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          amount: '2000',
        },
        txHash: '0x123',
        status: 'success',
        rate: '1 ETH = 2000 USDC',
      });

      const { history } = useSwapStore.getState();
      expect(history).toHaveLength(1);
      expect(history[0].sellToken.symbol).toBe('ETH');
      expect(history[0].buyToken.symbol).toBe('USDC');
      expect(history[0].status).toBe('success');
    });

    it('should update history status', () => {
      const { addHistoryItem, updateHistoryStatus } = useSwapStore.getState();

      addHistoryItem({
        timestamp: Date.now(),
        chainId: 1,
        sellToken: {
          symbol: 'ETH',
          address: '0x0000000000000000000000000000000000000000',
          amount: '1.0',
        },
        buyToken: {
          symbol: 'USDC',
          address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          amount: '2000',
        },
        txHash: '0x123',
        status: 'pending',
        rate: '1 ETH = 2000 USDC',
      });

      const { history } = useSwapStore.getState();
      updateHistoryStatus(history[0].id, 'success');

      const updatedState = useSwapStore.getState();
      expect(updatedState.history[0].status).toBe('success');
    });

    it('should clear history', () => {
      const { addHistoryItem, clearHistory } = useSwapStore.getState();

      addHistoryItem({
        timestamp: Date.now(),
        chainId: 1,
        sellToken: {
          symbol: 'ETH',
          address: '0x0000000000000000000000000000000000000000',
          amount: '1.0',
        },
        buyToken: {
          symbol: 'USDC',
          address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          amount: '2000',
        },
        txHash: '0x123',
        status: 'success',
        rate: '1 ETH = 2000 USDC',
      });

      clearHistory();

      const { history } = useSwapStore.getState();
      expect(history).toHaveLength(0);
    });

    it('clears only the given network history', () => {
      const { addHistoryItem, clearHistoryForChain } = useSwapStore.getState();
      addHistoryItem(historyItem(1, '0xmainnet'));
      addHistoryItem(historyItem(137, '0xpolygon'));
      addHistoryItem(historyItem(1, '0xmainnet2'));

      clearHistoryForChain(1);

      const { history } = useSwapStore.getState();
      expect(history.map(item => item.txHash)).toEqual(['0xpolygon']);
    });

    it('should get history by chain', () => {
      const { addHistoryItem, getHistoryByChain } = useSwapStore.getState();

      // Ethereum 메인넷 히스토리
      addHistoryItem({
        timestamp: Date.now(),
        chainId: 1,
        sellToken: { symbol: 'ETH', address: '0x0', amount: '1.0' },
        buyToken: { symbol: 'USDC', address: '0x1', amount: '2000' },
        txHash: '0x123',
        status: 'success',
        rate: '1:2000',
      });

      // Polygon 히스토리
      addHistoryItem({
        timestamp: Date.now(),
        chainId: 137,
        sellToken: { symbol: 'MATIC', address: '0x0', amount: '100' },
        buyToken: { symbol: 'USDC', address: '0x2', amount: '80' },
        txHash: '0x456',
        status: 'success',
        rate: '1:0.8',
      });

      const ethHistory = getHistoryByChain(1);
      const polygonHistory = getHistoryByChain(137);

      expect(ethHistory).toHaveLength(1);
      expect(polygonHistory).toHaveLength(1);
      expect(ethHistory[0].sellToken.symbol).toBe('ETH');
      expect(polygonHistory[0].sellToken.symbol).toBe('MATIC');
    });
  });

  describe('Favorite Pairs', () => {
    it('should add favorite pair', () => {
      const { addFavoritePair } = useSwapStore.getState();

      addFavoritePair({
        chainId: 1,
        sellTokenAddress: '0x0000000000000000000000000000000000000000',
        sellTokenSymbol: 'ETH',
        buyTokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        buyTokenSymbol: 'USDC',
      });

      const { favoritePairs } = useSwapStore.getState();
      expect(favoritePairs).toHaveLength(1);
      expect(favoritePairs[0].sellTokenSymbol).toBe('ETH');
      expect(favoritePairs[0].buyTokenSymbol).toBe('USDC');
    });

    it('should remove favorite pair', () => {
      const { addFavoritePair, removeFavoritePair } = useSwapStore.getState();

      addFavoritePair({
        chainId: 1,
        sellTokenAddress: '0x0000000000000000000000000000000000000000',
        sellTokenSymbol: 'ETH',
        buyTokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        buyTokenSymbol: 'USDC',
      });

      const { favoritePairs } = useSwapStore.getState();
      const pairId = favoritePairs[0]?.id;
      if (pairId) {
        removeFavoritePair(pairId);
      }

      const finalState = useSwapStore.getState();
      expect(finalState.favoritePairs).toHaveLength(0);
    });

    it('should increment pair usage', () => {
      const { addFavoritePair, incrementPairUsage } = useSwapStore.getState();

      addFavoritePair({
        chainId: 1,
        sellTokenAddress: '0x0000',
        sellTokenSymbol: 'ETH',
        buyTokenAddress: '0x0001',
        buyTokenSymbol: 'USDC',
      });

      incrementPairUsage(1, '0x0000', '0x0001');
      incrementPairUsage(1, '0x0000', '0x0001');

      const { favoritePairs } = useSwapStore.getState();
      expect(favoritePairs[0].usageCount).toBeGreaterThan(1);
    });

    it('should get top pairs sorted by usage', () => {
      const { addFavoritePair, incrementPairUsage, getTopPairs } =
        useSwapStore.getState();

      addFavoritePair({
        chainId: 1,
        sellTokenAddress: '0x0001',
        sellTokenSymbol: 'ETH',
        buyTokenAddress: '0x0002',
        buyTokenSymbol: 'USDC',
      });

      addFavoritePair({
        chainId: 1,
        sellTokenAddress: '0x0003',
        sellTokenSymbol: 'WBTC',
        buyTokenAddress: '0x0004',
        buyTokenSymbol: 'ETH',
      });

      // 두 번째 페어 사용량 증가
      incrementPairUsage(1, '0x0003', '0x0004');
      incrementPairUsage(1, '0x0003', '0x0004');

      const topPairs = getTopPairs(1, 5);
      expect(topPairs[0].sellTokenSymbol).toBe('WBTC');
    });
  });

  describe('Settings', () => {
    it('should update default slippage', () => {
      const { updateSettings } = useSwapStore.getState();

      updateSettings({ defaultSlippage: 1.5 });

      const { settings } = useSwapStore.getState();
      expect(settings.defaultSlippage).toBe(1.5);
    });

    it('only keeps settings the 0x flow honors', () => {
      const { updateSettings } = useSwapStore.getState();

      updateSettings({
        defaultSlippage: 1,
        txDeadlineMinutes: 30,
        expertMode: true,
      } as any);

      expect(useSwapStore.getState().settings).toEqual({
        defaultSlippage: 1,
        autoSlippage: true,
      });
    });

    it('rejects out-of-range slippage values', () => {
      const { updateSettings } = useSwapStore.getState();
      updateSettings({ defaultSlippage: 80 });
      expect(useSwapStore.getState().settings.defaultSlippage).toBe(0.5);
      updateSettings({ defaultSlippage: Number.NaN });
      expect(useSwapStore.getState().settings.defaultSlippage).toBe(0.5);
    });

    it('migrates persisted v0 settings by dropping unsupported options', () => {
      const migrate = (useSwapStore as any).persist.getOptions().migrate;
      const migrated = migrate(
        {
          history: [],
          settings: {
            defaultSlippage: 1,
            autoSlippage: false,
            txDeadlineMinutes: 20,
            gasPreference: 'high',
            expertMode: true,
          },
        },
        0,
      );
      expect(migrated.settings).toEqual({
        defaultSlippage: 1,
        autoSlippage: false,
      });
    });

    it('resolves the slippage used for quotes from settings', () => {
      expect(
        resolveSlippage(
          { autoSlippage: false, defaultSlippage: 3 },
          'ETH',
          'USDC',
        ),
      ).toBe(3);
      expect(
        resolveSlippage(
          { autoSlippage: true, defaultSlippage: 3 },
          'ETH',
          'USDC',
        ),
      ).toBe(0.5);
      expect(
        resolveSlippage(
          { autoSlippage: true, defaultSlippage: 3 },
          'USDC',
          'usdt',
        ),
      ).toBe(0.1);
    });

    it('should toggle auto slippage', () => {
      const { updateSettings, settings: initialSettings } =
        useSwapStore.getState();
      const initialAutoSlippage = initialSettings.autoSlippage;

      updateSettings({ autoSlippage: !initialAutoSlippage });

      const { settings } = useSwapStore.getState();
      expect(settings.autoSlippage).toBe(!initialAutoSlippage);
    });

    it('should reset settings to defaults', () => {
      const { updateSettings, resetSettings } = useSwapStore.getState();

      updateSettings({ defaultSlippage: 5, autoSlippage: false });
      resetSettings();

      const { settings } = useSwapStore.getState();
      expect(settings.defaultSlippage).toBe(0.5);
      expect(settings.autoSlippage).toBe(true);
    });
  });

  describe('Recent Tokens', () => {
    it('should add recent token', () => {
      const { addRecentToken, getRecentTokens } = useSwapStore.getState();

      addRecentToken(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');

      const recentTokens = getRecentTokens(1);
      expect(recentTokens).toHaveLength(1);
      expect(recentTokens[0]).toBe(
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      );
    });

    it('should not duplicate recent tokens', () => {
      const { addRecentToken, getRecentTokens } = useSwapStore.getState();
      const tokenAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

      addRecentToken(1, tokenAddress);
      addRecentToken(1, tokenAddress);

      const recentTokens = getRecentTokens(1);
      expect(recentTokens).toHaveLength(1);
    });

    it('should separate tokens by chain', () => {
      const { addRecentToken, getRecentTokens } = useSwapStore.getState();

      addRecentToken(1, '0x1111');
      addRecentToken(137, '0x2222');

      const ethTokens = getRecentTokens(1);
      const polygonTokens = getRecentTokens(137);

      expect(ethTokens).toHaveLength(1);
      expect(polygonTokens).toHaveLength(1);
      expect(ethTokens[0]).toBe('0x1111');
      expect(polygonTokens[0]).toBe('0x2222');
    });
  });
});
