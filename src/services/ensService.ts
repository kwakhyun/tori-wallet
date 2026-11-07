/**
 * ENS 이름 해석 (메인넷 레지스트리)
 *
 * ENS는 이더리움 메인넷에 있으므로 활성 네트워크와 관계없이 메인넷 클라이언트로
 * 조회한다. 이름은 ENSIP-15(viem normalize)로 정규화한 뒤 조회해 동형 문자
 * (homoglyph) 이름이 다른 주소로 해석되지 않게 한다.
 */

import { getAddress } from 'viem';
import { normalize } from 'viem/ens';
import { chainClient } from './chainClient';

const ENS_CHAIN_ID = 1;
const CACHE_MS = 5 * 60 * 1000;

export type EnsErrorCode = 'INVALID_NAME' | 'NOT_FOUND' | 'NETWORK';

const ENS_ERROR_MESSAGES: Record<EnsErrorCode, string> = {
  INVALID_NAME: '올바르지 않은 ENS 이름입니다.',
  NOT_FOUND: 'ENS 이름에 연결된 주소를 찾을 수 없습니다.',
  NETWORK: 'ENS 이름을 확인하지 못했습니다. 네트워크 연결을 확인해주세요.',
};

export class EnsError extends Error {
  code: EnsErrorCode;

  constructor(code: EnsErrorCode) {
    super(ENS_ERROR_MESSAGES[code]);
    this.name = 'EnsError';
    this.code = code;
  }
}

export interface EnsResolution {
  /** 정규화된 이름 */
  name: string;
  address: `0x${string}`;
}

const cache = new Map<string, { value: EnsResolution; at: number }>();

/** 입력이 ENS 이름(.eth)처럼 보이는지 */
export function isEnsName(input: string): boolean {
  const value = input.trim();
  return /^[^\s/:?#]+\.eth$/i.test(value) && !value.startsWith('0x');
}

export function normalizeEnsName(input: string): string {
  try {
    return normalize(input.trim());
  } catch {
    throw new EnsError('INVALID_NAME');
  }
}

export const ensService = {
  /**
   * ENS 이름을 주소로 해석한다. 연결된 주소가 없으면 EnsError('NOT_FOUND').
   */
  async resolve(input: string): Promise<EnsResolution> {
    const name = normalizeEnsName(input);
    const cached = cache.get(name);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

    let address: string | null | undefined;
    try {
      address = await chainClient
        .getClient(ENS_CHAIN_ID)
        .getEnsAddress({ name });
    } catch {
      throw new EnsError('NETWORK');
    }
    if (!address || /^0x0{40}$/i.test(address)) {
      throw new EnsError('NOT_FOUND');
    }
    const value: EnsResolution = {
      name,
      address: getAddress(address) as `0x${string}`,
    };
    cache.set(name, { value, at: Date.now() });
    return value;
  },

  clearCache(): void {
    cache.clear();
  },
};

export default ensService;
