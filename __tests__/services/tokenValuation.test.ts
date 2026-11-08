/**
 * 토큰 가치 합산 규칙 테스트 (홈/포트폴리오/포트폴리오 기록 공통)
 * - 가치를 아는 자산이 없으면 총액은 0이 아니라 null('—')
 * - 조회 실패와 "시세 출처 없음"을 구분한다
 */

import {
  isTestnetChainId,
  snapshotBlocker,
  summarizeTokenTotal,
  tokenUsdValue,
  totalNoteKind,
  type ValuationToken,
} from '../../src/services/tokenValuation';
import { customNetworkRegistry } from '../../src/services/customNetworks';

const priced = (usd: number, extra: Partial<ValuationToken> = {}) => ({
  balance: '1',
  balanceRaw: '1',
  usdValue: usd,
  priceAvailable: true,
  hasPriceSource: true,
  ...extra,
});

const unpricedLookup = (extra: Partial<ValuationToken> = {}) => ({
  balance: '1.5',
  balanceRaw: '1.5',
  usdValue: null,
  priceAvailable: false,
  hasPriceSource: true,
  ...extra,
});

const noSource = (extra: Partial<ValuationToken> = {}) => ({
  balance: '10',
  balanceRaw: '10',
  usdValue: null,
  priceAvailable: false,
  hasPriceSource: false,
  ...extra,
});

describe('tokenValuation', () => {
  afterEach(() => customNetworkRegistry.set([]));

  describe('summarizeTokenTotal', () => {
    it('is unknown for an empty list (unsupported network)', () => {
      expect(summarizeTokenTotal([])).toMatchObject({
        total: null,
        unknownReason: 'empty',
      });
    });

    it('is unknown, not 0, when every held token failed its price lookup', () => {
      const summary = summarizeTokenTotal([unpricedLookup()]);
      expect(summary.total).toBeNull();
      expect(totalNoteKind(summary)).toBe('lookupFailed');
    });

    it('is unknown when only tokens without a price source are held', () => {
      const summary = summarizeTokenTotal([noSource()]);
      expect(summary.total).toBeNull();
      expect(totalNoteKind(summary)).toBe('noPriceSource');
    });

    it('treats a failed balance as a lookup failure', () => {
      const summary = summarizeTokenTotal([
        priced(3000),
        { balance: '—', balanceRaw: '—', balanceError: true, usdValue: null },
      ]);
      expect(summary).toMatchObject({ total: 3000, partial: true });
      expect(totalNoteKind(summary)).toBe('partial');
    });

    it('excludes tokens without a price source without calling the total partial', () => {
      const summary = summarizeTokenTotal([priced(3000), noSource()]);
      expect(summary).toMatchObject({
        total: 3000,
        partial: false,
        excludesUnpriceable: true,
      });
      expect(totalNoteKind(summary)).toBe('unpriceable');
    });

    it('reports the lookup failure first when both kinds are excluded', () => {
      const summary = summarizeTokenTotal([
        priced(10),
        unpricedLookup(),
        noSource(),
      ]);
      expect(totalNoteKind(summary)).toBe('partial');
    });

    it('ignores unpriced tokens with a zero balance', () => {
      const summary = summarizeTokenTotal([
        priced(5),
        unpricedLookup({ balance: '0', balanceRaw: '0' }),
      ]);
      expect(summary).toMatchObject({ total: 5, partial: false });
      expect(totalNoteKind(summary)).toBeNull();
    });

    it('is unknown, not 0, when only zero-balance tokens are priced', () => {
      // ETH 1.5개의 시세는 못 받았고, 잔액 0인 USDT의 시세만 받음 → ₩0이 아니라 '—'
      const zeroUsdt = priced(0, { balance: '0', balanceRaw: '0' });
      const lookup = summarizeTokenTotal([unpricedLookup(), zeroUsdt]);
      expect(lookup).toMatchObject({
        total: null,
        unknownReason: 'lookupFailed',
      });
      expect(totalNoteKind(lookup)).toBe('lookupFailed');
      expect(snapshotBlocker([unpricedLookup(), zeroUsdt])).toBe(
        'lookupFailed',
      );

      // 잔액 0인 ETH + 시세 출처가 없는 보유 사용자 토큰 → '—' (기록도 하지 않음)
      const zeroEth = priced(0, { balance: '0', balanceRaw: '0' });
      const custom = summarizeTokenTotal([zeroEth, noSource()]);
      expect(custom).toMatchObject({
        total: null,
        unknownReason: 'noPriceSource',
      });
      expect(snapshotBlocker([zeroEth, noSource()])).toBe('noPriceSource');
    });

    it('is a real 0 when every token holds nothing', () => {
      expect(
        summarizeTokenTotal([noSource({ balance: '0', balanceRaw: '0' })])
          .total,
      ).toBe(0);
    });

    it('treats legacy objects without hasPriceSource as priceable (conservative)', () => {
      const summary = summarizeTokenTotal([
        { balance: '2', balanceRaw: '2', usdValue: null },
      ]);
      expect(summary.unknownReason).toBe('lookupFailed');
    });
  });

  describe('tokenUsdValue', () => {
    it('never turns NaN or a failed balance into a number', () => {
      expect(tokenUsdValue({ balance: '1', usdValue: Number.NaN })).toBeNull();
      expect(
        tokenUsdValue({ balance: '—', balanceError: true, value: 100 }),
      ).toBeNull();
      expect(tokenUsdValue({ balance: '1', value: Number.NaN })).toBeNull();
      expect(tokenUsdValue({ balance: '1', value: 250 })).toBe(250);
    });
  });

  describe('snapshotBlocker', () => {
    it('names the reason a snapshot cannot be recorded', () => {
      expect(snapshotBlocker([])).toBe('empty');
      expect(snapshotBlocker([priced(1, { isTestnet: true })])).toBe('testnet');
      expect(snapshotBlocker([priced(1), unpricedLookup()])).toBe(
        'lookupFailed',
      );
      expect(snapshotBlocker([noSource()])).toBe('noPriceSource');
      expect(snapshotBlocker([priced(1), noSource()])).toBeNull();
    });

    it('does not record $0 on a network with no priceable asset, even at a zero balance', () => {
      // 커스텀 네트워크: 기본 통화(시세 출처 없음) 잔액 0
      const emptyNative = noSource({ balance: '0', balanceRaw: '0' });
      expect(summarizeTokenTotal([emptyNative]).total).toBe(0);
      expect(snapshotBlocker([emptyNative])).toBe('noPriceSource');
      // 시세 출처가 있는 자산이 있으면 잔액 0이어도 기록한다 (진짜 ₩0)
      expect(
        snapshotBlocker([
          priced(0, { balance: '0', balanceRaw: '0' }),
          emptyNative,
        ]),
      ).toBeNull();
    });
  });

  describe('isTestnetChainId', () => {
    it('includes built-in testnets and custom networks marked as testnet', () => {
      expect(isTestnetChainId(11155111)).toBe(true);
      expect(isTestnetChainId(1)).toBe(false);
      customNetworkRegistry.set([
        {
          chainId: 97,
          name: 'BSC Testnet',
          rpcUrl: 'https://bsc-testnet.example.com',
          symbol: 'tBNB',
          isTestnet: true,
        },
        {
          chainId: 56,
          name: 'BNB Chain',
          rpcUrl: 'https://bsc.example.com',
          symbol: 'BNB',
        },
      ]);
      expect(isTestnetChainId(97)).toBe(true);
      expect(isTestnetChainId(56)).toBe(false);
    });
  });
});
