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

// MoonPay는 L2 자산을 별도 통화 코드로 구분한다. 코드가 없으면 메인넷 자산으로 전송된다.
const MOONPAY_CHAIN_SUFFIX: Record<number, string> = {
  42161: 'arbitrum',
  10: 'optimism',
  8453: 'base',
  137: 'polygon',
};

// Banxa는 코인과 네트워크를 따로 받는다.
const BANXA_BLOCKCHAIN: Record<number, string> = {
  1: 'ETH',
  42161: 'ARB',
  10: 'OPTIMISM',
  8453: 'BASE',
  137: 'MATIC',
};

/** 테스트넷은 법정화폐로 구매할 수 없다 */
export function isBuyAvailableOnChain(chainId?: number): boolean {
  return chainId === undefined || chainId in BANXA_BLOCKCHAIN;
}

/**
 * 구매 URL 생성
 */
export function generateBuyUrl(
  provider: BuyProvider,
  symbol: string,
  walletAddress?: string,
  chainId?: number,
): string {
  const normalizedSymbol = symbol.toLowerCase();
  const address = walletAddress
    ? `&walletAddress=${encodeURIComponent(walletAddress)}`
    : '';

  switch (provider) {
    case 'moonpay': {
      const suffix =
        chainId !== undefined ? MOONPAY_CHAIN_SUFFIX[chainId] : undefined;
      const code = suffix ? `${normalizedSymbol}_${suffix}` : normalizedSymbol;
      return `https://buy.moonpay.com/?currencyCode=${encodeURIComponent(
        code,
      )}${address}`;
    }

    case 'banxa': {
      const blockchain =
        chainId !== undefined ? BANXA_BLOCKCHAIN[chainId] : undefined;
      const network = blockchain ? `&blockchain=${blockchain}` : '';
      return `https://checkout.banxa.com/?coinType=${encodeURIComponent(
        symbol.toUpperCase(),
      )}${network}${address}`;
    }

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
  chainId?: number,
): Promise<void> {
  try {
    const url = generateBuyUrl(provider, symbol, walletAddress, chainId);
    // canOpenURL은 Android 11+에서 <queries> 선언에 의존하므로 바로 열고 실패만 처리한다.
    await Linking.openURL(url);
    logger.info(`Opened ${provider} for ${symbol}`);
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
  chainId?: number,
): void {
  if (!isBuyAvailableOnChain(chainId)) {
    Alert.alert(
      '테스트넷에서는 구매할 수 없습니다',
      '테스트넷 토큰은 실제 가치가 없으며 Faucet에서 무료로 받을 수 있습니다.',
    );
    return;
  }
  Alert.alert(
    `${symbol.toUpperCase()} 구매`,
    '외부 결제 서비스에서 구매합니다. 받는 주소가 내 지갑 주소인지 결제 화면에서 다시 확인하세요.',
    [
      {
        text: 'MoonPay',
        onPress: () => openBuyUrl('moonpay', symbol, walletAddress, chainId),
      },
      {
        text: 'Banxa',
        onPress: () => openBuyUrl('banxa', symbol, walletAddress, chainId),
      },
      {
        text: '취소',
        style: 'cancel',
        onPress: onCancel,
      },
    ],
  );
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
  isBuyAvailableOnChain,
  openBuyUrl,
  showBuyProviderAlert,
  isBuySupported,
  providers: BUY_PROVIDERS,
};

export default buyService;
