/**
 * 0x API 기반 토큰 스왑 서비스
 */

import {
  formatUnits,
  isAddress,
  keccak256,
  parseUnits,
  toHex,
  type Hex,
} from 'viem';
import { getSwapApiUrl, isSwapApiSupported } from './swapApiConfig';

// 네이티브 토큰 주소 (0x API 표준)
const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
export const ZERO_X_ALLOWANCE_HOLDER =
  '0x0000000000001fF3684f28c67538d4D072C22734';
const QUOTE_MAX_AGE_MS = 90_000;
const HEX_BYTES = /^0x(?:[0-9a-fA-F]{2})+$/;

// 체인별 스왑 가능 토큰 목록
export const SWAP_TOKENS: Record<number, SwapToken[]> = {
  1: [
    {
      symbol: 'ETH',
      name: 'Ethereum',
      address: NATIVE_TOKEN_ADDRESS,
      decimals: 18,
      logoUrl:
        'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      decimals: 6,
      logoUrl: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
    },
    {
      symbol: 'USDT',
      name: 'Tether',
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      decimals: 6,
      logoUrl: 'https://assets.coingecko.com/coins/images/325/small/Tether.png',
    },
    {
      symbol: 'WETH',
      name: 'Wrapped Ether',
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      decimals: 18,
      logoUrl: 'https://assets.coingecko.com/coins/images/2518/small/weth.png',
    },
    {
      symbol: 'DAI',
      name: 'Dai',
      address: '0x6B175474E89094C44Da98b954EescdeCB5C27Eb',
      decimals: 18,
      logoUrl:
        'https://assets.coingecko.com/coins/images/9956/small/dai-multi-collateral-mcd.png',
    },
    {
      symbol: 'WBTC',
      name: 'Wrapped Bitcoin',
      address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      decimals: 8,
      logoUrl:
        'https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png',
    },
  ],
  137: [
    {
      symbol: 'MATIC',
      name: 'Polygon',
      address: NATIVE_TOKEN_ADDRESS,
      decimals: 18,
      logoUrl:
        'https://assets.coingecko.com/coins/images/4713/small/polygon.png',
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      decimals: 6,
      logoUrl: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
    },
    {
      symbol: 'USDT',
      name: 'Tether',
      address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      decimals: 6,
      logoUrl: 'https://assets.coingecko.com/coins/images/325/small/Tether.png',
    },
    {
      symbol: 'WETH',
      name: 'Wrapped Ether',
      address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      decimals: 18,
      logoUrl: 'https://assets.coingecko.com/coins/images/2518/small/weth.png',
    },
  ],
  42161: [
    {
      symbol: 'ETH',
      name: 'Ethereum',
      address: NATIVE_TOKEN_ADDRESS,
      decimals: 18,
      logoUrl:
        'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      decimals: 6,
      logoUrl: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
    },
    {
      symbol: 'USDT',
      name: 'Tether',
      address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      decimals: 6,
      logoUrl: 'https://assets.coingecko.com/coins/images/325/small/Tether.png',
    },
    {
      symbol: 'ARB',
      name: 'Arbitrum',
      address: '0x912CE59144191C1204E64559FE8253a0e49E6548',
      decimals: 18,
      logoUrl:
        'https://assets.coingecko.com/coins/images/16547/small/photo_2023-03-29_21.47.00.jpeg',
    },
  ],
  10: [
    {
      symbol: 'ETH',
      name: 'Ethereum',
      address: NATIVE_TOKEN_ADDRESS,
      decimals: 18,
      logoUrl:
        'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
      decimals: 6,
      logoUrl: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
    },
    {
      symbol: 'OP',
      name: 'Optimism',
      address: '0x4200000000000000000000000000000000000042',
      decimals: 18,
      logoUrl:
        'https://assets.coingecko.com/coins/images/25244/small/Optimism.png',
    },
  ],
  8453: [
    {
      symbol: 'ETH',
      name: 'Ethereum',
      address: NATIVE_TOKEN_ADDRESS,
      decimals: 18,
      logoUrl:
        'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      decimals: 6,
      logoUrl: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
    },
  ],
  // Sepolia 테스트넷
  11155111: [
    {
      symbol: 'ETH',
      name: 'Sepolia ETH',
      address: NATIVE_TOKEN_ADDRESS,
      decimals: 18,
      logoUrl:
        'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
    },
  ],
};

export interface SwapToken {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  logoUrl?: string;
  balance?: string;
}

