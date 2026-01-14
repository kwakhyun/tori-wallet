/**
 * Tori Wallet - Address Utils Tests
 * 주소 관련 유틸리티 함수 테스트
 */

import {
  shortenAddress,
  isValidAddress,
  toChecksumAddress,
  addressesEqual,
} from '../../src/utils/address';

describe('Address Utils', () => {
  describe('shortenAddress', () => {
    it('should shorten a valid address with default parameters', () => {
      const address = '0x1234567890123456789012345678901234567890';
      expect(shortenAddress(address)).toBe('0x1234...7890');
    });

    it('should shorten with custom start and end chars', () => {
      const address = '0x1234567890123456789012345678901234567890';
      expect(shortenAddress(address, 8, 8)).toBe('0x123456...34567890');
      expect(shortenAddress(address, 4, 2)).toBe('0x12...90');
    });

    it('should return empty string as-is', () => {
      expect(shortenAddress('')).toBe('');
    });

    it('should return short addresses unchanged', () => {
      expect(shortenAddress('0x1234')).toBe('0x1234');
      expect(shortenAddress('0x123456')).toBe('0x123456');
    });

    it('should handle null/undefined safely', () => {
      expect(shortenAddress(null as unknown as string)).toBe(null);
      expect(shortenAddress(undefined as unknown as string)).toBe(undefined);
    });
  });

  describe('isValidAddress', () => {
    it('should validate correct Ethereum addresses', () => {
      expect(isValidAddress('0x1234567890123456789012345678901234567890')).toBe(
        true,
      );
      expect(isValidAddress('0xABCDEF0123456789ABCDEF0123456789ABCDEF01')).toBe(
        true,
      );
      expect(isValidAddress('0xabcdef0123456789abcdef0123456789abcdef01')).toBe(
        true,
      );
    });

    it('should reject addresses without 0x prefix', () => {
      expect(isValidAddress('1234567890123456789012345678901234567890')).toBe(
        false,
      );
    });

    it('should reject addresses with wrong length', () => {
      expect(isValidAddress('0x1234')).toBe(false);
      expect(
        isValidAddress('0x123456789012345678901234567890123456789012345678'),
      ).toBe(false);
    });

    it('should reject addresses with invalid characters', () => {
      expect(isValidAddress('0xGHIJKL0123456789012345678901234567890123')).toBe(
        false,
      );
      expect(isValidAddress('0x!@#$%^&*()123456789012345678901234567890')).toBe(
        false,
      );
    });

    it('should reject empty string', () => {
      expect(isValidAddress('')).toBe(false);
    });

    it('should reject non-hex strings', () => {
      expect(isValidAddress('invalid')).toBe(false);
      expect(isValidAddress('not an address')).toBe(false);
    });
  });

  describe('toChecksumAddress', () => {
    it('should return the address as-is (placeholder implementation)', () => {
      const address = '0x1234567890123456789012345678901234567890';
      expect(toChecksumAddress(address)).toBe(address);
    });
  });

  describe('addressesEqual', () => {
    it('should compare addresses case-insensitively', () => {
      expect(
        addressesEqual(
          '0x1234567890123456789012345678901234567890',
          '0x1234567890123456789012345678901234567890',
        ),
      ).toBe(true);

      expect(
        addressesEqual(
          '0xABCDEF0123456789ABCDEF0123456789ABCDEF01',
          '0xabcdef0123456789abcdef0123456789abcdef01',
        ),
      ).toBe(true);
    });

    it('should return false for different addresses', () => {
      expect(
        addressesEqual(
          '0x1234567890123456789012345678901234567890',
          '0x0987654321098765432109876543210987654321',
        ),
      ).toBe(false);
    });

    it('should return false when either address is null or undefined', () => {
      expect(
        addressesEqual(null, '0x1234567890123456789012345678901234567890'),
      ).toBe(false);
      expect(
        addressesEqual('0x1234567890123456789012345678901234567890', null),
      ).toBe(false);
      expect(addressesEqual(undefined, undefined)).toBe(false);
      expect(addressesEqual(null, null)).toBe(false);
    });
  });
});
