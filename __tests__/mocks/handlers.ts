/**
 * MSW Mock 핸들러
 * API 모킹을 위한 핸들러 정의
 */

import { http, HttpResponse } from 'msw';

// 타입 정의
interface WalletBalance {
  balance: string;
  balanceWei: string;
  symbol: string;
}

interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  balanceRaw: string;
}

interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  timestamp: number;
  status: string;
  type: string;
}

interface GasEstimate {
  gasLimit: string;
  gasPrice: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  estimatedCost: string;
}

interface SendTxRequest {
  to: string;
  value: string;
}

interface SendTxResponse {
  success: boolean;
  hash: string;
  from: string;
  to: string;
  value: string;
}

interface PriceResponse {
  ethereum: {
    usd: number;
    usd_24h_change: number;
  };
}

interface ENSResponse {
  address?: string;
  name?: string;
  error?: string;
}

interface ErrorResponse {
  error: string;
}

// 모킹 지갑 데이터
const mockWalletBalance: WalletBalance = {
  balance: '1.5',
  balanceWei: '1500000000000000000',
  symbol: 'ETH',
};

const mockTokens: Token[] = [
  {
    address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    balance: '1000.00',
    balanceRaw: '1000000000',
  },
  {
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    balance: '500.00',
    balanceRaw: '500000000',
  },
];

const mockTransactions: Transaction[] = [
  {
    hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    from: '0xYourAddress',
    to: '0xRecipientAddress',
    value: '1000000000000000000',
    timestamp: Date.now() - 3600000,
    status: 'success',
    type: 'send',
  },
  {
    hash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    from: '0xSenderAddress',
    to: '0xYourAddress',
    value: '500000000000000000',
    timestamp: Date.now() - 7200000,
    status: 'success',
    type: 'receive',
  },
];

const mockGasEstimate: GasEstimate = {
  gasLimit: '21000',
  gasPrice: '30000000000',
  maxFeePerGas: '35000000000',
  maxPriorityFeePerGas: '2000000000',
  estimatedCost: '0.00063',
};

export const handlers = [
  // 잔액 API
  http.get('*/api/v1/balance/:address', () =>
    HttpResponse.json<WalletBalance>(mockWalletBalance),
  ),

  // 토큰 API
  http.get('*/api/v1/tokens/:address', () =>
    HttpResponse.json<{ tokens: Token[] }>({ tokens: mockTokens }),
  ),

  // 트랜잭션 API
  http.get('*/api/v1/transactions/:address', () =>
    HttpResponse.json<{ transactions: Transaction[] }>({
      transactions: mockTransactions,
    }),
  ),

  // 가스 예측 API
  http.post('*/api/v1/gas/estimate', () =>
    HttpResponse.json<GasEstimate>(mockGasEstimate),
  ),

  // 트랜잭션 전송 API
  http.post('*/api/v1/transactions/send', async ({ request }) => {
    const body = (await request.json()) as SendTxRequest;
    return HttpResponse.json<SendTxResponse>({
      success: true,
      hash: '0xnew' + Math.random().toString(36).substring(2, 15),
      from: '0xYourAddress',
      to: body.to,
      value: body.value,
    });
  }),

  // 가격 API (CoinGecko 스타일)
  http.get('*/api/v3/simple/price', () =>
    HttpResponse.json<PriceResponse>({
      ethereum: {
        usd: 2500,
        usd_24h_change: 2.5,
      },
    }),
  ),

  // ENS 해석 API
  http.get<{ name: string }>('*/api/v1/ens/resolve/:name', ({ params }) => {
    const { name } = params;
    if (name === 'vitalik.eth') {
      return HttpResponse.json<ENSResponse>({
        address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        name: 'vitalik.eth',
      });
    }
    return HttpResponse.json<ENSResponse>(
      { error: 'ENS name not found' },
      { status: 404 },
    );
  }),
];

// 에러 시나리오 테스트용 핸들러
export const errorHandlers = [
  http.get('*/api/v1/balance/:address', () =>
    HttpResponse.json<ErrorResponse>(
      { error: 'Network error' },
      { status: 500 },
    ),
  ),

  http.post('*/api/v1/transactions/send', () =>
    HttpResponse.json<ErrorResponse>(
      { error: 'Insufficient funds' },
      { status: 400 },
    ),
  ),
];

// 로딩 상태 테스트용 느린 응답 핸들러
export const slowHandlers = [
  http.get('*/api/v1/balance/:address', async () => {
    await new Promise(resolve => setTimeout(resolve, 3000));
    return HttpResponse.json<WalletBalance>(mockWalletBalance);
  }),
];