export interface SwapQuote {
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
  price: string;
  guaranteedPrice: string;
  estimatedPriceImpact: string;
  gas: string;
  gasPrice: string;
  protocolFee: string;
  minimumProtocolFee: string;
  sources: { name: string; proportion: string }[];
  allowanceTarget: string;
  to: string;
  data: string;
  value: string;
  minBuyAmount: string;
  liquidityAvailable: boolean;
  minimumReceived?: string;
  estimatedGasUsd?: string;
  route?: {
    name: string;
    proportion: number;
    fromToken: string;
    toToken: string;
    hops: number;
  }[];
  issues: {
    allowance: { actual: string; spender: string } | null;
    balance: { token: string; actual: string; expected: string } | null;
    simulationIncomplete: boolean;
    invalidSourcesPassed: string[];
  };
  security: {
    intentFingerprint: Hex;
    quoteFingerprint: Hex;
    validatedAt: number;
    chainId: number;
    taker: string;
  };
}

export interface SwapParams {
  sellToken: SwapToken;
  buyToken: SwapToken;
  sellAmount: string;
  slippagePercentage?: number;
  takerAddress: string;
}

interface ZeroXV2QuoteResponse {
  allowanceTarget?: string;
  buyAmount?: string;
  buyToken?: string;
  sellAmount?: string;
  sellToken?: string;
  minBuyAmount?: string;
  liquidityAvailable?: boolean;
  gas?: string;
  gasPrice?: string;
  totalNetworkFee?: string;
  issues?: SwapQuote['issues'];
  route?: {
    fills?: {
      from: string;
      to: string;
      source: string;
      proportionBps: string;
    }[];
  };
  transaction?: {
    to?: string;
    data?: string;
    gas?: string;
    gasPrice?: string;
    value?: string;
  };
}

function addressesEqual(left: string | undefined, right: string): boolean {
  return left?.toLowerCase() === right.toLowerCase();
}

function swapIntentFingerprint(params: SwapParams, chainId: number): Hex {
  const sellAmount = parseUnits(
    params.sellAmount,
    params.sellToken.decimals,
  ).toString();
  return keccak256(
    toHex(
      JSON.stringify([
        chainId,
        params.takerAddress.toLowerCase(),
        params.sellToken.address.toLowerCase(),
        params.buyToken.address.toLowerCase(),
        sellAmount,
        params.slippagePercentage ?? 0.5,
      ]),
    ),
  );
}

function quoteFingerprint(quote: Omit<SwapQuote, 'security'>): Hex {
  return keccak256(
    toHex(
      JSON.stringify([
        quote.sellToken.toLowerCase(),
        quote.buyToken.toLowerCase(),
        quote.sellAmount,
        quote.buyAmount,
        quote.minBuyAmount,
        quote.allowanceTarget.toLowerCase(),
        quote.to.toLowerCase(),
        quote.data.toLowerCase(),
        quote.value,
        quote.gas,
        quote.gasPrice,
      ]),
    ),
  );
}

function parseUnsignedInteger(
  value: string | undefined,
  field: string,
): bigint {
  try {
    if (value === undefined || !/^\d+$/.test(value)) throw new Error('invalid');
    return BigInt(value);
  } catch {
    throw new Error(`스왑 견적의 ${field} 값이 올바르지 않습니다.`);
  }
}

