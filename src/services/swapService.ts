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
export const NATIVE_TOKEN_ADDRESS =
  '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
export const ZERO_X_ALLOWANCE_HOLDER =
  '0x0000000000001fF3684f28c67538d4D072C22734';
/** 검토한 견적을 실행할 수 있는 최대 시간 */
export const QUOTE_MAX_AGE_MS = 90_000;
const HEX_BYTES = /^0x(?:[0-9a-fA-F]{2})+$/;

/** 가격 영향 경고/강한 확인 기준 (%) */
export const PRICE_IMPACT_WARNING_PERCENT = 3;
export const PRICE_IMPACT_CRITICAL_PERCENT = 10;

export type SwapErrorCode =
  | 'INSUFFICIENT_BALANCE'
  | 'NO_LIQUIDITY'
  | 'SIMULATION_FAILED'
  | 'TOKEN_NOT_SUPPORTED'
  | 'INVALID_REQUEST'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'NOT_CONFIGURED'
  | 'UNSUPPORTED_CHAIN'
  | 'NETWORK'
  | 'QUOTE_EXPIRED'
  | 'QUOTE_BLOCKED'
  | 'UNKNOWN';

const SWAP_ERROR_MESSAGES: Record<SwapErrorCode, string> = {
  INSUFFICIENT_BALANCE: '스왑에 필요한 토큰 잔액이 부족합니다.',
  NO_LIQUIDITY:
    '이 토큰 쌍과 수량에 사용할 수 있는 유동성이 없습니다. 수량을 줄이거나 다른 토큰을 선택해주세요.',
  SIMULATION_FAILED:
    '0x가 트랜잭션 시뮬레이션을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.',
  TOKEN_NOT_SUPPORTED: '0x에서 지원하지 않는 토큰입니다.',
  INVALID_REQUEST: '스왑 요청 값이 올바르지 않습니다. 수량을 확인해주세요.',
  RATE_LIMITED: '요청이 많습니다. 잠시 후 다시 시도해주세요.',
  SERVICE_UNAVAILABLE:
    '스왑 서비스에 일시적인 문제가 있습니다. 잠시 후 다시 시도해주세요.',
  NOT_CONFIGURED: '스왑 서비스가 설정되지 않았습니다.',
  UNSUPPORTED_CHAIN: '현재 네트워크에서는 스왑을 사용할 수 없습니다.',
  NETWORK:
    '스왑 서비스에 연결할 수 없습니다. 네트워크 연결을 확인한 뒤 다시 시도해주세요.',
  QUOTE_EXPIRED: '검토한 스왑 견적이 만료되었습니다. 새 견적을 확인해주세요.',
  QUOTE_BLOCKED: '안전하지 않은 스왑 견적이 차단되었습니다.',
  UNKNOWN: '견적을 가져오지 못했습니다.',
};

/** 사용자에게 보여 줄 한국어 메시지와 원인 코드를 가진 스왑 오류 */
export class SwapError extends Error {
  code: SwapErrorCode;
  /** 0x가 보낸 원문 사유 (있을 때) */
  reason?: string;

  constructor(code: SwapErrorCode, message?: string, reason?: string) {
    super(message ?? SWAP_ERROR_MESSAGES[code]);
    this.name = 'SwapError';
    this.code = code;
    this.reason = reason;
  }
}

interface ZeroXErrorBody {
  name?: string;
  message?: string;
  reason?: string;
  code?: number | string;
  data?: { details?: { reason?: string; field?: string }[] };
}

/**
 * 0x API 오류 응답을 원인별 한국어 오류로 변환한다.
 * v2는 { name, message, data }, 구버전/프록시는 { reason }을 보낸다.
 */
export function mapZeroXError(
  status: number | undefined,
  body: unknown,
): SwapError {
  const data = (body && typeof body === 'object' ? body : {}) as ZeroXErrorBody;
  const detail = data.data?.details?.find(item => item.reason)?.reason;
  const reason = data.reason || detail || data.message || undefined;
  const haystack = `${data.name ?? ''} ${data.reason ?? ''} ${detail ?? ''} ${
    data.message ?? ''
  }`.toUpperCase();

  if (status === 429) return new SwapError('RATE_LIMITED', undefined, reason);
  if (haystack.includes('LIQUIDITY'))
    return new SwapError('NO_LIQUIDITY', undefined, reason);
  if (haystack.includes('BALANCE'))
    return new SwapError('INSUFFICIENT_BALANCE', undefined, reason);
  if (haystack.includes('SIMULATION') || haystack.includes('REVERT'))
    return new SwapError('SIMULATION_FAILED', undefined, reason);
  if (
    haystack.includes('TOKEN_NOT_SUPPORTED') ||
    haystack.includes('NOT_AUTHORIZED_FOR_TRADE')
  )
    return new SwapError('TOKEN_NOT_SUPPORTED', undefined, reason);
  if (status !== undefined && status >= 500)
    return new SwapError('SERVICE_UNAVAILABLE', undefined, reason);
  if (haystack.includes('INPUT_INVALID') || haystack.includes('VALIDATION'))
    return new SwapError(
      'INVALID_REQUEST',
      reason ? `${SWAP_ERROR_MESSAGES.INVALID_REQUEST} (${reason})` : undefined,
      reason,
    );
  return new SwapError(
    'UNKNOWN',
    reason ? `${SWAP_ERROR_MESSAGES.UNKNOWN} (${reason})` : undefined,
    reason,
  );
}

