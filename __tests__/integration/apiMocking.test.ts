/**
 * API Mocking 통합 테스트
 * MSW를 사용한 API 모킹 테스트
 */

import { server } from '../mocks/server';
import { http, HttpResponse } from 'msw';

// 타입 정의
interface BalanceResponse {
  balance: string;
  balanceWei: string;
  symbol: string;
  error?: string;
}

interface TokensResponse {
  tokens: Array<{
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    balance: string;
  }>;
}

interface TransactionsResponse {
  transactions: Array<{
    hash: string;
    from: string;
    to: string;
    value: string;
    timestamp: number;
    status: string;
    type: string;
  }>;
}

interface SendTransactionResponse {
  success: boolean;
  hash: string;
  from: string;
  to: string;
  value: string;
  error?: string;
}

interface ENSResponse {
  address?: string;
  name?: string;
  error?: string;
}

interface GasEstimateResponse {
  gasLimit: string;
  gasPrice: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  estimatedCost: string;
}

interface PriceResponse {
  ethereum: {
    usd: number;
    usd_24h_change: number;
  };
}

describe('MSW Integration', () => {
  // 모든 테스트 전 서버 시작
  beforeAll(() => server.listen());

  // 각 테스트 후 핸들러 리셋
  afterEach(() => server.resetHandlers());

  // 모든 테스트 후 서버 종료
  afterAll(() => server.close());

  describe('Balance API', () => {
    it('should return mock balance', async () => {
      const response = await fetch('/api/v1/balance/0x123');
      const data = (await response.json()) as BalanceResponse;

      expect(data).toEqual({
        balance: '1.5',
        balanceWei: '1500000000000000000',
        symbol: 'ETH',
      });
    });

    it('should handle error response', async () => {
      // 에러 핸들러로 오버라이드
      server.use(
        http.get('*/api/v1/balance/:address', () =>
          HttpResponse.json<{ error: string }>(
            { error: 'Network error' },
            { status: 500 },
          ),
        ),
      );

      const response = await fetch('/api/v1/balance/0x123');
      expect(response.status).toBe(500);

      const data = (await response.json()) as BalanceResponse;
      expect(data.error).toBe('Network error');
    });
  });

  describe('Tokens API', () => {
    it('should return mock tokens', async () => {
      const response = await fetch('/api/v1/tokens/0x123');
      const data = (await response.json()) as TokensResponse;

      expect(data.tokens).toHaveLength(2);
      expect(data.tokens[0].symbol).toBe('USDT');
      expect(data.tokens[1].symbol).toBe('USDC');
    });
  });

  describe('Transactions API', () => {
    it('should return mock transactions', async () => {
      const response = await fetch('/api/v1/transactions/0x123');
      const data = (await response.json()) as TransactionsResponse;

      expect(data.transactions).toHaveLength(2);
      expect(data.transactions[0].type).toBe('send');
      expect(data.transactions[1].type).toBe('receive');
    });

    it('should send transaction successfully', async () => {
      const response = await fetch('/api/v1/transactions/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: '0xRecipient',
          value: '1000000000000000000',
        }),
      });

      const data = (await response.json()) as SendTransactionResponse;
      expect(data.success).toBe(true);
      expect(data.hash).toMatch(/^0xnew/);
    });

    it('should handle insufficient funds error', async () => {
      server.use(
        http.post('*/api/v1/transactions/send', () =>
          HttpResponse.json<{ error: string }>(
            { error: 'Insufficient funds' },
            { status: 400 },
          ),
        ),
      );

      const response = await fetch('/api/v1/transactions/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: '0xRecipient',
          value: '999999999999999999999',
        }),
      });

      expect(response.status).toBe(400);
      const data = (await response.json()) as SendTransactionResponse;
      expect(data.error).toBe('Insufficient funds');
    });
  });

  describe('ENS Resolution API', () => {
    it('should resolve vitalik.eth', async () => {
      const response = await fetch('/api/v1/ens/resolve/vitalik.eth');
      const data = (await response.json()) as ENSResponse;

      expect(data.address).toBe('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
      expect(data.name).toBe('vitalik.eth');
    });

    it('should return 404 for unknown ENS names', async () => {
      const response = await fetch('/api/v1/ens/resolve/unknown.eth');
      expect(response.status).toBe(404);
    });
  });

  describe('Gas Estimation API', () => {
    it('should return gas estimate', async () => {
      const response = await fetch('/api/v1/gas/estimate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: '0xRecipient',
          value: '1000000000000000000',
        }),
      });

      const data = (await response.json()) as GasEstimateResponse;
      expect(data.gasLimit).toBe('21000');
      expect(data.estimatedCost).toBe('0.00063');
    });
  });

  describe('Price API', () => {
    it('should return ETH price', async () => {
      const response = await fetch('/api/v3/simple/price');
      const data = (await response.json()) as PriceResponse;

      expect(data.ethereum.usd).toBe(2500);
      expect(data.ethereum.usd_24h_change).toBe(2.5);
    });
  });
});
