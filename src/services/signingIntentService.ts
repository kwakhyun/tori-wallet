/** WalletConnect 요청을 사람이 확인할 수 있는 의도로 변환하고 표시/서명을 바인딩한다. */

import {
  decodeAbiParameters,
  formatEther,
  formatUnits,
  isAddress,
  keccak256,
  toHex,
  type Hex,
} from 'viem';

const MAX_UINT256 = 2n ** 256n - 1n;
const MAX_UINT160 = 2n ** 160n - 1n;
/** 이 이상이면 사실상 무제한으로 취급한다 (Permit2의 uint160 최대값 포함). */
const EFFECTIVELY_UNLIMITED = MAX_UINT160;
/** 이 이후(약 서기 10000년 이후)의 만료 시각은 무기한으로 표시한다. */
const NO_EXPIRY_SECONDS = 253402300799n;
const LONG_LIVED_PERMISSION_SECONDS = 30n * 24n * 60n * 60n;
const HEX_BYTES = /^0x(?:[0-9a-fA-F]{2})*$/;

export const PERMIT2_ADDRESS = '0x000000000022d473030f116ddee9f6b43ac78ba3';

const SELECTOR_APPROVE = '0x095ea7b3';
const SELECTOR_SET_APPROVAL_FOR_ALL = '0xa22cb465';
const SELECTOR_TRANSFER = '0xa9059cbb';
const SELECTOR_TRANSFER_FROM = '0x23b872dd';

export interface SigningIntentDetail {
  label: string;
  value: string;
}

export interface SigningIntentWarning {
  level: 'warning' | 'critical';
  message: string;
}

export interface SigningIntent {
  fingerprint: Hex;
  kind: 'transaction' | 'message' | 'typedData';
  title: string;
  summary: string;
  details: SigningIntentDetail[];
  warnings: SigningIntentWarning[];
  rawPayload?: string;
  blocked: boolean;
  requiresRiskAcknowledgement: boolean;
}

export interface TokenMetadata {
  symbol?: string;
  decimals: number;
  /** 지갑에 내장된 신뢰 목록의 토큰인지 (아니면 온체인에서 읽은 값) */
  verified?: boolean;
}

export interface SigningRequestInput {
  method: string;
  params: unknown[];
  chainId: number;
  account: string;
  referenceGasPrice?: string;
  /**
   * 검토 시점에 확정한 토큰 표시 정보 (소문자 주소 → 메타데이터).
   * 지문에 포함되므로 검토 화면과 서명 시점의 표시가 바뀌면 서명이 차단된다.
   */
  tokenMetadata?: Record<string, TokenMetadata>;
}

interface TransactionParams {
  from?: string;
  to?: string;
  value?: string;
  data?: string;
  gas?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: string;
}

// ---------------------------------------------------------------------------
// 토큰 표시 정보
// ---------------------------------------------------------------------------

/** 표시용 신뢰 토큰 목록 (체인 → 소문자 주소 → 메타데이터) */
const KNOWN_TOKENS: Record<number, Record<string, TokenMetadata>> = {
  1: {
    '0xdac17f958d2ee523a2206206994597c13d831ec7': {
      symbol: 'USDT',
      decimals: 6,
    },
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': {
      symbol: 'USDC',
      decimals: 6,
    },
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': {
      symbol: 'WETH',
      decimals: 18,
    },
    '0x6b175474e89094c44da98b954eedeac495271d0f': {
      symbol: 'DAI',
      decimals: 18,
    },
    '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': {
      symbol: 'WBTC',
      decimals: 8,
    },
  },
  137: {
    '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': {
      symbol: 'USDC',
      decimals: 6,
    },
    '0x2791bca1f2de4661ed88a30c99a7a9449aa84174': {
      symbol: 'USDC.e',
      decimals: 6,
    },
    '0xc2132d05d31c914a87c6611c10748aeb04b58e8f': {
      symbol: 'USDT',
      decimals: 6,
    },
    '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619': {
      symbol: 'WETH',
      decimals: 18,
    },
  },
  42161: {
    '0xaf88d065e77c8cc2239327c5edb3a432268e5831': {
      symbol: 'USDC',
      decimals: 6,
    },
    '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': {
      symbol: 'USDT',
      decimals: 6,
    },
    '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': {
      symbol: 'WETH',
      decimals: 18,
    },
  },
  10: {
    '0x0b2c639c533813f4aa9d7837caf62653d097ff85': {
      symbol: 'USDC',
      decimals: 6,
    },
    '0x4200000000000000000000000000000000000006': {
      symbol: 'WETH',
      decimals: 18,
    },
  },
  8453: {
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': {
      symbol: 'USDC',
      decimals: 6,
    },
    '0x4200000000000000000000000000000000000006': {
      symbol: 'WETH',
      decimals: 18,
    },
  },
};

/** 내장 신뢰 목록에서 토큰 정보를 찾는다. */
export function getKnownToken(
  chainId: number,
  address: string,
): TokenMetadata | null {
  const token = KNOWN_TOKENS[chainId]?.[address.toLowerCase()];
  return token ? { ...token, verified: true } : null;
}

interface DisplayContext {
  chainId: number;
  account: string;
  tokenMetadata?: Record<string, TokenMetadata>;
  nowMs: number;
}

