/**
 * 암호화폐 구매 서비스 테스트
 */

import { Linking, Alert } from 'react-native';
import {
  generateBuyUrl,
  getBuyAvailability,
  openBuyUrl,
  showBuyProviderAlert,
  isBuySupported,
  BUY_PROVIDERS,
  BuyProvider,
  buyService,
} from '../../src/services/buyService';
import {
  customNetworkRegistry,
  UNSUPPORTED_ON_NETWORK_MESSAGE,
} from '../../src/services/customNetworks';

// React Native 모킹
jest.mock('react-native', () => ({
  Linking: {
    canOpenURL: jest.fn(),
    openURL: jest.fn(),
  },
  Alert: {
    alert: jest.fn(),
  },
}));

describe('BuyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('BUY_PROVIDERS', () => {
    it('should have moonpay provider', () => {
      const moonpay = BUY_PROVIDERS.find(p => p.id === 'moonpay');
      expect(moonpay).toBeDefined();
      expect(moonpay?.name).toBe('MoonPay');
    });

    it('should have banxa provider', () => {
      const banxa = BUY_PROVIDERS.find(p => p.id === 'banxa');
      expect(banxa).toBeDefined();
      expect(banxa?.name).toBe('Banxa');
    });

    it('should have descriptions for all providers', () => {
      BUY_PROVIDERS.forEach(provider => {
        expect(provider.description).toBeTruthy();
      });
    });
  });

  describe('generateBuyUrl', () => {
    describe('MoonPay', () => {
      it('should generate URL without wallet address', () => {
        const url = generateBuyUrl('moonpay', 'ETH');
        expect(url).toBe('https://buy.moonpay.com/?currencyCode=eth');
      });

      it('should generate URL with wallet address', () => {
        const walletAddress = '0x1234567890123456789012345678901234567890';
        const url = generateBuyUrl('moonpay', 'ETH', walletAddress);
        expect(url).toBe(
          `https://buy.moonpay.com/?currencyCode=eth&walletAddress=${walletAddress}`,
        );
      });

      it('should lowercase the symbol', () => {
        const url = generateBuyUrl('moonpay', 'BTC');
        expect(url).toContain('currencyCode=btc');
      });
    });

    describe('Banxa', () => {
      it('should generate URL without wallet address', () => {
        const url = generateBuyUrl('banxa', 'ETH');
        expect(url).toBe('https://checkout.banxa.com/?coinType=ETH');
      });

      it('should generate URL with wallet address', () => {
        const walletAddress = '0x1234567890123456789012345678901234567890';
        const url = generateBuyUrl('banxa', 'ETH', walletAddress);
        expect(url).toBe(
          `https://checkout.banxa.com/?coinType=ETH&walletAddress=${walletAddress}`,
        );
      });

      it('should uppercase the symbol', () => {
        const url = generateBuyUrl('banxa', 'eth');
        expect(url).toContain('coinType=ETH');
      });
    });

    describe('Error handling', () => {
      it('should throw for unknown provider', () => {
        expect(() => {
          generateBuyUrl('unknown' as BuyProvider, 'ETH');
        }).toThrow('Unknown provider: unknown');
      });
    });

    describe('Different symbols', () => {
      it('should work with USDC', () => {
        const moonpayUrl = generateBuyUrl('moonpay', 'USDC');
        const banxaUrl = generateBuyUrl('banxa', 'USDC');

        expect(moonpayUrl).toContain('usdc');
        expect(banxaUrl).toContain('USDC');
      });

      it('should work with MATIC', () => {
        const moonpayUrl = generateBuyUrl('moonpay', 'MATIC');
        const banxaUrl = generateBuyUrl('banxa', 'MATIC');

        expect(moonpayUrl).toContain('matic');
        expect(banxaUrl).toContain('MATIC');
      });
    });
  });

  describe('openBuyUrl', () => {
    it('should open URL directly without canOpenURL (Android 11+ visibility)', async () => {
      (Linking.openURL as jest.Mock).mockResolvedValue(undefined);

      await openBuyUrl('moonpay', 'ETH');

      expect(Linking.canOpenURL).not.toHaveBeenCalled();
      expect(Linking.openURL).toHaveBeenCalledWith(
        expect.stringContaining('moonpay'),
      );
    });

    it('should request the L2 asset code for the active chain', async () => {
      (Linking.openURL as jest.Mock).mockResolvedValue(undefined);

      await openBuyUrl('moonpay', 'ETH', undefined, 42161);

      expect(Linking.openURL).toHaveBeenCalledWith(
        expect.stringContaining('currencyCode=eth_arbitrum'),
      );
    });

    it('should open URL with wallet address', async () => {
      const walletAddress = '0x1234567890123456789012345678901234567890';
      (Linking.canOpenURL as jest.Mock).mockResolvedValue(true);
      (Linking.openURL as jest.Mock).mockResolvedValue(undefined);

      await openBuyUrl('moonpay', 'ETH', walletAddress);

      expect(Linking.openURL).toHaveBeenCalledWith(
        expect.stringContaining(walletAddress),
      );
    });

    it('should show alert when opening the URL fails', async () => {
      (Linking.openURL as jest.Mock).mockRejectedValue(
        new Error('No activity'),
      );

      await openBuyUrl('moonpay', 'ETH');

      expect(Alert.alert).toHaveBeenCalledWith(
        '오류',
        '구매 페이지를 열 수 없습니다.',
      );
    });

    it('should show alert on error', async () => {
      (Linking.openURL as jest.Mock).mockRejectedValue(
        new Error('Network error'),
      );

      await openBuyUrl('moonpay', 'ETH');

      expect(Alert.alert).toHaveBeenCalledWith(
        '오류',
        '구매 페이지를 열 수 없습니다.',
      );
    });
  });

  describe('showBuyProviderAlert', () => {
    it('should show alert with provider options', () => {
      showBuyProviderAlert('ETH');

      expect(Alert.alert).toHaveBeenCalledWith(
        'ETH 구매',
        expect.stringContaining('외부 결제 서비스'),
        expect.arrayContaining([
          expect.objectContaining({ text: 'MoonPay' }),
          expect.objectContaining({ text: 'Banxa' }),
          expect.objectContaining({ text: '취소', style: 'cancel' }),
        ]),
      );
    });

    it('should call onCancel when cancel is pressed', () => {
      const onCancel = jest.fn();
      showBuyProviderAlert('ETH', undefined, onCancel);

      // Alert.alert의 세 번째 인자에서 취소 버튼 찾기
      const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
      const cancelButton = alertCall[2].find(
        (btn: { text: string; onPress?: () => void }) => btn.text === '취소',
      );
      cancelButton.onPress();

      expect(onCancel).toHaveBeenCalled();
    });

    it('should explain that testnets cannot be bought', () => {
      showBuyProviderAlert('ETH', undefined, undefined, 11155111);

      expect(Alert.alert).toHaveBeenCalledWith(
        '테스트넷에서는 구매할 수 없습니다',
        expect.any(String),
      );
    });

    describe('custom networks', () => {
      beforeEach(() => {
        customNetworkRegistry.set([
          {
            chainId: 56,
            name: 'BNB Chain',
            rpcUrl: 'https://bsc.example.com',
            symbol: 'BNB',
            isTestnet: false,
          },
          {
            chainId: 97,
            name: 'BSC Testnet',
            rpcUrl: 'https://bsc-testnet.example.com',
            symbol: 'TBNB',
            isTestnet: true,
          },
        ]);
      });
      afterEach(() => customNetworkRegistry.set([]));

      it('does not call a custom mainnet a testnet', () => {
        expect(getBuyAvailability(56)).toBe('unsupported');
        showBuyProviderAlert('BNB', '0xabc', undefined, 56);

        const [title, message, buttons] = (Alert.alert as jest.Mock).mock
          .calls[0];
        expect(title).toBe(UNSUPPORTED_ON_NETWORK_MESSAGE);
        expect(title).not.toContain('테스트넷');
        expect(message).toContain('네트워크를 바꾼 뒤');
        // 결제 화면으로 넘어가는 버튼이 없다
        expect(buttons).toBeUndefined();
      });

      it('still explains testnets for a custom network marked as testnet', () => {
        expect(getBuyAvailability(97)).toBe('testnet');
        showBuyProviderAlert('TBNB', '0xabc', undefined, 97);
        expect(Alert.alert).toHaveBeenCalledWith(
          '테스트넷에서는 구매할 수 없습니다',
          expect.any(String),
        );
      });

      it('allows buying without a network (address entered at checkout)', () => {
        expect(getBuyAvailability(undefined)).toBe('available');
        expect(getBuyAvailability(1)).toBe('available');
        expect(getBuyAvailability(11155111)).toBe('testnet');
      });
    });

    it('should pass wallet address to provider', () => {
      const walletAddress = '0x1234567890123456789012345678901234567890';
      showBuyProviderAlert('ETH', walletAddress);

      expect(Alert.alert).toHaveBeenCalled();
    });

    it('should call openBuyUrl with moonpay when MoonPay is pressed', async () => {
      (Linking.canOpenURL as jest.Mock).mockResolvedValue(true);
      (Linking.openURL as jest.Mock).mockResolvedValue(undefined);

      const walletAddress = '0x1234567890123456789012345678901234567890';
      showBuyProviderAlert('ETH', walletAddress);

      // MoonPay 버튼 찾아서 누르기
      const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
      const moonpayButton = alertCall[2].find(
        (btn: { text: string; onPress?: () => void }) => btn.text === 'MoonPay',
      );

      await moonpayButton.onPress();

      expect(Linking.openURL).toHaveBeenCalledWith(
        expect.stringContaining('moonpay'),
      );
    });

    it('should call openBuyUrl with banxa when Banxa is pressed', async () => {
      (Linking.canOpenURL as jest.Mock).mockResolvedValue(true);
      (Linking.openURL as jest.Mock).mockResolvedValue(undefined);

      const walletAddress = '0x1234567890123456789012345678901234567890';
      showBuyProviderAlert('ETH', walletAddress);

      // Banxa 버튼 찾아서 누르기
      const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
      const banxaButton = alertCall[2].find(
        (btn: { text: string; onPress?: () => void }) => btn.text === 'Banxa',
      );

      await banxaButton.onPress();

      expect(Linking.openURL).toHaveBeenCalledWith(
        expect.stringContaining('banxa'),
      );
    });
  });

  describe('isBuySupported', () => {
    it('should return true for supported coins', () => {
      expect(isBuySupported('eth')).toBe(true);
      expect(isBuySupported('ETH')).toBe(true);
      expect(isBuySupported('btc')).toBe(true);
      expect(isBuySupported('usdc')).toBe(true);
      expect(isBuySupported('matic')).toBe(true);
    });

    it('should return false for unsupported coins', () => {
      expect(isBuySupported('unknownCoin')).toBe(false);
      expect(isBuySupported('xyz')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isBuySupported('ETH')).toBe(true);
      expect(isBuySupported('eth')).toBe(true);
      expect(isBuySupported('Eth')).toBe(true);
    });
  });

  describe('buyService object', () => {
    it('should export all functions', () => {
      expect(buyService.generateBuyUrl).toBeDefined();
      expect(buyService.openBuyUrl).toBeDefined();
      expect(buyService.showBuyProviderAlert).toBeDefined();
      expect(buyService.isBuySupported).toBeDefined();
      expect(buyService.providers).toBeDefined();
    });

    it('should have providers list', () => {
      expect(buyService.providers.length).toBeGreaterThan(0);
    });
  });
});
