/**
 * 암호화폐 구매 서비스 (외부 결제 연동)
 */

import { Alert, Linking } from 'react-native';
import { createLogger } from '@/utils/logger';

const logger = createLogger('BuyService');

export type BuyProvider = 'moonpay' | 'banxa';

export interface BuyProviderInfo {
  id: BuyProvider;
  name: string;
  description: string;
}

export const BUY_PROVIDERS: BuyProviderInfo[] = [
  {
    id: 'moonpay',
    name: 'MoonPay',
    description: '카드/계좌이체로 구매',
  },
  {
    id: 'banxa',
    name: 'Banxa',
    description: '다양한 결제 수단',
  },
];

/**
 * 구매 URL 생성
 */
export function generateBuyUrl(
  provider: BuyProvider,
  symbol: string,
  walletAddress?: string,
): string {
  const normalizedSymbol = symbol.toLowerCase();

  switch (provider) {
    case 'moonpay':
      return walletAddress
        ? `https://buy.moonpay.com/?currencyCode=${normalizedSymbol}&walletAddress=${walletAddress}`
        : `https://buy.moonpay.com/?currencyCode=${normalizedSymbol}`;

    case 'banxa':
      return walletAddress
        ? `https://checkout.banxa.com/?coinType=${symbol.toUpperCase()}&walletAddress=${walletAddress}`
        : `https://checkout.banxa.com/?coinType=${symbol.toUpperCase()}`;

    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * 구매 URL 열기
 */
export async function openBuyUrl(
  provider: BuyProvider,
  symbol: string,
  walletAddress?: string,
): Promise<void> {
  try {
    const url = generateBuyUrl(provider, symbol, walletAddress);
    const canOpen = await Linking.canOpenURL(url);

    if (canOpen) {
      await Linking.openURL(url);
      logger.info(`Opened ${provider} for ${symbol}`);
    } else {
      throw new Error('Cannot open URL');
    }
  } catch (error) {
    logger.error(`Failed to open ${provider}:`, error);
    Alert.alert('오류', '구매 페이지를 열 수 없습니다.');
  }
}

/**
 * 구매 제공업체 선택 Alert 표시
 */
export function showBuyProviderAlert(
  symbol: string,
  walletAddress?: string,
  onCancel?: () => void,
): void {
  Alert.alert(`${symbol.toUpperCase()} 구매`, '구매할 서비스를 선택하세요', [
    {
      text: 'MoonPay',
      onPress: () => openBuyUrl('moonpay', symbol, walletAddress),
    },
    {
      text: 'Banxa',
      onPress: () => openBuyUrl('banxa', symbol, walletAddress),
    },
    {
      text: '취소',
      style: 'cancel',
      onPress: onCancel,
    },
  ]);
}

/**
 * 지원하는 코인인지 확인 (기본적인 체크)
 */
export function isBuySupported(symbol: string): boolean {
  // MoonPay/Banxa가 지원하는 주요 코인들
  const supportedCoins = [
    'eth',
    'btc',
    'usdt',
    'usdc',
    'matic',
    'bnb',
    'sol',
    'avax',
    'dot',
    'ada',
    'xrp',
    'doge',
    'shib',
    'link',
    'uni',
    'aave',
  ];

  return supportedCoins.includes(symbol.toLowerCase());
}

export const buyService = {
  generateBuyUrl,
  openBuyUrl,
  showBuyProviderAlert,
  isBuySupported,
  providers: BUY_PROVIDERS,
};

export default buyService;
