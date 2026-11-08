/**
 * ENS 이름 해석 (메인넷 레지스트리)
 *
 * ENS는 이더리움 메인넷에 있으므로 활성 네트워크와 관계없이 메인넷 클라이언트로
 * 조회한다. 이름은 ENSIP-15(viem normalize)로 정규화한 뒤 조회해 동형 문자
 * (homoglyph) 이름이 다른 주소로 해석되지 않게 한다.
 *
 * 이름은 체인마다 다른 주소를 둘 수 있다(ENSIP-11/19). 메인넷이 아닌 네트워크로
 * 보낼 때는 그 체인의 기록 → 모든 EVM 체인용 기본 기록 → 이더리움 메인넷 기록 순으로
 * 찾고, 메인넷 기록으로 대신한 경우 source: 'default'로 알려 화면이 경고하게 한다.
 */

import { getAddress, isAddress } from 'viem';
import { normalize, toCoinType } from 'viem/ens';
import { chainClient } from './chainClient';

const ENS_CHAIN_ID = 1;
const CACHE_MS = 5 * 60 * 1000;
/** ENSIP-19 기본 EVM 주소(모든 EVM 체인에 쓰는 주소) coinType: 0x80000000 */
const DEFAULT_EVM_COIN_TYPE = 0x80000000n;

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

/**
 * 주소 기록의 출처
 *  - chain: 조회한 네트워크용 기록 (메인넷은 ETH 기록, 다른 체인은 체인별 기록 또는
 *    모든 EVM 체인용 기본 기록)
 *  - default: 그 네트워크용 기록이 없어 이더리움 메인넷 기록으로 대신 해석함
 */
export type EnsRecordSource = 'chain' | 'default';

export interface EnsResolution {
  /** 정규화된 이름 */
  name: string;
  address: `0x${string}`;
  source: EnsRecordSource;
}

const cache = new Map<string, { value: EnsResolution; at: number }>();

function chainCoinType(chainId: number): bigint | null {
  try {
    return toCoinType(chainId);
  } catch {
    // ENSIP-11 범위를 벗어난 체인 ID (2^31 이상)
    return null;
  }
}

function usableAddress(value: unknown): `0x${string}` | null {
  if (
    typeof value !== 'string' ||
    !isAddress(value, { strict: false }) ||
    /^0x0{40}$/i.test(value)
  )
    return null;
  return getAddress(value) as `0x${string}`;
}

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
   * ENS 이름을 chainId 네트워크에서 쓸 주소로 해석한다 (기본: 이더리움 메인넷).
   * 연결된 주소가 없으면 EnsError('NOT_FOUND').
   */
  async resolve(
    input: string,
    chainId: number = ENS_CHAIN_ID,
  ): Promise<EnsResolution> {
    const name = normalizeEnsName(input);
    const cacheKey = `${name}|${chainId}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

    // 우선순위 순서의 조회 목록
    const lookups: {
      source: EnsRecordSource;
      params: { name: string; coinType?: bigint };
    }[] = [];
    if (chainId === ENS_CHAIN_ID) {
      lookups.push({ source: 'chain', params: { name } });
    } else {
      const coinType = chainCoinType(chainId);
      if (coinType !== null)
        lookups.push({ source: 'chain', params: { name, coinType } });
      lookups.push({
        source: 'chain',
        params: { name, coinType: DEFAULT_EVM_COIN_TYPE },
      });
      lookups.push({ source: 'default', params: { name } });
    }

    let results: PromiseSettledResult<string | null | undefined>[];
    try {
      const client = chainClient.getClient(ENS_CHAIN_ID);
      results = await Promise.allSettled(
        lookups.map(lookup => client.getEnsAddress(lookup.params)),
      );
    } catch {
      throw new EnsError('NETWORK');
    }

    for (let index = 0; index < lookups.length; index++) {
      const result = results[index];
      // 우선순위가 높은 기록을 확인하지 못했으면 낮은 기록(다른 주소일 수 있음)으로
      // 넘어가지 않는다.
      if (result.status === 'rejected') throw new EnsError('NETWORK');
      const address = usableAddress(result.value);
      if (address) {
        const value: EnsResolution = {
          name,
          address,
          source: lookups[index].source,
        };
        cache.set(cacheKey, { value, at: Date.now() });
        return value;
      }
    }
    throw new EnsError('NOT_FOUND');
  },

  clearCache(): void {
    cache.clear();
  },
};

export default ensService;
