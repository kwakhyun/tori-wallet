/**
 * 토큰 가치 합산 규칙 (홈/포트폴리오/포트폴리오 기록이 모두 같은 규칙을 쓴다)
 *
 * 잔액이 있는데 가치를 모르는 토큰은 두 종류로 나눈다.
 *  1) 조회 실패: 잔액 조회가 실패했거나, 시세 출처(coingeckoId)가 있는데 가격을 받지 못함
 *  2) 시세 출처 없음: 사용자 토큰이나 커스텀 네트워크 기본 자산처럼 처음부터 가격을 알 수 없음
 *
 * - 가치를 아는 토큰이 하나도 없는데 가치를 모르는 보유 토큰이 있으면 총액은 모른다(null → '—').
 * - 목록이 비어 있어도 총액은 모른다 (지원하지 않는 네트워크 등).
 * - 그 밖에는 가치를 아는 토큰만 더하고, 어떤 종류가 빠졌는지 함께 알려 준다.
 *
 * 스토어/네트워크/네이티브 모듈에 의존하지 않는 순수 모듈이다
 * (화면 테스트가 tokenService를 통째로 모킹해도 이 규칙은 그대로 쓰인다).
 */

import { customNetworkRegistry } from './customNetworks';

/** 가치 계산에 필요한 최소 토큰 형태 (Token, 과거 형식 객체 모두 허용) */
export interface ValuationToken {
  balance: string;
  balanceRaw?: string;
  /** 과거 형식의 USD 가치 (usdValue가 없을 때만 사용) */
  value?: number;
  usdValue?: number | null;
  priceAvailable?: boolean;
  balanceError?: boolean;
  isTestnet?: boolean;
  /**
   * 시세 출처가 있는지. false면 처음부터 가격을 알 수 없는 토큰이다.
   * 값이 없으면(과거 형식) 보수적으로 시세 출처가 있다고 본다.
   */
  hasPriceSource?: boolean;
}

/** 실제 가치가 없는 기본 테스트넷 체인 */
export const TESTNET_CHAIN_IDS: ReadonlySet<number> = new Set<number>([
  11155111, 5, 17000, 80002, 84532,
]);

/** 테스트넷인지 (기본 테스트넷 또는 테스트넷으로 등록한 커스텀 네트워크) */
export function isTestnetChainId(chainId: number): boolean {
  return (
    TESTNET_CHAIN_IDS.has(chainId) ||
    customNetworkRegistry.get(chainId)?.isTestnet === true
  );
}

/** 토큰의 USD 가치 (모르면 null). usdValue가 없는 과거 형식은 value를 사용 */
export function tokenUsdValue(token: ValuationToken): number | null {
  if (token.balanceError || token.isTestnet) return null;
  if (token.usdValue !== undefined) {
    return token.usdValue !== null && Number.isFinite(token.usdValue)
      ? token.usdValue
      : null;
  }
  if (token.priceAvailable === false) return null;
  return typeof token.value === 'number' && Number.isFinite(token.value)
    ? token.value
    : null;
}

/** 잔액이 있거나 있을 수 있는지 (조회 실패/해석 불가는 보유로 본다) */
export function mayHoldBalance(token: ValuationToken): boolean {
  if (token.balanceError) return true;
  const amount = Number(token.balanceRaw ?? token.balance);
  return Number.isFinite(amount) ? amount > 0 : true;
}

/** 처음부터 가격을 알 수 없는 토큰인지 (조회 실패와 구분) */
export function isUnpriceable(token: ValuationToken): boolean {
  if (token.balanceError) return false;
  return token.isTestnet === true || token.hasPriceSource === false;
}

export type TotalUnknownReason = 'empty' | 'lookupFailed' | 'noPriceSource';

export interface TotalSummary {
  /** 표시할 총 자산 (USD). 모르면 null → '—' */
  total: number | null;
  /** 잔액/시세 조회 실패로 빠진 보유 자산이 있다 (total이 있을 때만) */
  partial: boolean;
  /** 시세 정보가 없어 빠진 보유 자산이 있다 (total이 있을 때만) */
  excludesUnpriceable: boolean;
  /** total이 null인 이유 */
  unknownReason: TotalUnknownReason | null;
}