function resolveToken(
  ctx: DisplayContext,
  address: string | undefined,
): TokenMetadata | null {
  if (!address || !isAddress(address, { strict: false })) return null;
  return (
    getKnownToken(ctx.chainId, address) ||
    ctx.tokenMetadata?.[address.toLowerCase()] ||
    null
  );
}

function tokenLabel(address: string, token: TokenMetadata | null): string {
  if (!token?.symbol) return address;
  return token.verified
    ? `${token.symbol} · ${address}`
    : `${token.symbol} (미확인 토큰) · ${address}`;
}

function isEffectivelyUnlimited(amount: bigint): boolean {
  return amount >= EFFECTIVELY_UNLIMITED;
}

function unlimitedLabel(amount: bigint): string {
  if (amount === MAX_UINT256) return '무제한 (uint256 최대값)';
  if (amount === MAX_UINT160) return '무제한 (uint160 최대값)';
  return '사실상 무제한 (매우 큰 수량)';
}

/** 토큰 수량을 소수점 단위로 표시한다. 토큰을 모르면 원시 단위로 표시한다. */
export function formatTokenAmount(
  amount: bigint,
  token: TokenMetadata | null,
): string {
  if (isEffectivelyUnlimited(amount)) return unlimitedLabel(amount);
  if (!token) return `${amount.toString()} (원시 단위)`;
  const symbol = token.symbol ? ` ${token.symbol}` : '';
  return `${formatUnits(amount, token.decimals)}${symbol}`;
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function relativeTime(diffSeconds: number): string {
  const abs = Math.abs(diffSeconds);
  const days = Math.floor(abs / 86400);
  const hours = Math.floor((abs % 86400) / 3600);
  const minutes = Math.max(1, Math.floor((abs % 3600) / 60));
  const amount =
    days > 0 ? `${days}일` : hours > 0 ? `${hours}시간` : `${minutes}분`;
  return diffSeconds >= 0 ? `${amount} 후` : `${amount} 전 만료됨`;
}

/** 유닉스 초 단위 만료 시각을 "YYYY-MM-DD HH:mm (n일 후)" 형식으로 표시한다. */
export function formatDeadline(
  seconds: bigint,
  nowMs: number = Date.now(),
): string {
  if (seconds === 0n) return '없음 (0)';
  if (seconds >= NO_EXPIRY_SECONDS) return '만료 없음 (무기한)';
  const date = new Date(Number(seconds) * 1000);
  const formatted = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate(),
  )} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  const diff = Math.round(Number(seconds) - nowMs / 1000);
  return `${formatted} (${relativeTime(diff)})`;
}

// ---------------------------------------------------------------------------
// 지문
// ---------------------------------------------------------------------------

