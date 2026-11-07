/**
 * QR 코드 내용 해석 (EIP-681 결제 요청, 일반 주소, WalletConnect URI)
 *
 * EIP-681 토큰 전송 요청은 대상(target)이 토큰 컨트랙트이고 실제 수신자는
 * `address` 파라미터에 들어 있다. 첫 번째 0x 주소를 수신자로 쓰면 토큰
 * 컨트랙트로 오송금하게 되므로 형식을 끝까지 해석한다.
 *
 * ethereum:[pay-]<target>[@<chainId>][/<function>][?<params>]
 */

import { getAddress, isAddress } from 'viem';

export type HexAddress = `0x${string}`;

export type ScanResult =
  | { kind: 'address'; address: HexAddress; raw: string }
  | {
      kind: 'payment';
      /** 실제 수신자 */
      recipient: HexAddress;
      chainId?: number;
      /** ERC-20 전송 요청일 때 토큰 컨트랙트 */
      tokenAddress?: HexAddress;
      /** 최소 단위 수량 (네이티브: wei, 토큰: uint256) */
      amountRaw?: bigint;
      raw: string;
    }
  | { kind: 'walletconnect'; uri: string; raw: string }
  | { kind: 'invalid'; reason: string; raw: string };

const PLAIN_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

function toAddress(value: string | undefined | null): HexAddress | null {
  if (!value || !PLAIN_ADDRESS.test(value)) return null;
  // 대소문자가 섞인 주소는 체크섬까지 검증한다 (viem 기본 strict 모드).
  if (!isAddress(value)) return null;
  return getAddress(value) as HexAddress;
}

/**
 * EIP-681 숫자(정수, 소수, 지수 표기)를 손실 없이 bigint로 변환한다.
 * 결과가 정수가 아니거나 음수이면 null.
 */
export function parseEip681Number(input: string): bigint | null {
  const match = /^\+?(\d*)(?:\.(\d+))?(?:[eE](\+?\d+))?$/.exec(input.trim());
  if (!match) return null;
  const [, intPart = '', fracPart = '', expPart] = match;
  if (!intPart && !fracPart) return null;
  const exponent = expPart ? parseInt(expPart, 10) : 0;
  if (!Number.isFinite(exponent) || exponent > 77) return null;

  const digits = `${intPart}${fracPart}`.replace(/^0+(?=\d)/, '');
  const shift = exponent - fracPart.length;
  if (shift >= 0) {
    return BigInt(digits || '0') * 10n ** BigInt(shift);
  }
  // 소수점 이하가 남는 경우: 남는 자리가 모두 0이어야 정수다.
  const cut = -shift;
  const whole =
    digits.length > cut ? digits.slice(0, digits.length - cut) : '0';
  const remainder = digits.slice(Math.max(0, digits.length - cut));
  if (/[1-9]/.test(remainder)) return null;
  return BigInt(whole || '0');
}

function parseQuery(query: string): Map<string, string> {
  const params = new Map<string, string>();
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const [key, ...rest] = pair.split('=');
    try {
      params.set(decodeURIComponent(key), decodeURIComponent(rest.join('=')));
    } catch {
      params.set(key, rest.join('='));
    }
  }
  return params;
}

export function parseScannedCode(rawInput: string): ScanResult {
  const raw = rawInput.trim();

  if (/^wc:/i.test(raw)) {
    return raw.includes('@2')
      ? { kind: 'walletconnect', uri: raw, raw }
      : {
          kind: 'invalid',
          reason: '지원하지 않는 WalletConnect 버전입니다 (v2만 지원).',
          raw,
        };
  }

  if (PLAIN_ADDRESS.test(raw)) {
    const address = toAddress(raw);
    return address
      ? { kind: 'address', address, raw }
      : {
          kind: 'invalid',
          reason:
            '주소의 체크섬이 올바르지 않습니다. 주소를 다시 확인해주세요.',
          raw,
        };
  }

  if (!/^ethereum:/i.test(raw)) {
    return {
      kind: 'invalid',
      reason: '이더리움 주소나 결제 요청이 아닌 QR 코드입니다.',
      raw,
    };
  }

  const body = raw.slice('ethereum:'.length);
  const match =
    /^(?:pay-)?([^@/?]+)(?:@(\d+))?(?:\/([A-Za-z_][A-Za-z0-9_]*))?(?:\?(.*))?$/.exec(
      body,
    );
  if (!match) {
    return {
      kind: 'invalid',
      reason: '결제 요청 형식이 올바르지 않습니다.',
      raw,
    };
  }

  const [, targetRaw, chainIdRaw, functionName, query = ''] = match;
  const target = toAddress(targetRaw);
  if (!target) {
    return {
      kind: 'invalid',
      reason: /\.eth$/i.test(targetRaw)
        ? 'ENS 이름이 포함된 결제 QR은 지원하지 않습니다. 주소 QR을 사용해주세요.'
        : '결제 요청의 주소가 올바르지 않습니다.',
      raw,
    };
  }

  const chainId = chainIdRaw ? parseInt(chainIdRaw, 10) : undefined;
  if (
    chainId !== undefined &&
    (!Number.isSafeInteger(chainId) || chainId <= 0)
  ) {
    return {
      kind: 'invalid',
      reason: '결제 요청의 체인 ID가 올바르지 않습니다.',
      raw,
    };
  }
  const params = parseQuery(query);

  if (functionName) {
    if (functionName !== 'transfer') {
      return {
        kind: 'invalid',
        reason: `지원하지 않는 결제 요청입니다 (${functionName}).`,
        raw,
      };
    }
    const recipient = toAddress(params.get('address'));
    if (!recipient) {
      return {
        kind: 'invalid',
        reason: '토큰 전송 요청에 수신자 주소가 없거나 올바르지 않습니다.',
        raw,
      };
    }
    const amountParam = params.get('uint256');
    const amountRaw =
      amountParam !== undefined ? parseEip681Number(amountParam) : undefined;
    if (amountRaw === null) {
      return {
        kind: 'invalid',
        reason: '요청 수량 형식이 올바르지 않습니다.',
        raw,
      };
    }
    return {
      kind: 'payment',
      recipient,
      chainId,
      tokenAddress: target,
      amountRaw,
      raw,
    };
  }

  const valueParam = params.get('value');
  const amountRaw =
    valueParam !== undefined ? parseEip681Number(valueParam) : undefined;
  if (amountRaw === null) {
    return {
      kind: 'invalid',
      reason: '요청 수량 형식이 올바르지 않습니다.',
      raw,
    };
  }

  if (chainId === undefined && amountRaw === undefined) {
    return { kind: 'address', address: target, raw };
  }

  return { kind: 'payment', recipient: target, chainId, amountRaw, raw };
}

/** 스캐너 모드별 허용 여부 */
export type ScanMode = 'address' | 'walletconnect' | 'any';

export function isAcceptedForMode(result: ScanResult, mode: ScanMode): boolean {
  if (result.kind === 'invalid') return false;
  if (mode === 'any') return true;
  if (mode === 'walletconnect') return result.kind === 'walletconnect';
  return result.kind === 'address' || result.kind === 'payment';
}

/** 결과에서 수신 주소만 꺼낸다 (주소/결제 요청) */
export function recipientOf(result: ScanResult): HexAddress | null {
  if (result.kind === 'address') return result.address;
  if (result.kind === 'payment') return result.recipient;
  return null;
}