/** 총 자산과 합계에서 빠진 자산의 종류 */
export function summarizeTokenTotal(
  tokens: readonly ValuationToken[],
): TotalSummary {
  if (tokens.length === 0) {
    return {
      total: null,
      partial: false,
      excludesUnpriceable: false,
      unknownReason: 'empty',
    };
  }

  let total = 0;
  let anyValued = false;
  let lookupFailed = 0;
  let unpriceable = 0;
  for (const token of tokens) {
    const usd = tokenUsdValue(token);
    if (usd !== null) {
      total += usd;
      anyValued = true;
      continue;
    }
    if (!mayHoldBalance(token)) continue;
    if (isUnpriceable(token)) unpriceable += 1;
    else lookupFailed += 1;
  }

  if (!anyValued && lookupFailed + unpriceable > 0) {
    return {
      total: null,
      partial: false,
      excludesUnpriceable: false,
      unknownReason: lookupFailed > 0 ? 'lookupFailed' : 'noPriceSource',
    };
  }
  return {
    total,
    partial: lookupFailed > 0,
    excludesUnpriceable: unpriceable > 0,
    unknownReason: null,
  };
}

export type TotalNoteKind =
  | 'partial'
  | 'unpriceable'
  | 'lookupFailed'
  | 'noPriceSource';

export const TOTAL_NOTES: Record<TotalNoteKind, string> = {
  partial: '일부 자산은 잔액이나 시세를 불러오지 못해 제외했습니다',
  unpriceable: '시세 정보가 없는 자산은 합계에서 제외됩니다',
  lookupFailed: '잔액이나 시세를 불러오지 못해 총 자산을 계산할 수 없습니다',
  noPriceSource: '시세 정보가 없는 자산이라 총 자산을 표시할 수 없습니다',
};

/** 총 자산 아래에 보여 줄 안내 (조회 실패를 시세 출처 없음보다 먼저 알린다) */
export function totalNoteKind(summary: TotalSummary): TotalNoteKind | null {
  if (summary.total === null) {
    return summary.unknownReason === 'empty' || !summary.unknownReason
      ? null
      : summary.unknownReason;
  }
  if (summary.partial) return 'partial';
  if (summary.excludesUnpriceable) return 'unpriceable';
  return null;
}

export type SnapshotBlocker =
  | 'empty'
  | 'testnet'
  | 'lookupFailed'
  | 'noPriceSource';

/**
 * 포트폴리오 기록(스냅샷)을 남기면 안 되는 이유 (남겨도 되면 null)
 * 조회 실패나 가격 미확인 때문에 0/부분합으로 계산된 총액이 기록되면 차트와
 * 변동률이 거짓이 된다. 시세 출처가 없는 자산은 처음부터 합계에서 빠지므로
 * 기록을 막지 않는다 (가치를 아는 자산이 하나도 없으면 막는다).
 */
export function snapshotBlocker(
  tokens: readonly ValuationToken[],
): SnapshotBlocker | null {
  if (tokens.length === 0) return 'empty';
  if (tokens.some(token => token.isTestnet)) return 'testnet';
  if (tokens.some(token => token.balanceError)) return 'lookupFailed';
  // 시세 출처가 있는 자산이 하나도 없으면(커스텀 네트워크 등) 잔액이 0이어도 기록하지 않는다.
  // 0으로 남긴 기록이 나중에 잔액이 생긴 뒤에도 '최고 자산액 ₩0'처럼 보이지 않게 한다.
  if (tokens.every(token => token.hasPriceSource === false)) {
    return 'noPriceSource';
  }
  const summary = summarizeTokenTotal(tokens);
  if (summary.total === null) {
    return summary.unknownReason === 'noPriceSource'
      ? 'noPriceSource'
      : 'lookupFailed';
  }
  return summary.partial ? 'lookupFailed' : null;
}

/** 스냅샷으로 저장해도 되는지 */
export function isSnapshotReliable(tokens: readonly ValuationToken[]): boolean {
  return snapshotBlocker(tokens) === null;
}
