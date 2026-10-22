import AsyncStorage from '@react-native-async-storage/async-storage';
import { PortfolioAnalyticsService } from '../../src/services/portfolioAnalyticsService';
import type { Token } from '../../src/services/tokenService';

const data = new Map<string, string>();
const token = (value: number) =>
  [{ symbol: 'ETH', balance: '1', value }] as Token[];
beforeEach(() => {
  data.clear();
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockImplementation(
    async (key: string) => data.get(key) ?? null,
  );
  (AsyncStorage.setItem as jest.Mock).mockImplementation(
    async (key: string, value: string) => {
      data.set(key, value);
    },
  );
  (AsyncStorage.getAllKeys as jest.Mock).mockImplementation(async () => [
    ...data.keys(),
  ]);
  (AsyncStorage.removeItem as jest.Mock).mockImplementation(
    async (key: string) => {
      data.delete(key);
    },
  );
});

it('isolates wallets and networks and normalizes address casing', async () => {
  const service = new PortfolioAnalyticsService();
  await service.saveSnapshot('Wallet-A', 1, token(100));
  await service.saveSnapshot('Wallet-B', 1, token(900));
  await service.saveSnapshot('Wallet-A', 137, token(50));
  expect((await service.getHistory('wallet-a', 1))[0].totalValue).toBe(100);
  expect((await service.getHistory('Wallet-B', 1))[0].totalValue).toBe(900);
  expect((await service.getHistory('Wallet-A', 137))[0].totalValue).toBe(50);
  service.clearCache();
  expect((await service.getHistory('Wallet-A', 1))[0].totalValue).toBe(100);
});

it('returns copies and serializes overlapping saves per wallet', async () => {
  const service = new PortfolioAnalyticsService();
  await Promise.all([
    service.saveSnapshot('a', 1, token(1)),
    service.saveSnapshot('a', 1, token(2)),
    service.saveSnapshot('b', 1, token(3)),
  ]);
  const result = await service.getHistory('a', 1);
  expect(result[0].totalValue).toBe(2);
  result[0].totalValue = -1;
  result[0].tokens[0].balance = '999';
  expect((await service.getHistory('a', 1))[0]).toMatchObject({
    totalValue: 2,
    tokens: [{ balance: '1' }],
  });
  expect((await service.getHistory('b', 1))[0].totalValue).toBe(3);
});

it('clears persisted history and cache on reset while preserving unrelated settings', async () => {
  const service = new PortfolioAnalyticsService();
  data.set('setting', 'keep');
  const write = service.saveSnapshot('a', 1, token(1));
  await service.clearHistory();
  await write;
  expect(data).toEqual(new Map([['setting', 'keep']]));
  expect(await service.getHistory('a', 1)).toEqual([]);
});

it('does not recreate history when old snapshot work finishes during a reset', async () => {
  const service = new PortfolioAnalyticsService();
  let release!: () => void;
  (AsyncStorage.getAllKeys as jest.Mock).mockImplementationOnce(
    () =>
      new Promise(resolve => {
        release = () => resolve([...data.keys()]);
      }),
  );
  const reset = service.clearHistory();
  await Promise.resolve();
  await service.saveSnapshot('old-wallet', 1, token(100));
  release();
  await reset;
  expect(await service.getHistory('old-wallet', 1)).toEqual([]);
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});
