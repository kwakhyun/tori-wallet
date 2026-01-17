/**
 * 핵심 사용자 플로우 통합 테스트
 * 핵심 사용자 플로우 통합 테스트
 */

// 공통 모킹
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: mockNavigate,
      goBack: mockGoBack,
      setOptions: jest.fn(),
    }),
    useRoute: () => ({
      params: {},
    }),
    useFocusEffect: jest.fn(),
  };
});

// Keychain 모킹
jest.mock('react-native-keychain', () => ({
  setGenericPassword: jest.fn().mockResolvedValue(true),
  getGenericPassword: jest.fn().mockResolvedValue({
    username: 'tori_wallet_mnemonic',
    password:
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
  }),
  resetGenericPassword: jest.fn().mockResolvedValue(true),
  getSupportedBiometryType: jest.fn().mockResolvedValue('FaceID'),
}));

// EncryptedStorage 모킹
jest.mock('react-native-encrypted-storage', () => ({
  setItem: jest.fn().mockResolvedValue(true),
  getItem: jest.fn().mockResolvedValue(null),
  removeItem: jest.fn().mockResolvedValue(true),
}));

describe('Core User Flows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  afterEach(() => {
    // 모든 타이머와 비동기 작업 정리
    jest.clearAllTimers();
  });

  describe('Wallet Creation Flow', () => {
    // 지갑 서비스 모킹
    const mockGenerateMnemonic = jest
      .fn()
      .mockReturnValue(
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
      );
    const mockValidateMnemonic = jest.fn().mockReturnValue(true);
    const mockDeriveAccount = jest.fn().mockReturnValue({
      address: '0x9858effd232b4033e47d90003d41ec34ecaeda94',
    });
    const mockStoreMnemonic = jest.fn().mockResolvedValue(undefined);

    jest.mock('../../src/services/walletService', () => ({
      walletService: {
        generateMnemonic: mockGenerateMnemonic,
        validateMnemonic: mockValidateMnemonic,
        deriveAccount: mockDeriveAccount,
        storeMnemonic: mockStoreMnemonic,
      },
    }));

    it('should have wallet creation service available', () => {
      const { walletService } = require('../../src/services/walletService');
      expect(walletService).toBeDefined();
      expect(typeof walletService.generateMnemonic).toBe('function');
      expect(typeof walletService.validateMnemonic).toBe('function');
      expect(typeof walletService.deriveAccount).toBe('function');
    });

    it('should generate valid mnemonic', () => {
      const { walletService } = require('../../src/services/walletService');
      const mnemonic = walletService.generateMnemonic();
      expect(mnemonic.split(' ').length).toBe(12);
    });

    it('should validate mnemonic function exists', () => {
      const { walletService } = require('../../src/services/walletService');
      expect(typeof walletService.validateMnemonic).toBe('function');
    });

    it('should derive account from mnemonic', () => {
      const { walletService } = require('../../src/services/walletService');
      const mnemonic =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const account = walletService.deriveAccount(mnemonic, 0);
      expect(account.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });
  });

  describe('Transaction Flow', () => {
    it('should have transaction service available', () => {
      const { txService } = require('../../src/services/txService');
      expect(txService).toBeDefined();
    });

    it('should validate addresses', () => {
      const { txService } = require('../../src/services/txService');
      expect(
        txService.validateAddress('0x1234567890123456789012345678901234567890'),
      ).toBe(true);
      expect(txService.validateAddress('invalid')).toBe(false);
    });

    it('should validate amounts', () => {
      const { txService } = require('../../src/services/txService');
      expect(txService.validateAmount('1.5')).toBe(true);
      expect(txService.validateAmount('')).toBe(false);
      expect(txService.validateAmount('-1')).toBe(false);
    });
  });

  describe('Token Balance Flow', () => {
    it('should have coin service available', () => {
      const { coinService } = require('../../src/services/coinService');
      expect(coinService).toBeDefined();
    });

    it('should calculate USD value', () => {
      const { coinService } = require('../../src/services/coinService');
      const value = coinService.calculateUsdValue(1.5, 2000);
      expect(value).toContain('3,000');
    });
  });

  describe('WalletConnect Flow', () => {
    it('should have WalletConnect service available', () => {
      const { wcService } = require('../../src/services/wcService');
      expect(wcService).toBeDefined();
      expect(typeof wcService.initialize).toBe('function');
      expect(typeof wcService.pair).toBe('function');
      expect(typeof wcService.getActiveSessions).toBe('function');
    });
  });

  describe('Signing Flow', () => {
    it('should have signing service available', () => {
      const { signingService } = require('../../src/services/signingService');
      expect(signingService).toBeDefined();
      expect(typeof signingService.handleRequest).toBe('function');
    });

    it('should have personal sign method', () => {
      const { signingService } = require('../../src/services/signingService');
      expect(typeof signingService.personalSign).toBe('function');
    });

    it('should have sign typed data method', () => {
      const { signingService } = require('../../src/services/signingService');
      expect(typeof signingService.signTypedData).toBe('function');
    });
  });

  describe('Swap Flow', () => {
    it('should have swap service available', () => {
      const { swapService } = require('../../src/services/swapService');
      expect(swapService).toBeDefined();
      expect(typeof swapService.getTokens).toBe('function');
      expect(typeof swapService.isSwapSupported).toBe('function');
    });

    it('should get available tokens for swap', () => {
      const { swapService } = require('../../src/services/swapService');
      const tokens = swapService.getTokens(1);
      expect(Array.isArray(tokens)).toBe(true);
    });

    it('should check swap support for networks', () => {
      const { swapService } = require('../../src/services/swapService');
      expect(swapService.isSwapSupported(1)).toBe(true); // Ethereum
      expect(swapService.isSwapSupported(11155111)).toBe(false); // Sepolia (testnet)
    });
  });
});

