/**
 * 운영 빌드에서 API 키가 앱 바이너리에 포함되지 않도록 스왑 요청을 프록시로 보낸다.
 */

import Config from 'react-native-config';

const DIRECT_API_URL = 'https://api.0x.org';
const SUPPORTED_CHAIN_IDS = new Set([1, 137, 42161, 10, 8453]);

export type SwapApiOperation = 'quote' | 'price';

export function getSwapApiUrl(
  chainId: number,
  operation: SwapApiOperation,
  queryParams: URLSearchParams,
): string | null {
  if (!SUPPORTED_CHAIN_IDS.has(chainId)) return null;

  queryParams.set('chainId', chainId.toString());

  const proxyBaseUrl = Config.SWAP_API_BASE_URL?.trim().replace(/\/$/, '');
  if (proxyBaseUrl) {
    return `${proxyBaseUrl}/swap/allowance-holder/${operation}?${queryParams.toString()}`;
  }

  if (__DEV__) {
    return `${DIRECT_API_URL}/swap/allowance-holder/${operation}?${queryParams.toString()}`;
  }

  return null;
}

export function isSwapApiSupported(chainId: number): boolean {
  return (
    SUPPORTED_CHAIN_IDS.has(chainId) &&
    (__DEV__ || !!Config.SWAP_API_BASE_URL?.trim())
  );
}
