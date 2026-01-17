/**
 * 보안 스토어 테스트
 */

import { renderHook, act } from '@testing-library/react-native';
import {
  useSecurityStore,
  AUTO_LOCK_OPTIONS,
} from '../../src/store/securityStore';

describe('SecurityStore', () => {
  beforeEach(() => {
    // 스토어 초기화
    const { result } = renderHook(() => useSecurityStore());
    act(() => {
      result.current.clearRecentAddresses();
    });
  });

  describe('AUTO_LOCK_OPTIONS', () => {
    it('should have all expected options', () => {
      expect(AUTO_LOCK_OPTIONS.immediate).toBe(0);
      expect(AUTO_LOCK_OPTIONS['30s']).toBe(30000);
      expect(AUTO_LOCK_OPTIONS['1m']).toBe(60000);
      expect(AUTO_LOCK_OPTIONS['5m']).toBe(300000);
      expect(AUTO_LOCK_OPTIONS['15m']).toBe(900000);
      expect(AUTO_LOCK_OPTIONS.never).toBe(-1);
    });
  });

  describe('자동 잠금 설정', () => {
    it('should set auto lock timeout', () => {
      const { result } = renderHook(() => useSecurityStore());

      act(() => {
        result.current.setAutoLockTimeout('5m');
      });

      expect(result.current.autoLockTimeout).toBe('5m');
    });

    it('should update last active time', () => {
      const { result } = renderHook(() => useSecurityStore());
      const before = result.current.lastActiveTime;

      // 시간이 지남을 시뮬레이션
      jest.advanceTimersByTime(100);

      act(() => {
        result.current.updateLastActiveTime();
      });

      expect(result.current.lastActiveTime).toBeGreaterThanOrEqual(before);
    });
  });

  describe('트랜잭션 보안', () => {
    it('should set require PIN for transaction', () => {
      const { result } = renderHook(() => useSecurityStore());

      act(() => {
        result.current.setRequirePinForTransaction(false);
      });

      expect(result.current.requirePinForTransaction).toBe(false);

      act(() => {
        result.current.setRequirePinForTransaction(true);
      });

      expect(result.current.requirePinForTransaction).toBe(true);
    });

    it('should set transaction limit', () => {
      const { result } = renderHook(() => useSecurityStore());

      act(() => {
        result.current.setTransactionLimit(1000);
      });

      expect(result.current.transactionLimit).toBe(1000);

      act(() => {
        result.current.setTransactionLimit(null);
      });

      expect(result.current.transactionLimit).toBeNull();
    });
  });

  describe('주소록', () => {
    it('should add address book entry', () => {
      const { result } = renderHook(() => useSecurityStore());

      act(() => {
        result.current.addAddressBookEntry({
          name: 'Test Contact',
          address: '0x1234567890123456789012345678901234567890',
          memo: 'Test memo',
        });
      });

      expect(result.current.addressBook.length).toBeGreaterThan(0);
      const entry = result.current.addressBook.find(
        e => e.address === '0x1234567890123456789012345678901234567890',
      );
      expect(entry).toBeDefined();
      expect(entry?.name).toBe('Test Contact');
    });

    it('should update address book entry', () => {
      const { result } = renderHook(() => useSecurityStore());

      // 먼저 항목 추가
      act(() => {
        result.current.addAddressBookEntry({
          name: 'Original Name',
          address: '0x0987654321098765432109876543210987654321',
        });
      });

      const entry = result.current.addressBook.find(
        e => e.address === '0x0987654321098765432109876543210987654321',
      );

      if (entry) {
        act(() => {
          result.current.updateAddressBookEntry(entry.id, {
            name: 'Updated Name',
          });
        });

        const updated = result.current.addressBook.find(e => e.id === entry.id);
        expect(updated?.name).toBe('Updated Name');
      }
    });

    it('should remove address book entry', () => {
      const { result } = renderHook(() => useSecurityStore());

      act(() => {
        result.current.addAddressBookEntry({
          name: 'To Delete',
          address: '0xabcdef1234567890abcdef1234567890abcdef12',
        });
      });

      const entry = result.current.addressBook.find(
        e => e.address === '0xabcdef1234567890abcdef1234567890abcdef12',
      );

      if (entry) {
        const lengthBefore = result.current.addressBook.length;

        act(() => {
          result.current.removeAddressBookEntry(entry.id);
        });

        expect(result.current.addressBook.length).toBeLessThan(lengthBefore);
      }
    });

    it('should get address book entry by address', () => {
      const { result } = renderHook(() => useSecurityStore());

      act(() => {
        result.current.addAddressBookEntry({
          name: 'Find Me',
          address: '0xfind1234567890123456789012345678901234567',
        });
      });

      const found = result.current.getAddressBookEntry(
        '0xfind1234567890123456789012345678901234567',
      );
      expect(found).toBeDefined();
      expect(found?.name).toBe('Find Me');
    });

    it('should return undefined for non-existent address', () => {
      const { result } = renderHook(() => useSecurityStore());

      const found = result.current.getAddressBookEntry(
        '0x0000000000000000000000000000000000000000',
      );
      expect(found).toBeUndefined();
    });
  });

  describe('최근 주소', () => {
    it('should add recent address', () => {
      const { result } = renderHook(() => useSecurityStore());

      act(() => {
        result.current.addRecentAddress(
          '0xrecent1234567890123456789012345678901234',
        );
      });

      expect(result.current.recentAddresses.length).toBeGreaterThan(0);
    });

    it('should clear recent addresses', () => {
      const { result } = renderHook(() => useSecurityStore());

      act(() => {
        result.current.addRecentAddress(
          '0xrecent1234567890123456789012345678901234',
        );
      });

      act(() => {
        result.current.clearRecentAddresses();
      });

      expect(result.current.recentAddresses.length).toBe(0);
    });
  });

  describe('자동 잠금 체크', () => {
    it('should check if should auto lock', () => {
      const { result } = renderHook(() => useSecurityStore());

      const shouldLock = result.current.shouldAutoLock();
      expect(typeof shouldLock).toBe('boolean');
    });

    it('should return false when autoLockTimeout is never', () => {
      const { result } = renderHook(() => useSecurityStore());

      act(() => {
        result.current.setAutoLockTimeout('never');
        result.current.updateLastActiveTime();
      });

      expect(result.current.shouldAutoLock()).toBe(false);
    });

    it('should return true when autoLockTimeout is immediate', () => {
      const { result } = renderHook(() => useSecurityStore());

      act(() => {
        result.current.setAutoLockTimeout('immediate');
      });

      expect(result.current.shouldAutoLock()).toBe(true);
    });

    it('should return false when within timeout period', () => {
      const { result } = renderHook(() => useSecurityStore());

      act(() => {
        result.current.setAutoLockTimeout('5m');
        result.current.updateLastActiveTime();
      });

      // 방금 업데이트했으므로 timeout 전
      expect(result.current.shouldAutoLock()).toBe(false);
    });

    it('should return true when timeout exceeded', () => {
      const { result } = renderHook(() => useSecurityStore());

      act(() => {
        result.current.setAutoLockTimeout('30s');
        // lastActiveTime을 과거로 설정
        useSecurityStore.setState({ lastActiveTime: Date.now() - 60000 });
      });

      expect(result.current.shouldAutoLock()).toBe(true);
    });
  });

  describe('최근 주소 관리 고급', () => {
    beforeEach(() => {
      // 각 테스트 전에 스토어 초기화
      const { result } = renderHook(() => useSecurityStore());
      act(() => {
        result.current.clearRecentAddresses();
      });
    });

    it('should limit recent addresses to 10', () => {
      const { result } = renderHook(() => useSecurityStore());

      // 12개 주소 추가
      act(() => {
        for (let i = 0; i < 12; i++) {
          const addr = `0x${'1'.repeat(39)}${i
            .toString(16)
            .padStart(1, '0')}` as `0x${string}`;
          result.current.addRecentAddress(addr);
        }
      });

      expect(result.current.recentAddresses.length).toBe(10);
    });

    it('should move duplicate address to front', () => {
      const { result } = renderHook(() => useSecurityStore());

      const firstAddress =
        '0x1111111111111111111111111111111111111111' as `0x${string}`;
      const secondAddress =
        '0x2222222222222222222222222222222222222222' as `0x${string}`;

      act(() => {
        result.current.addRecentAddress(firstAddress);
      });

      act(() => {
        result.current.addRecentAddress(secondAddress);
      });

      act(() => {
        // 첫번째 주소를 다시 추가하면 앞으로 이동해야 함
        result.current.addRecentAddress(firstAddress);
      });

      expect(result.current.recentAddresses[0].address).toBe(firstAddress);
      expect(result.current.recentAddresses.length).toBe(2);
    });

    it('should handle case-insensitive address matching', () => {
      const { result } = renderHook(() => useSecurityStore());

      const lowerAddress =
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`;
      const upperAddress =
        '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as `0x${string}`;

      act(() => {
        result.current.addRecentAddress(lowerAddress);
      });

      act(() => {
        result.current.addRecentAddress(upperAddress);
      });

      // 동일 주소로 인식되어 1개만 있어야 함
      expect(result.current.recentAddresses.length).toBe(1);
    });
  });

  describe('주소록 case-insensitive 검색', () => {
    it('should find address book entry case-insensitively', () => {
      const { result } = renderHook(() => useSecurityStore());

      act(() => {
        result.current.addAddressBookEntry({
          name: 'Case Test',
          address: '0xaAbBcCdDeEfF00112233445566778899aAbBcCdD',
        });
      });

      // 소문자로 검색
      const foundLower = result.current.getAddressBookEntry(
        '0xaabbccddeeff00112233445566778899aabbccdd',
      );
      expect(foundLower).toBeDefined();
      expect(foundLower?.name).toBe('Case Test');

      // 대문자로 검색
      const foundUpper = result.current.getAddressBookEntry(
        '0xAABBCCDDEEFF00112233445566778899AABBCCDD',
      );
      expect(foundUpper).toBeDefined();
    });
  });
});
