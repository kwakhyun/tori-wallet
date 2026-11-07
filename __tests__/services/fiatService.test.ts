/**
 * 법정화폐 환율/포맷 테스트
 */

import {
  fiatService,
  formatFiatValue,
  HIDDEN_VALUE,
} from '../../src/services/fiatService';

describe('formatFiatValue', () => {
  it('returns a dash for unknown values instead of zero', () => {
    expect(formatFiatValue(null, 'USD', 1)).toBe('—');
    expect(formatFiatValue(undefined, 'KRW', 1400)).toBe('—');
    expect(formatFiatValue(NaN, 'USD', 1)).toBe('—');
  });

  it('formats USD with two decimals', () => {
    expect(formatFiatValue(1234.5, 'USD', 1)).toBe('$1,234.50');
  });

  it('converts to KRW with the given rate and no decimals', () => {
    const formatted = formatFiatValue(10, 'KRW', 1380.4);
    expect(formatted).toContain('13,804');
    expect(formatted).toMatch(/₩|원/);
  });

  it('falls back to USD when the KRW rate is unknown', () => {
    expect(formatFiatValue(5, 'KRW', null)).toBe('$5.00');
  });

  it('shows tiny amounts as less-than', () => {
    expect(formatFiatValue(0.001, 'USD', 1, { showTinyAsLessThan: true })).toBe(
      '< $0.01',
    );
  });

  it('adds explicit signs when requested', () => {
    expect(formatFiatValue(3, 'USD', 1, { signed: true })).toBe('+$3.00');
    expect(formatFiatValue(-3, 'USD', 1, { signed: true })).toBe('-$3.00');
  });

  it('exposes a hidden placeholder', () => {
    expect(HIDDEN_VALUE).toBe('••••');
  });
});

describe('fiatService', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    // jest.setup.js가 기본으로 막아 둔 refresh를 실제 구현으로 되돌린다.
    (fiatService.refresh as jest.Mock).mockRestore?.();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    fiatService.reset();
  });

  it('always knows the USD rate', () => {
    expect(fiatService.getRate('USD')).toBe(1);
  });

  it('derives the KRW rate from CoinGecko exchange rates and notifies listeners', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        rates: { usd: { value: 100000 }, krw: { value: 140000000 } },
      }),
    }) as unknown as typeof fetch;
    const listener = jest.fn();
    const unsubscribe = fiatService.subscribe(listener);

    await fiatService.refresh(true);

    expect(fiatService.getRate('KRW')).toBe(1400);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it('keeps the rate unknown when the request fails', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('offline')) as unknown as typeof fetch;

    await fiatService.refresh(true);

    expect(fiatService.getRate('KRW')).toBeNull();
  });
});