/** 화면 표시용 오류 문구 */
export function describeSwapError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return SWAP_ERROR_MESSAGES.UNKNOWN;
}

function isNetworkFailure(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof Error &&
      /network|fetch|timeout|abort/i.test(error.message))
  );
}

/** 0x 네이티브 토큰(또는 테스트용 'native') 여부 */
export function isNativeSwapToken(
  token: Pick<SwapToken, 'address'> & { isNative?: boolean },
): boolean {
  return (
    token.isNative === true ||
    token.address === 'native' ||
    token.address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()
  );
}

/**
 * USD 가치로 가격 영향(비율, 0.05 = 5%)을 계산한다.
 * impact = 1 − (buyAmount × buyPriceUSD) / (sellAmount × sellPriceUSD)
 * 시세를 하나라도 모르면 null — 절대 0%로 대체하지 않는다.
 */
export function computePriceImpact(input: {
  sellAmount: string | number;
  sellPriceUsd: number | null | undefined;
  buyAmount: string | number;
  buyPriceUsd: number | null | undefined;
}): number | null {
  const sellAmount = Number(input.sellAmount);
  const buyAmount = Number(input.buyAmount);
  const { sellPriceUsd, buyPriceUsd } = input;
  if (
    !Number.isFinite(sellAmount) ||
    !Number.isFinite(buyAmount) ||
    sellAmount <= 0 ||
    buyAmount < 0 ||
    typeof sellPriceUsd !== 'number' ||
    typeof buyPriceUsd !== 'number' ||
    !(sellPriceUsd > 0) ||
    !(buyPriceUsd > 0)
  ) {
    return null;
  }
  const sellValue = sellAmount * sellPriceUsd;
  const buyValue = buyAmount * buyPriceUsd;
  if (!Number.isFinite(sellValue) || !Number.isFinite(buyValue)) return null;
  // 받는 가치가 더 크면(시세 지연 등) 손실이 없는 것으로 본다.
  return Math.max(0, 1 - buyValue / sellValue);
}

export type PriceImpactLevel =
  | 'low'
  | 'medium'
  | 'high'
  | 'critical'
  | 'unknown';

export interface PriceImpactInfo {
  /** 소수 둘째 자리 백분율 문자열, 계산 불가면 null */
  percent: string | null;
  level: PriceImpactLevel;
}

/** 견적의 estimatedPriceImpact(비율 문자열, ''=알 수 없음)를 경고 단계로 변환 */
export function classifyPriceImpact(
  estimatedPriceImpact: string | null | undefined,
): PriceImpactInfo {
  if (
    estimatedPriceImpact === null ||
    estimatedPriceImpact === undefined ||
    estimatedPriceImpact.trim() === ''
  ) {
    return { percent: null, level: 'unknown' };
  }
  const ratio = Number(estimatedPriceImpact);
  if (!Number.isFinite(ratio)) return { percent: null, level: 'unknown' };
  // 표시값(소수 둘째 자리)과 경고 단계가 어긋나지 않도록 반올림한 값으로 판단한다.
  const percent = Math.round(ratio * 10_000) / 100;
  let level: PriceImpactLevel = 'low';
  if (percent >= PRICE_IMPACT_CRITICAL_PERCENT) level = 'critical';
  else if (percent >= PRICE_IMPACT_WARNING_PERCENT) level = 'high';
  else if (percent >= 1) level = 'medium';
  return { percent: percent.toFixed(2), level };
}

/** 견적 전 네이티브 MAX 계산에 쓰는 보수적 스왑 가스 한도 */
export const SWAP_GAS_LIMIT_ESTIMATE = 300_000n;
/** 승인 후 스왑을 보내기 전 견적에 남아 있어야 하는 최소 유효 시간 */
export const QUOTE_EXECUTION_MARGIN_MS = 10_000;

/**
 * 네이티브 토큰을 팔 때 가스비를 남긴 최대 판매 수량 (wei, bigint 연산).
 * reserve = gasLimit × pricePerGas × bufferPercent / 100
 */
