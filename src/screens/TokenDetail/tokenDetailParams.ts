/**
 * Token → TokenDetail 화면 파라미터 변환
 * (ERC-20 보내기에 필요한 컨트랙트 주소/소수 자릿수를 함께 넘긴다)
 */

import type { RootStackParamList } from '@/navigation/RootNavigator';
import type { Token } from '@/services/tokenService';

export function tokenDetailParams(
  token: Token,
): RootStackParamList['TokenDetail'] {
  return {
    symbol: token.symbol,
    name: token.name,
    balance: token.balance,
    usdValue: token.isTestnet ? null : token.usdValue ?? null,
    contractAddress: token.address === 'native' ? undefined : token.address,
    decimals: token.decimals,
    coingeckoId: token.coingeckoId,
    logoUrl: token.logoUrl,
  };
}
