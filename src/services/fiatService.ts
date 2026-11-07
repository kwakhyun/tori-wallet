/**
 * 법정화폐 환율 서비스
 *
 * 시세는 USD 기준으로 조회하고, 표시 통화가 USD가 아니면 환율을 곱한다.
 * 환율을 가져오지 못하면 null을 반환해 호출 측이 USD로 대체 표시하게 한다.
 */

import { createLogger } from '@/utils/logger';
import type { FiatCurrency } from '@/store/preferencesStore';

const logger = createLogger('FiatService');

const CACHE_MS = 30 * 60 * 1000;
const FAILURE_BACKOFF_MS = 60 * 1000;
const EXCHANGE_RATES_URL = 'https://api.coingecko.com/api/v3/exchange_rates';

interface RateEntry {
  rate: number;
  fetchedAt: number;
}

type Listener = () => void;

class FiatService {
  private rates = new Map<FiatCurrency, RateEntry>([
    ['USD', { rate: 1, fetchedAt: Number.MAX_SAFE_INTEGER }],
  ]);
  private inflight: Promise<void> | null = null;
  private lastFailureAt = 0;
  private listeners = new Set<Listener>();

  /** USD 1단위당 대상 통화 환율 (모르면 null) */
  getRate(currency: FiatCurrency): number | null {
    if (currency === 'USD') return 1;
    const entry = this.rates.get(currency);
    if (!entry) return null;
    return entry.rate;
  }

  isStale(currency: FiatCurrency): boolean {
    if (currency === 'USD') return false;
    const entry = this.rates.get(currency);
    return !entry || Date.now() - entry.fetchedAt > CACHE_MS;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async refresh(force = false): Promise<void> {
    if (!force && !this.isStale('KRW')) return;
    if (!force && Date.now() - this.lastFailureAt < FAILURE_BACKOFF_MS) return;
    if (this.inflight) return this.inflight;

    this.inflight = (async () => {
      try {
        const response = await fetch(EXCHANGE_RATES_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as {
          rates?: Record<string, { value?: number }>;
        };
        const usd = data.rates?.usd?.value;
        const krw = data.rates?.krw?.value;
        if (!usd || !krw || !Number.isFinite(usd) || !Number.isFinite(krw)) {
          throw new Error('Invalid exchange rate payload');
        }
        this.rates.set('KRW', { rate: krw / usd, fetchedAt: Date.now() });
        this.listeners.forEach(listener => listener());
      } catch (error) {
        this.lastFailureAt = Date.now();
        logger.warn('Exchange rate fetch failed', error);
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }

  /** 테스트용 */
  reset(): void {
    this.rates = new Map([
      ['USD', { rate: 1, fetchedAt: Number.MAX_SAFE_INTEGER }],
    ]);
    this.inflight = null;
    this.lastFailureAt = 0;
  }
}

export const fiatService = new FiatService();

export interface FormatFiatOptions {
  /** 소수 자릿수 강제 (기본: KRW 0, USD 2) */
  maximumFractionDigits?: number;
  /** 아주 작은 금액을 "< ₩1" 형태로 표시 */
  showTinyAsLessThan?: boolean;
  /** 부호 표시 (+/-) */
  signed?: boolean;
  compact?: boolean;
}

/**
 * USD 금액을 표시 통화로 변환해 포맷한다.
 * usdValue가 null/undefined/NaN이면 '—'를 반환한다(조회 실패를 0으로 보이지 않기 위함).
 * 환율을 모르면 USD로 표시한다.
 */
export function formatFiatValue(
  usdValue: number | null | undefined,
  currency: FiatCurrency,
  rate: number | null,
  options: FormatFiatOptions = {},
): string {
  if (
    usdValue === null ||
    usdValue === undefined ||
    !Number.isFinite(usdValue)
  ) {
    return '—';
  }
  const effectiveCurrency: FiatCurrency = rate === null ? 'USD' : currency;
  const value = usdValue * (rate ?? 1);
  const digits =
    options.maximumFractionDigits ?? (effectiveCurrency === 'KRW' ? 0 : 2);
  const locale = effectiveCurrency === 'KRW' ? 'ko-KR' : 'en-US';
  const abs = Math.abs(value);
  const minUnit = effectiveCurrency === 'KRW' ? 1 : 0.01;

  if (options.showTinyAsLessThan && abs > 0 && abs < minUnit) {
    const unit = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: effectiveCurrency,
      maximumFractionDigits: digits,
    }).format(minUnit);
    return `< ${unit}`;
  }

  const formatted = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: effectiveCurrency,
    minimumFractionDigits: options.compact ? 0 : digits,
    maximumFractionDigits: digits,
    notation: options.compact ? 'compact' : 'standard',
  }).format(abs);

  if (options.signed) {
    if (value > 0) return `+${formatted}`;
    if (value < 0) return `-${formatted}`;
    return formatted;
  }
  return value < 0 ? `-${formatted}` : formatted;
}

export const HIDDEN_VALUE = '••••';
