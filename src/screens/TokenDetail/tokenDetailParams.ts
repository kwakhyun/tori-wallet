/**
 * Token → TokenDetail 화면 파라미터 변환
 * (ERC-20 보내기에 필요한 컨트랙트 주소/소수 자릿수를 함께 넘긴다)
 *
 * 토큰 목록을 읽은 체인 ID를 함께 넘겨 상세 화면이 그 체인에 고정되게 한다.
 * (보는 동안 dApp 요청 등으로 활성 네트워크가 바뀌어도 다른 체인의 잔액/시세를
 *  이 토큰의 것처럼 보여 주지 않는다)
 */

import type { RootStackParamList } from '@/navigation/RootNavigator';
import type { Token } from '@/services/tokenService';

export function tokenDetailParams(
  token: Token,
  chainId: number,
): RootStackParamList['TokenDetail'] {
  return {
    symbol: token.symbol,
    name: token.name,
    // 잔액 조회 실패는 '—' 그대로 (0으로 보이지 않게)
    balance: token.balance,
    usdValue: token.isTestnet ? null : token.usdValue ?? null,
    contractAddress: token.address === 'native' ? undefined : token.address,
    decimals: token.decimals,
    coingeckoId: token.coingeckoId,
    logoUrl: token.logoUrl,
    chainId,
  };
}
