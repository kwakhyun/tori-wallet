/**
 * 네이티브 토큰 USD 가격 (수수료 법정화폐 환산용)
 *
 * 테스트넷 토큰은 가치가 없으므로 null을 반환해 가짜 금액을 표시하지 않는다.
 * 조회 실패(0 포함)도 null로 처리한다.
 */

import { useQuery } from '@tanstack/react-query';
import { coinService } from '@/services/coinService';
import { chainClient } from '@/services/chainClient';

export function useNativeUsdPrice(chainId: number | undefined): number | null {
  const isTestnet =
    chainId === undefined || chainClient.getChainInfo(chainId)?.isTestnet;
  const { data } = useQuery({
    queryKey: ['nativeUsdPrice', chainId],
    queryFn: () => coinService.getNativeTokenPrice(chainId as number),
    enabled: !isTestnet,
    staleTime: 5 * 60 * 1000,
  });
  if (isTestnet || !data || !Number.isFinite(data) || data <= 0) return null;
  return data;
}

/** wei 금액을 USD로 환산 (가격을 모르면 null) */
export function weiToUsd(wei: bigint, usdPrice: number | null): number | null {
  if (usdPrice === null) return null;
  return (Number(wei) / 1e18) * usdPrice;
}