function normalizeAndValidateQuote(
  response: ZeroXV2QuoteResponse,
  params: SwapParams,
  chainId: number,
): SwapQuote {
  if (!isAddress(params.takerAddress)) {
    throw new Error('스왑 실행 계정 주소가 올바르지 않습니다.');
  }
  if (response.liquidityAvailable !== true) {
    throw new Error('스왑 유동성을 확인할 수 없습니다.');
  }

  const expectedSellAmount = parseUnits(
    params.sellAmount,
    params.sellToken.decimals,
  ).toString();
  if (
    !addressesEqual(response.sellToken, params.sellToken.address) ||
    !addressesEqual(response.buyToken, params.buyToken.address) ||
    response.sellAmount !== expectedSellAmount
  ) {
    throw new Error('스왑 견적의 토큰 또는 판매 수량이 요청과 다릅니다.');
  }

  const allowanceTarget = response.allowanceTarget;
  if (!addressesEqual(allowanceTarget, ZERO_X_ALLOWANCE_HOLDER)) {
    throw new Error('공식 0x AllowanceHolder가 아닌 승인 대상은 차단됩니다.');
  }
  const allowanceSpender = response.issues?.allowance?.spender;
  if (
    allowanceSpender &&
    !addressesEqual(allowanceSpender, ZERO_X_ALLOWANCE_HOLDER)
  ) {
    throw new Error('견적의 토큰 승인 대상이 공식 주소와 다릅니다.');
  }
  if (response.issues?.balance) {
    throw new Error('스왑에 필요한 토큰 잔액이 부족합니다.');
  }
  if (response.issues?.simulationIncomplete) {
    throw new Error('0x가 트랜잭션 시뮬레이션을 완료하지 못했습니다.');
  }
  if ((response.issues?.invalidSourcesPassed || []).length > 0) {
    throw new Error('유효하지 않은 유동성 소스가 포함되었습니다.');
  }

  const transaction = response.transaction;
  if (
    !transaction?.to ||
    !isAddress(transaction.to) ||
    !transaction.data ||
    !HEX_BYTES.test(transaction.data) ||
    transaction.data.length < 10
  ) {
    throw new Error('스왑 실행 트랜잭션이 올바르지 않습니다.');
  }

  const isNative = addressesEqual(
    params.sellToken.address,
    NATIVE_TOKEN_ADDRESS,
  );
  if (!isNative && !addressesEqual(transaction.to, ZERO_X_ALLOWANCE_HOLDER)) {
    throw new Error('ERC-20 스왑 실행 대상이 공식 AllowanceHolder가 아닙니다.');
  }

  const value = parseUnsignedInteger(transaction.value || '0', 'value');
  if (
    (isNative && value.toString() !== expectedSellAmount) ||
    (!isNative && value !== 0n)
  ) {
    throw new Error('스왑 트랜잭션의 네이티브 자산 금액이 요청과 다릅니다.');
  }

  const buyAmount = parseUnsignedInteger(response.buyAmount, 'buyAmount');
  const minBuyAmount = parseUnsignedInteger(
    response.minBuyAmount,
    'minBuyAmount',
  );
  if (buyAmount <= 0n || minBuyAmount <= 0n || minBuyAmount > buyAmount) {
    throw new Error('스왑 수령 수량이 올바르지 않습니다.');
  }
  const gas = parseUnsignedInteger(
    transaction.gas || response.gas,
    'gas',
  ).toString();
  const gasPrice = parseUnsignedInteger(
    transaction.gasPrice || response.gasPrice,
    'gasPrice',
  ).toString();

  const fills = response.route?.fills || [];
  const sources = fills.map(fill => ({
    name: fill.source,
    proportion: (Number(fill.proportionBps) / 10_000).toString(),
  }));
  const normalized: Omit<SwapQuote, 'security'> = {
    sellToken: response.sellToken!,
    buyToken: response.buyToken!,
    sellAmount: expectedSellAmount,
    buyAmount: buyAmount.toString(),
    minBuyAmount: minBuyAmount.toString(),
    price: (
      Number(formatUnits(buyAmount, params.buyToken.decimals)) /
      Number(params.sellAmount)
    ).toString(),
    guaranteedPrice: (
      Number(formatUnits(minBuyAmount, params.buyToken.decimals)) /
      Number(params.sellAmount)
    ).toString(),
    estimatedPriceImpact: '0',
    gas,
    gasPrice,
    protocolFee: '0',
    minimumProtocolFee: response.totalNetworkFee || '0',
    sources,
    allowanceTarget: allowanceTarget!,
    to: transaction.to,
    data: transaction.data,
    value: value.toString(),
    liquidityAvailable: true,
    minimumReceived: formatUnits(minBuyAmount, params.buyToken.decimals),
    route: fills.map(fill => ({
      name: fill.source,
      proportion: Number(fill.proportionBps) / 100,
      fromToken: fill.from,
      toToken: fill.to,
      hops: 1,
    })),
    issues: response.issues || {
      allowance: null,
      balance: null,
      simulationIncomplete: false,
      invalidSourcesPassed: [],
    },
  };

  return {
    ...normalized,
    security: {
      intentFingerprint: swapIntentFingerprint(params, chainId),
      quoteFingerprint: quoteFingerprint(normalized),
      validatedAt: Date.now(),
      chainId,
      taker: params.takerAddress,
    },
  };
}

