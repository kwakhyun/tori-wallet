/**
 * Tori Wallet - Format Utils Tests
 * 포맷 유틸리티 함수 테스트
 */

import {
  weiToEth,
  ethToWei,
  formatTokenAmount,
  parseTokenAmount,
  formatNumber,
  formatCurrency,
  formatCompactNumber,
  formatGwei,
  formatCrypto,
  formatPercentage,
} from '../../src/utils/format';

describe('Format Utils', () => {
  describe('weiToEth', () => {
    it('should convert wei to eth', () => {
      const wei = BigInt('1000000000000000000'); // 1 ETH in wei
      expect(weiToEth(wei)).toBe('1');
    });

    it('should handle decimal values', () => {
      const wei = BigInt('1500000000000000000'); // 1.5 ETH
      expect(weiToEth(wei)).toBe('1.5');
    });

    it('should handle small values', () => {
      const wei = BigInt('1000000000000000'); // 0.001 ETH
      expect(weiToEth(wei)).toBe('0.001');
    });

    it('should handle zero', () => {
      expect(weiToEth(BigInt(0))).toBe('0');
    });
  });

  describe('ethToWei', () => {
    it('should convert eth to wei', () => {
      expect(ethToWei('1')).toBe(BigInt('1000000000000000000'));
    });

    it('should handle decimal values', () => {
      expect(ethToWei('1.5')).toBe(BigInt('1500000000000000000'));
    });

    it('should handle small decimals', () => {
      expect(ethToWei('0.001')).toBe(BigInt('1000000000000000'));
    });
  });

  describe('formatTokenAmount', () => {
    it('should format with 18 decimals (default)', () => {
      const amount = BigInt('1000000000000000000');
      expect(formatTokenAmount(amount)).toBe('1');
    });

    it('should format with 6 decimals (USDC)', () => {
      const amount = BigInt('1000000');
      expect(formatTokenAmount(amount, 6)).toBe('1');
    });

    it('should format with 8 decimals (WBTC)', () => {
      const amount = BigInt('100000000');
      expect(formatTokenAmount(amount, 8)).toBe('1');
    });
  });

  describe('parseTokenAmount', () => {
    it('should parse with 18 decimals (default)', () => {
      expect(parseTokenAmount('1')).toBe(BigInt('1000000000000000000'));
    });

    it('should parse with 6 decimals (USDC)', () => {
      expect(parseTokenAmount('1', 6)).toBe(BigInt('1000000'));
    });

    it('should handle decimals', () => {
      expect(parseTokenAmount('1.5', 6)).toBe(BigInt('1500000'));
    });
  });

  describe('formatNumber', () => {
    it('should format large numbers with thousands separator', () => {
      expect(formatNumber(1234567.89)).toBe('1,234,567.89');
    });

    it('should format with custom decimal places', () => {
      expect(formatNumber(1.23456789, 2)).toBe('1.23');
    });

    it('should handle string input', () => {
      expect(formatNumber('1234.5678')).toBe('1,234.5678');
    });

    it('should handle NaN', () => {
      expect(formatNumber(NaN)).toBe('0');
    });

    it('should handle invalid string', () => {
      expect(formatNumber('invalid')).toBe('0');
    });

    it('should handle zero', () => {
      expect(formatNumber(0)).toBe('0');
    });
  });

  describe('formatCurrency', () => {
    it('should format USD by default', () => {
      expect(formatCurrency(1234.56)).toBe('$1,234.56');
    });

    it('should handle string input', () => {
      expect(formatCurrency('1234.56')).toBe('$1,234.56');
    });

    it('should format KRW', () => {
      const result = formatCurrency(1234.56, 'KRW');
      expect(result).toContain('1,234');
    });

    it('should handle NaN', () => {
      expect(formatCurrency(NaN)).toBe('$0.00');
    });

    it('should handle zero', () => {
      expect(formatCurrency(0)).toBe('$0.00');
    });

    it('should handle negative values', () => {
      expect(formatCurrency(-100)).toBe('-$100.00');
    });
  });

  describe('formatCompactNumber', () => {
    it('should format billions', () => {
      expect(formatCompactNumber(1500000000)).toBe('1.50B');
    });

    it('should format millions', () => {
      expect(formatCompactNumber(1500000)).toBe('1.50M');
    });

    it('should format thousands', () => {
      expect(formatCompactNumber(1500)).toBe('1.50K');
    });

    it('should format small numbers', () => {
      expect(formatCompactNumber(150)).toBe('150.00');
    });

    it('should handle zero', () => {
      expect(formatCompactNumber(0)).toBe('0.00');
    });
  });

  describe('formatGwei', () => {
    it('should convert wei to gwei', () => {
      const wei = BigInt('1000000000'); // 1 Gwei
      expect(formatGwei(wei)).toBe('1');
    });

    it('should handle large values', () => {
      const wei = BigInt('50000000000'); // 50 Gwei
      expect(formatGwei(wei)).toBe('50');
    });
  });

  describe('formatCrypto', () => {
    it('should format crypto amount with symbol', () => {
      expect(formatCrypto(1.23456789, 'ETH')).toBe('1.234568 ETH');
    });

    it('should handle string input', () => {
      expect(formatCrypto('1.23456789', 'BTC')).toBe('1.234568 BTC');
    });

    it('should handle small amounts', () => {
      expect(formatCrypto(0.000001, 'ETH')).toBe('0.000001 ETH');
    });

    it('should handle NaN', () => {
      expect(formatCrypto(NaN, 'ETH')).toBe('0 ETH');
    });

    it('should respect custom decimals', () => {
      expect(formatCrypto(1.23456789, 'USDC', 2)).toBe('1.23 USDC');
    });
  });

  describe('formatPercentage', () => {
    it('should format positive percentages with plus sign', () => {
      expect(formatPercentage(5.5)).toBe('+5.50%');
    });

    it('should format negative percentages', () => {
      expect(formatPercentage(-3.2)).toBe('-3.20%');
    });

    it('should format zero with plus sign', () => {
      expect(formatPercentage(0)).toBe('+0.00%');
    });

    it('should handle very small values', () => {
      expect(formatPercentage(0.01)).toBe('+0.01%');
    });

    it('should handle large values', () => {
      expect(formatPercentage(100.55)).toBe('+100.55%');
    });
  });
});
