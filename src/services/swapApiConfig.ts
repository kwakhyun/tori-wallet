/**
 * 운영 빌드에서 API 키가 앱 바이너리에 포함되지 않도록 스왑 요청을 프록시로 보낸다.
 */

import Config from 'react-native-config';

const DIRECT_API_URL = 'https://api.0x.org';
const SUPPORTED_CHAIN_IDS = new Set([1, 137, 42161, 10, 8453]);

export type SwapApiOperation = 'quote' | 'price';

/**
 * 스왑 사용 가능 상태
 *  - supported: 사용 가능
 *  - unsupported-chain: 0x가 지원하지 않는 네트워크 (테스트넷 등)
 *  - not-configured: 지원 네트워크지만 운영 빌드에 스왑 프록시(SWAP_API_BASE_URL)가 없음
 */
export type SwapAvailability =
  | 'supported'
  | 'unsupported-chain'
  | 'not-configured';

function proxyBaseUrl(): string | undefined {
  return Config.SWAP_API_BASE_URL?.trim().replace(/\/$/, '') || undefined;
}

export function getSwapAvailability(chainId: number): SwapAvailability {
  if (!SUPPORTED_CHAIN_IDS.has(chainId)) return 'unsupported-chain';
  if (proxyBaseUrl() || __DEV__) return 'supported';
  return 'not-configured';
}

export function getSwapApiUrl(
  chainId: number,
  operation: SwapApiOperation,
  queryParams: URLSearchParams,
): string | null {
  if (!SUPPORTED_CHAIN_IDS.has(chainId)) return null;

  queryParams.set('chainId', chainId.toString());

  const baseUrl = proxyBaseUrl();
  if (baseUrl) {
    return `${baseUrl}/swap/allowance-holder/${operation}?${queryParams.toString()}`;
  }

  if (__DEV__) {
    return `${DIRECT_API_URL}/swap/allowance-holder/${operation}?${queryParams.toString()}`;
  }

  return null;
}

export function isSwapApiSupported(chainId: number): boolean {
  return getSwapAvailability(chainId) === 'supported';
}