function canonicalize(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new Error('Invalid numeric request value');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalize(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .filter(key => object[key] !== undefined)
      .map(key => `${JSON.stringify(key)}:${canonicalize(object[key])}`)
      .join(',')}}`;
  }
  throw new Error('Unsupported request value');
}

export function fingerprintSigningRequest(input: SigningRequestInput): Hex {
  return keccak256(
    toHex(
      canonicalize({
        method: input.method,
        params: input.params,
        chainId: input.chainId,
        account: input.account.toLowerCase(),
        referenceGasPrice: input.referenceGasPrice,
        tokenMetadata: input.tokenMetadata,
      }),
    ),
  );
}

function parseQuantity(value: string | undefined, field: string): bigint {
  if (value === undefined || value === '') return 0n;
  try {
    const parsed = BigInt(value);
    if (parsed < 0n) throw new Error('negative');
    return parsed;
  } catch {
    throw new Error(`${field} 값이 올바르지 않습니다.`);
  }
}

/** 타입 데이터 안의 수치(10진/16진 문자열, 숫자)를 bigint로 읽는다. */
function toBigIntOrNull(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    try {
      const parsed = BigInt(value.trim());
      return parsed >= 0n ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function asString(value: unknown): string {
  if (value === undefined || value === null) return '없음';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

// ---------------------------------------------------------------------------
// 트랜잭션
// ---------------------------------------------------------------------------

function decodeAddressUint(data: Hex): readonly [string, bigint] {
  if (data.length !== 138)
    throw new Error('잘못된 컨트랙트 호출 데이터입니다.');
  return decodeAbiParameters(
    [{ type: 'address' }, { type: 'uint256' }],
    `0x${data.slice(10)}`,
  );
}

function decodeAddressBool(data: Hex): readonly [string, boolean] {
  if (data.length !== 138)
    throw new Error('잘못된 컨트랙트 호출 데이터입니다.');
  return decodeAbiParameters(
    [{ type: 'address' }, { type: 'bool' }],
    `0x${data.slice(10)}`,
  );
}

function decodeTransferFrom(data: Hex): readonly [string, string, bigint] {
  if (data.length !== 202)
    throw new Error('잘못된 컨트랙트 호출 데이터입니다.');
  return decodeAbiParameters(
    [{ type: 'address' }, { type: 'address' }, { type: 'uint256' }],
    `0x${data.slice(10)}`,
  );
}

function contractIntent(
  data: Hex,
  target: string | undefined,
  ctx: DisplayContext,
): {
  details: SigningIntentDetail[];
  warnings: SigningIntentWarning[];
  summary: string;
  requiresRiskAcknowledgement: boolean;
} {
  const selector = data.slice(0, 10).toLowerCase();
  const baseDetails: SigningIntentDetail[] = [
    { label: '함수 선택자', value: selector },
    { label: '호출 데이터 해시', value: keccak256(data) },
  ];
  const token = resolveToken(ctx, target);
  const tokenDetail: SigningIntentDetail[] =
    target && token
      ? [{ label: '토큰', value: tokenLabel(target, token) }]
      : [];

  if (selector === SELECTOR_APPROVE) {
    const [spender, amount] = decodeAddressUint(data);
    const unlimited = isEffectivelyUnlimited(amount);
    if (amount === 0n) {
      return {
        summary: '토큰 사용 권한 해제',
        details: [
          { label: '권한 해제 대상', value: spender },
          ...tokenDetail,
          ...baseDetails,
        ],
        warnings: [],
        requiresRiskAcknowledgement: false,
      };
    }
    return {
      summary: unlimited ? '토큰 무제한 사용 승인' : '토큰 사용 승인',
      details: [
        { label: '권한 대상', value: spender },
        {
          label: token || unlimited ? '승인 수량' : '승인 수량(원시 단위)',
          value: unlimited
            ? unlimitedLabel(amount)
            : token
            ? formatTokenAmount(amount, token)
            : amount.toString(),
        },
        ...tokenDetail,
        ...baseDetails,
      ],
      warnings: [
        {
          level: unlimited ? 'critical' : 'warning',
          message: unlimited
            ? '무제한 승인: 이 주소가 해당 토큰을 제한 없이 가져갈 수 있습니다. 꼭 필요한 경우에만 승인하세요.'
            : '이 주소에 토큰 사용 권한을 부여합니다. 대상 주소와 수량을 확인하세요.',
        },
      ],
      requiresRiskAcknowledgement: true,
    };
  }

  if (selector === SELECTOR_SET_APPROVAL_FOR_ALL) {
    const [operator, approved] = decodeAddressBool(data);
    return {
      summary: approved ? 'NFT 전체 컬렉션 권한 승인' : 'NFT 전체 권한 해제',
      details: [
        { label: '운영자', value: operator },
        { label: '승인 여부', value: approved ? '승인' : '해제' },
        ...baseDetails,
      ],
      warnings: approved
        ? [
            {
              level: 'critical',
              message:
                '이 운영자가 현재 및 미래의 컬렉션 NFT를 모두 옮길 수 있습니다.',
            },
          ]
        : [],
      requiresRiskAcknowledgement: approved,
    };
  }

  if (selector === SELECTOR_TRANSFER) {
    const [recipient, amount] = decodeAddressUint(data);
    return {
      summary: '토큰 전송',
      details: [
        { label: '토큰 수신자', value: recipient },
        {
          label: token ? '전송 수량' : '전송 수량(원시 단위)',
          value: token ? formatTokenAmount(amount, token) : amount.toString(),
        },
        ...tokenDetail,
        ...baseDetails,
      ],
      warnings: [],
      requiresRiskAcknowledgement: false,
    };
  }

  if (selector === SELECTOR_TRANSFER_FROM) {
    const [owner, recipient, amount] = decodeTransferFrom(data);
    return {
      summary: '승인된 토큰/NFT 이전',
      details: [
        { label: '자산 소유자', value: owner },
        { label: '자산 수신자', value: recipient },
        {
          label: token ? '수량' : '수량 또는 토큰 ID',
          value: token ? formatTokenAmount(amount, token) : amount.toString(),
        },
        ...tokenDetail,
        ...baseDetails,
      ],
      warnings: [
        {
          level: 'warning',
          message: '제3자 권한을 사용해 자산을 이전하는 호출입니다.',
        },
      ],
      requiresRiskAcknowledgement: true,
    };
  }

  return {
    summary: '알 수 없는 스마트 컨트랙트 호출',
    details: baseDetails,
    warnings: [
      {
        level: 'warning',
        message:
          '토리월렛이 이 함수의 자산 변화를 해석하지 못했습니다. dApp과 대상 컨트랙트를 확인하세요.',
      },
    ],
    requiresRiskAcknowledgement: true,
  };
}

function analyzeTransaction(input: SigningRequestInput): SigningIntent {
  const fingerprint = fingerprintSigningRequest(input);
  const tx = input.params[0] as TransactionParams | undefined;
  const warnings: SigningIntentWarning[] = [];
  let blocked = false;

  if (!tx || typeof tx !== 'object') {
    throw new Error('트랜잭션 파라미터가 없습니다.');
  }
  if (!isAddress(input.account) || !tx.from || !isAddress(tx.from)) {
    throw new Error('트랜잭션 계정 주소가 올바르지 않습니다.');
  }
  if (tx.from.toLowerCase() !== input.account.toLowerCase()) {
    blocked = true;
    warnings.push({
      level: 'critical',
      message: '표시된 계정과 실제 트랜잭션 발신 계정이 다릅니다.',
    });
  }
  if (!tx.to || !isAddress(tx.to)) {
    blocked = true;
    warnings.push({
      level: 'critical',
      message: '컨트랙트 생성 또는 잘못된 수신 주소 요청은 차단됩니다.',
    });
  }

  const nonce = parseQuantity(tx.nonce, 'nonce');
  if (nonce > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error('nonce 값이 지원 범위를 초과합니다.');
  const value = parseQuantity(tx.value, '전송 금액');
  const gas = parseQuantity(tx.gas, '가스 한도');
  const feeCap = parseQuantity(
    tx.gasPrice ?? tx.maxFeePerGas,
    '가스당 수수료 상한',
  );
  const priorityFee = parseQuantity(tx.maxPriorityFeePerGas, '우선순위 수수료');
  if (
    tx.gasPrice !== undefined &&
    (tx.maxFeePerGas !== undefined || tx.maxPriorityFeePerGas !== undefined)
  ) {
    throw new Error('서로 다른 수수료 형식을 함께 지정할 수 없습니다.');
  }
  if (priorityFee > feeCap)
    throw new Error('우선순위 수수료가 수수료 상한을 초과합니다.');
  if (gas <= 0n || feeCap <= 0n) {
    blocked = true;
    warnings.push({
      level: 'critical',
      message: '네트워크 수수료 상한을 확인하기 전에는 서명할 수 없습니다.',
    });
  }
  const maximumFee = gas * feeCap;
  const referenceFee = parseQuantity(
    input.referenceGasPrice,
    '네트워크 기준 수수료',
  );
  const highFee =
    (referenceFee > 0n && feeCap > referenceFee * 5n) ||
    maximumFee > (input.chainId === 137 ? 10n ** 19n : 5n * 10n ** 16n);
  if (highFee)
    warnings.push({
      level: 'critical',
      message:
        '네트워크 수수료가 높습니다. 최대 수수료와 총지출액을 다시 확인하세요.',
    });
  const nativeSymbol = input.chainId === 137 ? 'POL' : 'ETH';
  const hasL1DataFee = [10, 8453, 42161].includes(input.chainId);
  if (hasL1DataFee)
    warnings.push({
      level: 'warning',
      message:
        '이 네트워크는 실행 수수료 외에 L1 데이터 수수료를 추가로 부과합니다. 아래 금액에는 L1 데이터 수수료가 포함되지 않습니다.',
    });
  const data = tx.data || '0x';
  if (!HEX_BYTES.test(data)) {
    throw new Error('트랜잭션 호출 데이터가 올바른 16진수가 아닙니다.');
  }

  const details: SigningIntentDetail[] = [
    { label: '보내는 계정', value: tx.from },
    { label: '대상 주소', value: tx.to || '없음' },
    { label: '네이티브 자산', value: `${formatEther(value)} ${nativeSymbol}` },
    { label: '체인 ID', value: String(input.chainId) },
    { label: '가스 한도', value: gas.toString() },
    {
      label: hasL1DataFee ? '최대 실행 수수료' : '최대 네트워크 수수료',
      value: `${formatEther(maximumFee)} ${nativeSymbol}`,
    },
    {
      label: hasL1DataFee ? '실행비 포함 금액 (L1 비용 별도)' : '최대 총지출액',
      value: `${formatEther(value + maximumFee)} ${nativeSymbol}`,
    },
  ];
  let summary = value > 0n ? '네이티브 자산 전송' : '트랜잭션';
  let requiresRiskAcknowledgement = highFee;

  if (data !== '0x') {
    if (data.length < 10) throw new Error('컨트랙트 함수 선택자가 없습니다.');
    const decoded = contractIntent(data as Hex, tx.to, {
      chainId: input.chainId,
      account: input.account,
      tokenMetadata: input.tokenMetadata,
      nowMs: Date.now(),
    });
    summary = decoded.summary;
    details.push(...decoded.details);
    warnings.push(...decoded.warnings);
    requiresRiskAcknowledgement =
      highFee || decoded.requiresRiskAcknowledgement;
  }

  return {
    fingerprint,
    kind: 'transaction',
    title:
      input.method === 'eth_sendTransaction'
        ? '트랜잭션 전송 승인'
        : '트랜잭션 서명 승인',
    summary,
    details,
    warnings,
    rawPayload: data === '0x' ? undefined : data,
    blocked,
    requiresRiskAcknowledgement,
  };
}

// ---------------------------------------------------------------------------
// personal_sign
// ---------------------------------------------------------------------------

function decodePersonalMessage(message: string): {
  display: string;
  isBlindHex: boolean;
} {
  if (!message.startsWith('0x')) return { display: message, isBlindHex: false };
  if (!HEX_BYTES.test(message)) {
    throw new Error('메시지가 올바른 16진수 바이트가 아닙니다.');
  }
  const bytes = new Uint8Array(
    (message.slice(2).match(/.{2}/g) || []).map(byte => parseInt(byte, 16)),
  );
  const decoded = new TextDecoder().decode(bytes);
  const isPrintable =
    decoded.length > 0 && /^[\x20-\x7E\r\n\t]+$/.test(decoded);
  return { display: isPrintable ? decoded : message, isBlindHex: !isPrintable };
}

function analyzeMessage(input: SigningRequestInput): SigningIntent {
  const [message, requestAccount] = input.params;
  if (typeof message !== 'string' || typeof requestAccount !== 'string') {
    throw new Error('메시지 서명 파라미터가 올바르지 않습니다.');
  }
  const blocked = requestAccount.toLowerCase() !== input.account.toLowerCase();
  const decoded = decodePersonalMessage(message);
  const warnings: SigningIntentWarning[] = [];
  if (blocked) {
    warnings.push({
      level: 'critical',
      message: '표시된 계정과 실제 메시지 서명 계정이 다릅니다.',
    });
  }
  if (decoded.isBlindHex) {
    warnings.push({
      level: 'critical',
      message:
        '사람이 읽을 수 없는 바이트 서명입니다. 출처를 확신하지 못하면 거부하세요.',
    });
  }

  return {
    fingerprint: fingerprintSigningRequest(input),
    kind: 'message',
    title: '메시지 서명',
    summary:
      '이 서명은 트랜잭션이 아니지만 로그인이나 권한 위임에 사용될 수 있습니다.',
    details: [
      { label: '서명 계정', value: requestAccount },
      { label: '체인 ID', value: String(input.chainId) },
    ],
    warnings,
    rawPayload: decoded.display,
    blocked,
    requiresRiskAcknowledgement: decoded.isBlindHex,
  };
}

// ---------------------------------------------------------------------------
// EIP-712 타입 데이터
// ---------------------------------------------------------------------------

function typedDataChainId(value: unknown): bigint | null {
  if (value === undefined || value === null || value === '') return null;
  try {
    return BigInt(value as string | number | bigint);
  } catch {
    throw new Error('서명 도메인의 체인 ID가 올바르지 않습니다.');
  }
}

function parseTypedData(rawTypedData: unknown): Record<string, unknown> {
  let typedData: Record<string, unknown>;
  try {
    typedData =
      typeof rawTypedData === 'string'
        ? (JSON.parse(rawTypedData) as Record<string, unknown>)
        : (rawTypedData as Record<string, unknown>);
  } catch {
    throw new Error('타입 데이터 JSON이 올바르지 않습니다.');
  }
  if (!typedData || typeof typedData !== 'object') {
    throw new Error('타입 데이터가 올바르지 않습니다.');
  }
  return typedData;
}

interface DecodedTypedData {
  title: string;
  summary: string;
  details: SigningIntentDetail[];
  warnings: SigningIntentWarning[];
}

interface PermitGrant {
  token: string | undefined;
  amount: bigint | null;
  /** 권한 만료 (Permit2 allowance expiration) */
  expiration?: bigint | null;
}

const PERMISSION_WARNING =
  '토큰 사용 권한을 부여합니다. 이 서명만으로 아래 대상이 토큰을 가져갈 수 있으니 신뢰하는 dApp에서만 서명하세요.';

function isPermit2(domain: Record<string, unknown>): boolean {
  const verifyingContract = domain.verifyingContract;
  return (
    (typeof verifyingContract === 'string' &&
      verifyingContract.toLowerCase() === PERMIT2_ADDRESS) ||
    domain.name === 'Permit2'
  );
}

function grantDetails(
  grants: PermitGrant[],
  ctx: DisplayContext,
  details: SigningIntentDetail[],
  warnings: SigningIntentWarning[],
): { unlimited: boolean; symbols: string[] } {
  let unlimited = false;
  const symbols: string[] = [];
  grants.forEach((grant, index) => {
    const suffix = grants.length > 1 ? ` ${index + 1}` : '';
    const token = resolveToken(ctx, grant.token);
    symbols.push(token?.symbol || '토큰');
    details.push({
      label: `토큰${suffix}`,
      value: grant.token ? tokenLabel(grant.token, token) : '없음',
    });
    details.push({
      label: `승인 수량${suffix}`,
      value:
        grant.amount === null
          ? '알 수 없음'
          : formatTokenAmount(grant.amount, token),
    });
    if (grant.amount !== null && isEffectivelyUnlimited(grant.amount))
      unlimited = true;
    if (grant.expiration !== undefined) {
      details.push({
        label: `권한 만료${suffix}`,
        value:
          grant.expiration === null
            ? '알 수 없음'
            : formatDeadline(grant.expiration, ctx.nowMs),
      });
      if (
        grant.expiration !== null &&
        grant.expiration - BigInt(Math.floor(ctx.nowMs / 1000)) >
          LONG_LIVED_PERMISSION_SECONDS
      ) {
        warnings.push({
          level: 'warning',
          message: `권한이 30일 넘게 유지됩니다 (만료: ${formatDeadline(
            grant.expiration,
            ctx.nowMs,
          )}).`,
        });
      }
    }
  });
  if (unlimited) {
    warnings.push({
      level: 'critical',
      message:
        '무제한 수량의 토큰 사용 권한입니다. 꼭 필요한 경우에만 서명하세요.',
    });
  }
  return { unlimited, symbols };
}

function decodePermit2(
  primaryType: string,
  message: Record<string, unknown>,
  ctx: DisplayContext,
): DecodedTypedData | null {
  const details: SigningIntentDetail[] = [];
  const warnings: SigningIntentWarning[] = [
    { level: 'critical', message: PERMISSION_WARNING },
  ];
  let grants: PermitGrant[];
  let deadline: unknown;
  let kindLabel: string;

  if (primaryType === 'PermitSingle' || primaryType === 'PermitBatch') {
    const rawDetails =
      primaryType === 'PermitSingle'
        ? [asRecord(message.details)]
        : Array.isArray(message.details)
        ? message.details.map(asRecord)
        : [];
    grants = rawDetails.map(item => ({
      token: typeof item?.token === 'string' ? item.token : undefined,
      amount: toBigIntOrNull(item?.amount),
      expiration: toBigIntOrNull(item?.expiration),
    }));
    deadline = message.sigDeadline;
    kindLabel =
      primaryType === 'PermitSingle'
        ? 'Permit2 사용 권한 (PermitSingle)'
        : 'Permit2 일괄 사용 권한 (PermitBatch)';
  } else if (/^Permit(Batch)?(Witness)?TransferFrom$/.test(primaryType)) {
    const permitted = Array.isArray(message.permitted)
      ? message.permitted.map(asRecord)
      : [asRecord(message.permitted)];
    grants = permitted.map(item => ({
      token: typeof item?.token === 'string' ? item.token : undefined,
      amount: toBigIntOrNull(item?.amount),
    }));
    deadline = message.deadline;
    kindLabel = `Permit2 서명 전송 (${primaryType})`;
  } else {
    return null;
  }
  if (grants.length === 0) return null;

  details.push({ label: '권한 유형', value: kindLabel });
  details.push({
    label: '권한 대상(spender)',
    value: asString(message.spender),
  });
  const { unlimited, symbols } = grantDetails(grants, ctx, details, warnings);
  const deadlineValue = toBigIntOrNull(deadline);
  details.push({
    label: '서명 유효기한',
    value:
      deadlineValue === null
        ? '알 수 없음'
        : formatDeadline(deadlineValue, ctx.nowMs),
  });
  if (message.nonce !== undefined)
    details.push({ label: 'nonce', value: asString(message.nonce) });
  if (message.witness !== undefined) {
    warnings.push({
      level: 'warning',
      message:
        '추가 주문 조건(witness)이 포함된 서명입니다. 아래 원문에서 거래 조건을 확인하세요.',
    });
  }

  return {
    title: '토큰 사용 권한 서명',
    summary: `${symbols.join(', ')} ${
      unlimited ? '무제한 ' : ''
    }사용 권한을 부여합니다 (Permit2)`,
    details,
    warnings,
  };
}

function decodeErc2612Permit(
  message: Record<string, unknown>,
  domain: Record<string, unknown>,
  ctx: DisplayContext,
): DecodedTypedData | null {
  const token =
    typeof domain.verifyingContract === 'string'
      ? domain.verifyingContract
      : undefined;
  const details: SigningIntentDetail[] = [];
  const warnings: SigningIntentWarning[] = [
    { level: 'critical', message: PERMISSION_WARNING },
  ];
  const owner = message.owner ?? message.holder;
  if (
    typeof owner === 'string' &&
    owner.toLowerCase() !== ctx.account.toLowerCase()
  ) {
    warnings.push({
      level: 'critical',
      message: '서명 계정과 권한 소유자(owner)가 다릅니다.',
    });
  }

  // DAI 방식: allowed=true면 무제한 권한
  const isDaiStyle = message.allowed !== undefined;
  const amount = isDaiStyle
    ? message.allowed === true || message.allowed === 'true'
      ? MAX_UINT256
      : 0n
    : toBigIntOrNull(message.value);
  if (!isDaiStyle && message.value === undefined) return null;
  const deadlineValue = toBigIntOrNull(message.deadline ?? message.expiry);

  details.push({ label: '권한 유형', value: 'ERC-2612 Permit' });
  details.push({
    label: '권한 대상(spender)',
    value: asString(message.spender),
  });
  if (typeof owner === 'string')
    details.push({ label: '권한 소유자', value: owner });
  const { unlimited, symbols } = grantDetails(
    [{ token, amount }],
    ctx,
    details,
    warnings,
  );
  details.push({
    label: '서명 유효기한',
    value:
      deadlineValue === null
        ? '알 수 없음'
        : formatDeadline(deadlineValue, ctx.nowMs),
  });
  if (message.nonce !== undefined)
    details.push({ label: 'nonce', value: asString(message.nonce) });

  if (isDaiStyle && amount === 0n) {
    return {
      title: '토큰 사용 권한 해제 서명',
      summary: `${symbols[0]} 사용 권한을 해제합니다 (Permit)`,
      details,
      warnings: warnings.filter(
        warning => warning.message !== PERMISSION_WARNING,
      ),
    };
  }
  return {
    title: '토큰 사용 권한 서명',
    summary: `${symbols[0]} ${
      unlimited ? '무제한 ' : ''
    }사용 권한을 부여합니다 (Permit)`,
    details,
    warnings,
  };
}

function assetLine(
  ctx: DisplayContext,
  token: unknown,
  amount: unknown,
  itemType?: unknown,
): string {
  const type = toBigIntOrNull(itemType);
  if (type === 0n) {
    const value = toBigIntOrNull(amount);
    const symbol = ctx.chainId === 137 ? 'POL' : 'ETH';
    return value === null ? `? ${symbol}` : `${formatEther(value)} ${symbol}`;
  }
  if (type === 2n || type === 4n) return `NFT (ERC-721) · ${asString(token)}`;
  if (type === 3n || type === 5n) {
    return `NFT (ERC-1155) ${asString(amount)}개 · ${asString(token)}`;
  }
  const value = toBigIntOrNull(amount);
  const address = typeof token === 'string' ? token : undefined;
  const meta = resolveToken(ctx, address);
  const formatted = value === null ? '?' : formatTokenAmount(value, meta);
  return address ? `${formatted} · ${tokenLabel(address, meta)}` : formatted;
}

function decodeOrder(
  primaryType: string,
  message: Record<string, unknown>,
  domain: Record<string, unknown>,
  ctx: DisplayContext,
): DecodedTypedData | null {
  const details: SigningIntentDetail[] = [];
  const warnings: SigningIntentWarning[] = [
    {
      level: 'warning',
      message:
        '거래 주문에 서명합니다. 주문이 체결되면 아래 자산이 교환됩니다. 판매/구매 자산과 수량을 확인하세요.',
    },
  ];
  const account = ctx.account.toLowerCase();

  // Seaport (OpenSea 등)
  if (primaryType === 'OrderComponents' && Array.isArray(message.offer)) {
    const offer = message.offer.map(asRecord);
    const consideration = Array.isArray(message.consideration)
      ? message.consideration.map(asRecord)
      : [];
    details.push({
      label: '주문 프로토콜',
      value: String(domain.name || 'Seaport'),
    });
    details.push({ label: '주문자', value: asString(message.offerer) });
    offer.forEach((item, index) =>
      details.push({
        label: `내가 제공하는 자산 ${index + 1}`,
        value: assetLine(ctx, item?.token, item?.startAmount, item?.itemType),
      }),
    );
    const mine = consideration.filter(
      item =>
        typeof item?.recipient === 'string' &&
        item.recipient.toLowerCase() === account,
    );
    mine.forEach((item, index) =>
      details.push({
        label: `내가 받는 자산 ${index + 1}`,
        value: assetLine(ctx, item?.token, item?.startAmount, item?.itemType),
      }),
    );
    const others = consideration.length - mine.length;
    if (others > 0)
      details.push({
        label: '다른 수령인에게 지급',
        value: `${others}건 (수수료/로열티 등)`,
      });
    const endTime = toBigIntOrNull(message.endTime);
    details.push({
      label: '주문 만료',
      value:
        endTime === null ? '알 수 없음' : formatDeadline(endTime, ctx.nowMs),
    });
    if (mine.length === 0) {
      warnings.push({
        level: 'critical',
        message:
          '이 주문으로 내가 받는 자산이 없습니다. 자산을 무상으로 넘기는 피싱 주문일 수 있습니다.',
      });
    }
    return {
      title: '거래 주문 서명',
      summary: `${String(domain.name || 'Seaport')} 거래 주문`,
      details,
      warnings,
    };
  }

  // 판매/구매 토큰을 명시하는 주문 (CoW, 1inch 등)
  const sellToken = message.sellToken ?? message.makerAsset;
  const buyToken = message.buyToken ?? message.takerAsset;
  const sellAmount = message.sellAmount ?? message.makingAmount;
  const buyAmount = message.buyAmount ?? message.takingAmount;
  if (sellToken === undefined || buyToken === undefined) return null;

  details.push({
    label: '주문 프로토콜',
    value: String(domain.name || primaryType),
  });
  if (message.maker !== undefined)
    details.push({ label: '주문자', value: asString(message.maker) });
  details.push({
    label: '판매 자산',
    value: assetLine(ctx, sellToken, sellAmount),
  });
  details.push({
    label: '최소 구매 자산',
    value: assetLine(ctx, buyToken, buyAmount),
  });
  const receiver = message.receiver;
  const zero = '0x0000000000000000000000000000000000000000';
  if (typeof receiver === 'string') {
    details.push({ label: '받는 주소', value: receiver });
    if (receiver.toLowerCase() !== zero && receiver.toLowerCase() !== account) {
      warnings.push({
        level: 'critical',
        message: '구매한 자산을 받는 주소가 내 계정이 아닙니다.',
      });
    }
  }
  const expiry = toBigIntOrNull(
    message.validTo ?? message.expiry ?? message.deadline ?? message.endTime,
  );
  if (expiry !== null)
    details.push({
      label: '주문 만료',
      value: formatDeadline(expiry, ctx.nowMs),
    });
  return {
    title: '거래 주문 서명',
    summary: `${String(domain.name || primaryType)} 거래 주문`,
    details,
    warnings,
  };
}

function decodeTypedData(
  typedData: Record<string, unknown>,
  ctx: DisplayContext,
): DecodedTypedData | null {
  const domain = asRecord(typedData.domain) || {};
  const message = asRecord(typedData.message);
  const primaryType = String(typedData.primaryType || '');
  if (!message) return null;
  if (isPermit2(domain)) return decodePermit2(primaryType, message, ctx);
  if (primaryType === 'Permit' && message.spender !== undefined) {
    return decodeErc2612Permit(message, domain, ctx);
  }
  if (/order/i.test(primaryType)) {
    return decodeOrder(primaryType, message, domain, ctx);
  }
  return null;
}

/** 검토 화면에서 수량을 읽기 쉽게 표시하기 위해 조회할 토큰 주소를 모은다. */
export function collectTokenAddresses(input: SigningRequestInput): string[] {
  const found = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === 'string' && isAddress(value, { strict: false }))
      found.add(value.toLowerCase());
  };
  try {
    if (
      input.method === 'eth_sendTransaction' ||
      input.method === 'eth_signTransaction'
    ) {
      const tx = input.params[0] as TransactionParams | undefined;
      const selector = (tx?.data || '').slice(0, 10).toLowerCase();
      if (
        [SELECTOR_APPROVE, SELECTOR_TRANSFER, SELECTOR_TRANSFER_FROM].includes(
          selector,
        )
      )
        add(tx?.to);
    } else if (input.method.startsWith('eth_signTypedData')) {
      const typedData = parseTypedData(input.params[1]);
      const domain = asRecord(typedData.domain) || {};
      const message = asRecord(typedData.message) || {};
      const primaryType = String(typedData.primaryType || '');
      if (isPermit2(domain)) {
        const items = [
          ...(Array.isArray(message.details)
            ? message.details
            : [message.details]),
          ...(Array.isArray(message.permitted)
            ? message.permitted
            : [message.permitted]),
        ];
        items.forEach(item => add(asRecord(item)?.token));
      } else if (primaryType === 'Permit') {
        add(domain.verifyingContract);
      } else if (/order/i.test(primaryType)) {
        [
          message.sellToken,
          message.buyToken,
          message.makerAsset,
          message.takerAsset,
        ].forEach(add);
        [message.offer, message.consideration].forEach(list => {
          if (!Array.isArray(list)) return;
          list.forEach(item => {
            const record = asRecord(item);
            if (toBigIntOrNull(record?.itemType) === 1n) add(record?.token);
          });
        });
      }
    }
  } catch {
    // 해석할 수 없는 요청은 분석 단계에서 오류로 처리한다.
  }
  return Array.from(found);
}

function analyzeTypedData(input: SigningRequestInput): SigningIntent {
  const [requestAccount, rawTypedData] = input.params;
  if (typeof requestAccount !== 'string') {
    throw new Error('타입 데이터 서명 계정이 없습니다.');
  }
  const typedData = parseTypedData(rawTypedData);

  const domain = (typedData.domain || {}) as Record<string, unknown>;
  const primaryType = String(typedData.primaryType || '알 수 없음');
  const domainChainId = typedDataChainId(domain.chainId);
  const verifyingContract = domain.verifyingContract;
  const warnings: SigningIntentWarning[] = [];
  let blocked = requestAccount.toLowerCase() !== input.account.toLowerCase();

  if (blocked) {
    warnings.push({
      level: 'critical',
      message: '표시된 계정과 실제 타입 데이터 서명 계정이 다릅니다.',
    });
  }
  if (domainChainId !== null && domainChainId !== BigInt(input.chainId)) {
    blocked = true;
    warnings.push({
      level: 'critical',
      message: `서명 도메인 체인(${domainChainId})이 요청 체인(${input.chainId})과 다릅니다.`,
    });
  }
  if (
    verifyingContract !== undefined &&
    (typeof verifyingContract !== 'string' || !isAddress(verifyingContract))
  ) {
    blocked = true;
    warnings.push({
      level: 'critical',
      message: '검증 컨트랙트 주소가 올바르지 않습니다.',
    });
  }

  let decoded: DecodedTypedData | null = null;
  try {
    decoded = decodeTypedData(typedData, {
      chainId: input.chainId,
      account: input.account,
      tokenMetadata: input.tokenMetadata,
      nowMs: Date.now(),
    });
  } catch {
    decoded = null;
  }

  const isPermissionSignature = /permit|authorization|order/i.test(primaryType);
  if (decoded) {
    warnings.push(...decoded.warnings);
  } else if (isPermissionSignature) {
    warnings.push({
      level: 'critical',
      message:
        '이 서명은 토큰 사용 권한이나 거래 주문을 만들 수 있습니다. 만료·수량·대상을 원문에서 확인하세요.',
    });
  }

  return {
    fingerprint: fingerprintSigningRequest(input),
    kind: 'typedData',
    title: decoded?.title || '타입 데이터 서명',
    summary: decoded?.summary || `EIP-712 ${primaryType} 서명`,
    details: [
      ...(decoded?.details || []),
      { label: '서명 계정', value: requestAccount },
      { label: '도메인 이름', value: String(domain.name || '없음') },
      { label: '도메인 버전', value: String(domain.version || '없음') },
      {
        label: '도메인 체인 ID',
        value: domainChainId?.toString() || '명시되지 않음',
      },
      {
        label: '검증 컨트랙트',
        value: String(verifyingContract || '명시되지 않음'),
      },
      { label: '기본 타입', value: primaryType },
    ],
    warnings,
    rawPayload: JSON.stringify(typedData, null, 2),
    blocked,
    requiresRiskAcknowledgement: isPermissionSignature || decoded !== null,
  };
}

export function analyzeSigningRequest(
  input: SigningRequestInput,
): SigningIntent {
  if (
    input.method === 'eth_sendTransaction' ||
    input.method === 'eth_signTransaction'
  ) {
    return analyzeTransaction(input);
  }
  if (input.method === 'personal_sign') return analyzeMessage(input);
  if (
    input.method === 'eth_signTypedData' ||
    input.method === 'eth_signTypedData_v3' ||
    input.method === 'eth_signTypedData_v4'
  ) {
    return analyzeTypedData(input);
  }
  throw new Error(`지원하지 않는 서명 메서드입니다: ${input.method}`);
}

export function assertSigningIntentUnchanged(
  expectedFingerprint: Hex,
  input: SigningRequestInput,
): SigningIntent {
  const current = analyzeSigningRequest(input);
  if (current.fingerprint !== expectedFingerprint) {
    throw new Error('확인 후 서명 요청 내용이 변경되어 요청을 차단했습니다.');
  }
  if (current.blocked) {
    throw new Error('보안 정책에 의해 차단된 서명 요청입니다.');
  }
  return current;
}
