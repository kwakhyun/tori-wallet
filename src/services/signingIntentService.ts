/** WalletConnect 요청을 사람이 확인할 수 있는 의도로 변환하고 표시/서명을 바인딩한다. */

import {
  decodeAbiParameters,
  formatEther,
  isAddress,
  keccak256,
  toHex,
  type Hex,
} from 'viem';

const MAX_UINT256 = 2n ** 256n - 1n;
const HEX_BYTES = /^0x(?:[0-9a-fA-F]{2})*$/;

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

export interface SigningRequestInput {
  method: string;
  params: unknown[];
  chainId: number;
  account: string;
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

function contractIntent(data: Hex): {
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

  if (selector === '0x095ea7b3') {
    const [spender, amount] = decodeAddressUint(data);
    const unlimited = amount === MAX_UINT256;
    return {
      summary: unlimited ? '토큰 무제한 사용 승인' : '토큰 사용 승인',
      details: [
        { label: '권한 대상', value: spender },
        {
          label: '승인 수량(원시 단위)',
          value: unlimited ? '무제한 (uint256 최대값)' : amount.toString(),
        },
        ...baseDetails,
      ],
      warnings: [
        {
          level: unlimited ? 'critical' : 'warning',
          message: unlimited
            ? '이 주소가 해당 토큰을 제한 없이 가져갈 수 있습니다. 꼭 필요한 경우에만 승인하세요.'
            : '이 주소에 토큰 전송 권한을 부여합니다. 대상 주소와 수량을 확인하세요.',
        },
      ],
      requiresRiskAcknowledgement: true,
    };
  }

  if (selector === '0xa22cb465') {
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

  if (selector === '0xa9059cbb') {
    const [recipient, amount] = decodeAddressUint(data);
    return {
      summary: '토큰 전송',
      details: [
        { label: '토큰 수신자', value: recipient },
        { label: '전송 수량(원시 단위)', value: amount.toString() },
        ...baseDetails,
      ],
      warnings: [],
      requiresRiskAcknowledgement: false,
    };
  }

  if (selector === '0x23b872dd') {
    const [owner, recipient, amount] = decodeTransferFrom(data);
    return {
      summary: '승인된 토큰/NFT 이전',
      details: [
        { label: '자산 소유자', value: owner },
        { label: '자산 수신자', value: recipient },
        { label: '수량 또는 토큰 ID', value: amount.toString() },
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

  const value = parseQuantity(tx.value, '전송 금액');
  const data = tx.data || '0x';
  if (!HEX_BYTES.test(data)) {
    throw new Error('트랜잭션 호출 데이터가 올바른 16진수가 아닙니다.');
  }

  const details: SigningIntentDetail[] = [
    { label: '보내는 계정', value: tx.from },
    { label: '대상 주소', value: tx.to || '없음' },
    { label: '네이티브 자산', value: `${formatEther(value)} ETH` },
    { label: '체인 ID', value: String(input.chainId) },
  ];
  let summary = value > 0n ? '네이티브 자산 전송' : '트랜잭션';
  let requiresRiskAcknowledgement = false;

  if (data !== '0x') {
    if (data.length < 10) throw new Error('컨트랙트 함수 선택자가 없습니다.');
    const decoded = contractIntent(data as Hex);
    summary = decoded.summary;
    details.push(...decoded.details);
    warnings.push(...decoded.warnings);
    requiresRiskAcknowledgement = decoded.requiresRiskAcknowledgement;
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

function typedDataChainId(value: unknown): bigint | null {
  if (value === undefined || value === null || value === '') return null;
  try {
    return BigInt(value as string | number | bigint);
  } catch {
    throw new Error('서명 도메인의 체인 ID가 올바르지 않습니다.');
  }
}

function analyzeTypedData(input: SigningRequestInput): SigningIntent {
  const [requestAccount, rawTypedData] = input.params;
  if (typeof requestAccount !== 'string') {
    throw new Error('타입 데이터 서명 계정이 없습니다.');
  }
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

  const isPermissionSignature = /permit|authorization|order/i.test(primaryType);
  if (isPermissionSignature) {
    warnings.push({
      level: 'critical',
      message:
        '이 서명은 토큰 사용 권한이나 거래 주문을 만들 수 있습니다. 만료·수량·대상을 원문에서 확인하세요.',
    });
  }

  return {
    fingerprint: fingerprintSigningRequest(input),
    kind: 'typedData',
    title: '타입 데이터 서명',
    summary: `EIP-712 ${primaryType} 서명`,
    details: [
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
    requiresRiskAcknowledgement: isPermissionSignature,
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