export function nativeSwapMax(
  balanceWei: bigint,
  gasLimit: bigint,
  pricePerGas: bigint,
  bufferPercent = 120n,
): { maxWei: bigint; reserveWei: bigint } {
  const reserveWei = (gasLimit * pricePerGas * bufferPercent) / 100n;
  const maxWei = balanceWei > reserveWei ? balanceWei - reserveWei : 0n;
  return { maxWei, reserveWei };
}

/** 견적의 남은 유효 시간 (ms, 음수면 만료) */
export function quoteRemainingMs(
  quote: Pick<SwapQuote, 'security'>,
  now: number = Date.now(),
): number {
  return quote.security.validatedAt + QUOTE_MAX_AGE_MS - now;
}

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
      address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
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
    throw new SwapError(
      'QUOTE_BLOCKED',
      `스왑 견적의 ${field} 값이 올바르지 않습니다.`,
    );
  }
}

function normalizeAndValidateQuote(
  response: ZeroXV2QuoteResponse,
  params: SwapParams,
  chainId: number,
): SwapQuote {
  if (!isAddress(params.takerAddress)) {
    throw new SwapError(
      'QUOTE_BLOCKED',
      '스왑 실행 계정 주소가 올바르지 않습니다.',
    );
  }
  if (response.liquidityAvailable !== true) {
    throw new SwapError('NO_LIQUIDITY');
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
    throw new SwapError(
      'QUOTE_BLOCKED',
      '스왑 견적의 토큰 또는 판매 수량이 요청과 다릅니다.',
    );
  }

  const allowanceTarget = response.allowanceTarget;
  if (!addressesEqual(allowanceTarget, ZERO_X_ALLOWANCE_HOLDER)) {
    throw new SwapError(
      'QUOTE_BLOCKED',
      '공식 0x AllowanceHolder가 아닌 승인 대상은 차단됩니다.',
    );
  }
  const allowanceSpender = response.issues?.allowance?.spender;
  if (
    allowanceSpender &&
    !addressesEqual(allowanceSpender, ZERO_X_ALLOWANCE_HOLDER)
  ) {
    throw new SwapError(
      'QUOTE_BLOCKED',
      '견적의 토큰 승인 대상이 공식 주소와 다릅니다.',
    );
  }
  if (response.issues?.balance) {
    throw new SwapError('INSUFFICIENT_BALANCE');
  }
  if (response.issues?.simulationIncomplete) {
    throw new SwapError('SIMULATION_FAILED');
  }
  if ((response.issues?.invalidSourcesPassed || []).length > 0) {
    throw new SwapError(
      'QUOTE_BLOCKED',
      '유효하지 않은 유동성 소스가 포함되었습니다.',
    );
  }

  const transaction = response.transaction;
  if (
    !transaction?.to ||
    !isAddress(transaction.to) ||
    !transaction.data ||
    !HEX_BYTES.test(transaction.data) ||
    transaction.data.length < 10
  ) {
    throw new SwapError(
      'QUOTE_BLOCKED',
      '스왑 실행 트랜잭션이 올바르지 않습니다.',
    );
  }

  const isNative = addressesEqual(
    params.sellToken.address,
    NATIVE_TOKEN_ADDRESS,
  );
  if (!isNative && !addressesEqual(transaction.to, ZERO_X_ALLOWANCE_HOLDER)) {
    throw new SwapError(
      'QUOTE_BLOCKED',
      'ERC-20 스왑 실행 대상이 공식 AllowanceHolder가 아닙니다.',
    );
  }

  const value = parseUnsignedInteger(transaction.value || '0', 'value');
  if (
    (isNative && value.toString() !== expectedSellAmount) ||
    (!isNative && value !== 0n)
  ) {
    throw new SwapError(
      'QUOTE_BLOCKED',
      '스왑 트랜잭션의 네이티브 자산 금액이 요청과 다릅니다.',
    );
  }

  const buyAmount = parseUnsignedInteger(response.buyAmount, 'buyAmount');
  const minBuyAmount = parseUnsignedInteger(
    response.minBuyAmount,
    'minBuyAmount',
  );
  if (buyAmount <= 0n || minBuyAmount <= 0n || minBuyAmount > buyAmount) {
    throw new SwapError('QUOTE_BLOCKED', '스왑 수령 수량이 올바르지 않습니다.');
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
    // USD 시세로 계산하기 전까지는 '알 수 없음'. 0%로 표시하지 않는다.
    estimatedPriceImpact: '',
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

export interface SwapPriceResult {
  price: string;
  /** 사람이 읽는 단위의 예상 수령량 */
  buyAmount: string;
  /** 0x가 taker 잔액 부족을 보고함 */
  insufficientBalance: boolean;
}

const ZERO_X_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  '0x-version': 'v2',
};

async function fetchZeroX(url: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { headers: ZERO_X_HEADERS });
  } catch (error) {
    throw isNetworkFailure(error)
      ? new SwapError('NETWORK')
      : new SwapError('UNKNOWN', undefined, String(error));
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) throw mapZeroXError(response.status, body);
  return body;
}

