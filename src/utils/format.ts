/**
 * 숫자/통화 포맷팅 유틸리티
 */

import { formatEther, parseEther, formatUnits, parseUnits } from 'viem';

/**
 * Wei를 ETH로 변환
 */
export function weiToEth(wei: bigint): string {
  return formatEther(wei);
}

/**
 * ETH를 Wei로 변환
 */
export function ethToWei(eth: string): bigint {
  return parseEther(eth);
}

/**
 * 토큰 단위 변환 (decimals 적용)
 */
export function formatTokenAmount(
  amount: bigint,
  decimals: number = 18,
): string {
  return formatUnits(amount, decimals);
}

/**
 * 토큰 금액을 최소 단위로 변환
 */
export function parseTokenAmount(
  amount: string,
  decimals: number = 18,
): bigint {
  return parseUnits(amount, decimals);
}

/**
 * 숫자 포맷팅 (천 단위 구분)
 */
export function formatNumber(value: number | string, decimals = 4): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(num)) return '0';

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(num);
}

/**
 * USD 통화 포맷팅
 */
export function formatCurrency(
  value: number | string,
  currency = 'USD',
): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(num)) return '$0.00';

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * 큰 숫자 압축 표시 (1.2K, 1.5M, 2.3B)
 */
export function formatCompactNumber(value: number): string {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(2)}K`;
  }
  return value.toFixed(2);
}

/**
 * 가스 가격 Gwei 변환
 */
export function formatGwei(wei: bigint): string {
  return formatUnits(wei, 9);
}

/**
 * 암호화폐 금액 포맷팅
 */
export function formatCrypto(
  value: number | string,
  symbol: string,
  decimals = 6,
): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(num)) return `0 ${symbol}`;

  return `${formatNumber(num, decimals)} ${symbol}`;
}

/**
 * 퍼센트 포맷팅 (+/-5.50%)
 */
export function formatPercentage(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/**
 * 화면 표시용 암호화폐 수량 포맷 (모든 화면에서 같은 규칙 사용)
 *  - 0 → "0"
 *  - 0 < x < 0.000001 → "< 0.000001"
 *  - x < 1 → 최대 6자리 소수
 *  - x >= 1 → 최대 4자리 소수, 천 단위 구분
 * 숫자로 해석할 수 없으면 null 대신 '—'를 반환한다.
 */
export function formatDisplayAmount(
  value: number | string | null | undefined,
): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string' && value.trim().startsWith('<')) {
    return value.trim();
  }
  const num = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(num)) return '—';
  if (num === 0) return '0';
  const abs = Math.abs(num);
  if (abs < 0.000001) return num < 0 ? '> -0.000001' : '< 0.000001';
  const maximumFractionDigits = abs < 1 ? 6 : 4;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(num);
}