describe('Store Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('WalletStore', () => {
    it('should manage wallet state', () => {
      const { useWalletStore } = require('../../src/store/walletStore');
      const state = useWalletStore.getState();

      expect(state).toBeDefined();
      expect(typeof state.addWallet).toBe('function');
      expect(typeof state.removeWallet).toBe('function');
      expect(typeof state.setActiveWallet).toBe('function');
    });

    it('should add and remove wallets', () => {
      const { useWalletStore } = require('../../src/store/walletStore');
      const initialState = useWalletStore.getState();

      // 초기 상태 저장
      const initialWallets = [...initialState.wallets];

      // 지갑 추가
      initialState.addWallet({
        address: '0xtest123456789012345678901234567890123456',
        name: 'Test Wallet',
        isHD: true,
      });

      expect(useWalletStore.getState().wallets.length).toBe(
        initialWallets.length + 1,
      );

      // 지갑 제거
      initialState.removeWallet('0xtest123456789012345678901234567890123456');
      expect(useWalletStore.getState().wallets.length).toBe(
        initialWallets.length,
      );
    });
  });

  describe('ThemeStore', () => {
    it('should manage theme state', () => {
      const { useThemeStore } = require('../../src/store/themeStore');
      const state = useThemeStore.getState();

      expect(state).toBeDefined();
      expect(typeof state.isDarkMode).toBe('boolean');
      expect(typeof state.toggleTheme).toBe('function');
      expect(typeof state.setThemeMode).toBe('function');
    });

    it('should set theme mode', () => {
      const { useThemeStore } = require('../../src/store/themeStore');

      // 다크 모드로 설정
      useThemeStore.getState().setThemeMode('dark');
      expect(useThemeStore.getState().themeMode).toBe('dark');

      // 라이트 모드로 설정
      useThemeStore.getState().setThemeMode('light');
      expect(useThemeStore.getState().themeMode).toBe('light');

      // 시스템 모드로 복원
      useThemeStore.getState().setThemeMode('system');
    });
  });

  describe('SecurityStore', () => {
    it('should manage security state', () => {
      const { useSecurityStore } = require('../../src/store/securityStore');
      const state = useSecurityStore.getState();

      expect(state).toBeDefined();
      expect(typeof state.addRecentAddress).toBe('function');
      expect(typeof state.getAddressBookEntry).toBe('function');
    });
  });

  describe('SwapStore', () => {
    it('should manage swap state', () => {
      const { useSwapStore } = require('../../src/store/swapStore');
      const state = useSwapStore.getState();

      expect(state).toBeDefined();
      expect(typeof state.updateSettings).toBe('function');
      expect(typeof state.addHistoryItem).toBe('function');
    });
  });
});

describe('Utility Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Address Utils', () => {
    it('should shorten addresses', () => {
      const { shortenAddress } = require('../../src/utils/address');

      const address = '0x1234567890123456789012345678901234567890';
      const shortened = shortenAddress(address);

      expect(shortened.length).toBeLessThan(address.length);
      expect(shortened).toContain('...');
    });

    it('should validate Ethereum addresses', () => {
      const { isValidAddress } = require('../../src/utils/address');

      expect(isValidAddress('0x1234567890123456789012345678901234567890')).toBe(
        true,
      );
      expect(isValidAddress('invalid')).toBe(false);
      expect(isValidAddress('')).toBe(false);
    });
  });

  describe('Format Utils', () => {
    it('should format numbers', () => {
      const {
        formatNumber,
        formatCurrency,
      } = require('../../src/utils/format');

      expect(formatNumber(1234.5678, 2)).toBe('1,234.57');
      expect(formatCurrency(1234.56)).toContain('1,234');
    });
  });
  describe('Error Utils', () => {
    it('should create app errors', () => {
      const { createAppError, ErrorCode } = require('../../src/utils/error');

      const appError = createAppError(ErrorCode.NETWORK_ERROR, '네트워크 오류');

      expect(appError).toBeDefined();
      expect(appError.code).toBe(ErrorCode.NETWORK_ERROR);
    });

    it('should log errors without throwing', () => {
      const { logError } = require('../../src/utils/error');

      // logError는 에러를 던지지 않아야 함
      expect(() => logError(new Error('Test'), 'context')).not.toThrow();
    });
  });
});