class SwapService {
  /**
   * 스왑 견적 가져오기 (실행 가능한 트랜잭션 포함)
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
      if (!apiUrl) throw new SwapError('NOT_CONFIGURED');

      const quote = (await fetchZeroX(apiUrl)) as ZeroXV2QuoteResponse;
      return normalizeAndValidateQuote(quote, params, chainId);
    } catch (error: unknown) {
      console.error('Failed to get swap quote:', error);
      throw error;
    }
  }

  /**
   * 스왑 가격 조회 (가스 계산 제외, 빠른 조회용)
   * 실패 시 원인별 SwapError를 던진다.
   */
  async getPrice(
    params: SwapParams,
    chainId: number,
  ): Promise<SwapPriceResult | null> {
    if (!isSwapApiSupported(chainId)) {
      return null;
    }

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
    if (!apiUrl) throw new SwapError('NOT_CONFIGURED');

    const data = (await fetchZeroX(apiUrl)) as {
      price?: string;
      buyAmount?: string;
      sellToken?: string;
      buyToken?: string;
      sellAmount?: string;
      liquidityAvailable?: boolean;
      issues?: { balance?: unknown } | null;
    } | null;

    if (!data || data.liquidityAvailable === false) {
      throw new SwapError('NO_LIQUIDITY');
    }
    if (
      (data.sellToken &&
        !addressesEqual(data.sellToken, params.sellToken.address)) ||
      (data.buyToken &&
        !addressesEqual(data.buyToken, params.buyToken.address)) ||
      (data.sellAmount && data.sellAmount !== sellAmountWei)
    ) {
      throw new SwapError(
        'QUOTE_BLOCKED',
        '가격 응답의 토큰 또는 수량이 요청과 달라 표시하지 않았습니다.',
      );
    }
    if (!data.buyAmount || !/^\d+$/.test(data.buyAmount)) {
      throw new SwapError('UNKNOWN');
    }

    return {
      price: data.price ?? '',
      buyAmount: formatUnits(BigInt(data.buyAmount), params.buyToken.decimals),
      insufficientBalance: !!data.issues?.balance,
    };
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
    return !isNativeSwapToken(sellToken);
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
   * 가격 영향(%) 문자열. 시세를 몰라 계산할 수 없으면 null.
   */
  calculatePriceImpact(
    quote: Pick<SwapQuote, 'estimatedPriceImpact'>,
  ): string | null {
    return classifyPriceImpact(quote.estimatedPriceImpact).percent;
  }

  assertQuoteMatchesIntent(
    quote: SwapQuote,
    params: SwapParams,
    chainId: number,
  ): void {
    if (quoteRemainingMs(quote) < 0) {
      throw new SwapError('QUOTE_EXPIRED');
    }
    if (
      quote.security.chainId !== chainId ||
      quote.security.taker.toLowerCase() !==
        params.takerAddress.toLowerCase() ||
      quote.security.intentFingerprint !==
        swapIntentFingerprint(params, chainId)
    ) {
      throw new SwapError(
        'QUOTE_BLOCKED',
        '검토 후 스왑 토큰, 수량 또는 계정이 변경되었습니다.',
      );
    }
    const criticalQuote = Object.fromEntries(
      Object.entries(quote).filter(([key]) => key !== 'security'),
    ) as Omit<SwapQuote, 'security'>;
    if (quote.security.quoteFingerprint !== quoteFingerprint(criticalQuote)) {
      throw new SwapError(
        'QUOTE_BLOCKED',
        '검토 후 스왑 실행 데이터가 변경되어 차단했습니다.',
      );
    }
  }

  /**
   * 견적을 지금(그리고 minRemainingMs 뒤까지) 그대로 실행할 수 있는지.
   * 승인 트랜잭션 확정 후 스왑 전에 사용한다.
   */
  isQuoteUsable(
    quote: SwapQuote,
    params: SwapParams,
    chainId: number,
    minRemainingMs = 0,
  ): boolean {
    if (quoteRemainingMs(quote) < minRemainingMs) return false;
    try {
      this.assertQuoteMatchesIntent(quote, params, chainId);
      return true;
    } catch {
      return false;
    }
  }
}

export const swapService = new SwapService();