class SwapService {
  /**
   * 스왑 견적 가져오기
   */
  async getQuote(
    params: SwapParams,
    chainId: number,
  ): Promise<SwapQuote | null> {
    if (!isSwapApiSupported(chainId)) {
      // 테스트넷은 지원하지 않음
      console.warn(`Swap not supported on chain ${chainId}`);
      return null;
    }

    try {
      const sellAmountWei = parseUnits(
        params.sellAmount,
        params.sellToken.decimals,
      ).toString();

      const queryParams = new URLSearchParams({
        sellToken: params.sellToken.address,
        buyToken: params.buyToken.address,
        sellAmount: sellAmountWei,
        taker: params.takerAddress,
        slippageBps: Math.round(
          (params.slippagePercentage ?? 0.5) * 100,
        ).toString(),
      });

      const apiUrl = getSwapApiUrl(chainId, 'quote', queryParams);
      if (!apiUrl) return null;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        '0x-version': 'v2',
      };

      const response = await fetch(apiUrl, { headers });

      if (!response.ok) {
        const errorData = (await response.json()) as { reason?: string };
        throw new Error(errorData.reason || 'Failed to get quote');
      }

      const quote = (await response.json()) as ZeroXV2QuoteResponse;
      return normalizeAndValidateQuote(quote, params, chainId);
    } catch (error: unknown) {
      console.error('Failed to get swap quote:', error);
      throw error;
    }
  }

  /**
   * 스왑 가격 조회 (가스 계산 제외, 빠른 조회용)
   */
  async getPrice(
    params: SwapParams,
    chainId: number,
  ): Promise<{ price: string; buyAmount: string } | null> {
    if (!isSwapApiSupported(chainId)) {
      return null;
    }

    try {
      const sellAmountWei = parseUnits(
        params.sellAmount,
        params.sellToken.decimals,
      ).toString();

      const queryParams = new URLSearchParams({
        sellToken: params.sellToken.address,
        buyToken: params.buyToken.address,
        sellAmount: sellAmountWei,
        taker: params.takerAddress,
      });

      const apiUrl = getSwapApiUrl(chainId, 'price', queryParams);
      if (!apiUrl) return null;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        '0x-version': 'v2',
      };

      const response = await fetch(apiUrl, { headers });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as {
        price: string;
        buyAmount: string;
        sellToken?: string;
        buyToken?: string;
        sellAmount?: string;
        liquidityAvailable?: boolean;
      };

      if (
        data.liquidityAvailable === false ||
        (data.sellToken &&
          !addressesEqual(data.sellToken, params.sellToken.address)) ||
        (data.buyToken &&
          !addressesEqual(data.buyToken, params.buyToken.address)) ||
        (data.sellAmount && data.sellAmount !== sellAmountWei)
      ) {
        return null;
      }

      return {
        price: data.price,
        buyAmount: formatUnits(
          BigInt(data.buyAmount),
          params.buyToken.decimals,
        ),
      };
    } catch (error: unknown) {
      console.error('Failed to get price:', error);
      return null;
    }
  }

  /**
   * 체인별 지원 토큰 목록 조회
   */
  getTokens(chainId: number): SwapToken[] {
    return SWAP_TOKENS[chainId] || [];
  }

  /**
   * 스왑 지원 여부 확인
   */
  isSwapSupported(chainId: number): boolean {
    return isSwapApiSupported(chainId);
  }

  /**
   * 토큰 승인 필요 여부 (네이티브 토큰은 승인 불필요)
   */
  needsApproval(sellToken: SwapToken): boolean {
    return sellToken.address !== NATIVE_TOKEN_ADDRESS;
  }

  /**
   * 예상 수령량 포맷팅
   */
  formatBuyAmount(amount: string, _token: SwapToken): string {
    const num = parseFloat(amount);
    if (num === 0) return '0';
    if (num < 0.0001) return '< 0.0001';
    if (num < 1) return num.toFixed(4);
    if (num < 1000) return num.toFixed(2);
    return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  /**
   * 가격 영향 계산
   */
  calculatePriceImpact(quote: Pick<SwapQuote, 'estimatedPriceImpact'>): string {
    const impact = parseFloat(quote.estimatedPriceImpact || '0') * 100;
    return impact.toFixed(2);
  }

  assertQuoteMatchesIntent(
    quote: SwapQuote,
    params: SwapParams,
    chainId: number,
  ): void {
    if (Date.now() - quote.security.validatedAt > QUOTE_MAX_AGE_MS) {
      throw new Error(
        '검토한 스왑 견적이 만료되었습니다. 새 견적을 확인해주세요.',
      );
    }
    if (
      quote.security.chainId !== chainId ||
      quote.security.taker.toLowerCase() !==
        params.takerAddress.toLowerCase() ||
      quote.security.intentFingerprint !==
        swapIntentFingerprint(params, chainId)
    ) {
      throw new Error('검토 후 스왑 토큰, 수량 또는 계정이 변경되었습니다.');
    }
    const criticalQuote = Object.fromEntries(
      Object.entries(quote).filter(([key]) => key !== 'security'),
    ) as Omit<SwapQuote, 'security'>;
    if (quote.security.quoteFingerprint !== quoteFingerprint(criticalQuote)) {
      throw new Error('검토 후 스왑 실행 데이터가 변경되어 차단했습니다.');
    }
  }
}

export const swapService = new SwapService();
