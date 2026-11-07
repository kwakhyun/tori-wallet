/**
 * ReceiveTokenScreen 테스트
 */

import React from 'react';
import { Share, Clipboard } from 'react-native';
import { render, screen, fireEvent, waitFor } from '../test-utils';
import { useToastStore } from '../../src/store/toastStore';
import { darkTheme } from '../../src/styles/theme';

let mockParams: Record<string, unknown> | undefined;
jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: jest.fn(),
      goBack: jest.fn(),
      canGoBack: () => true,
    }),
    useRoute: () => ({ params: mockParams }),
  };
});

jest.mock('../../src/store/walletStore', () => ({
  useWalletStore: () => ({
    wallets: [
      {
        address: '0x1234567890123456789012345678901234567890',
        name: 'Account 1',
      },
    ],
    activeWalletIndex: 0,
    activeNetworkChainId: 1,
    networks: [
      {
        chainId: 1,
        name: 'Ethereum Mainnet',
        symbol: 'ETH',
        isTestnet: false,
      },
    ],
  }),
}));

jest.mock('../../src/services/tokenService', () => ({
  tokenService: {
    getTokens: jest.fn().mockResolvedValue([]),
    getDefaultTokens: () => [
      { symbol: 'ETH', name: 'Ethereum', address: 'native', decimals: 18 },
      {
        symbol: 'USDC',
        name: 'USD Coin',
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        decimals: 6,
      },
    ],
  },
}));

const mockQRCode = jest.fn();
jest.mock('react-native-qrcode-svg', () => (props: unknown) => {
  mockQRCode(props);
  return null;
});

import ReceiveTokenScreen, {
  buildShareMessage,
  QR_QUIET_ZONE,
} from '../../src/screens/Receive/ReceiveTokenScreen';

describe('ReceiveTokenScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = undefined;
    useToastStore.getState().reset();
  });

  it('renders the full address', () => {
    render(<ReceiveTokenScreen />);
    expect(
      screen.getByText('0x1234567890123456789012345678901234567890'),
    ).toBeTruthy();
  });

  it('always renders the QR black-on-white with a quiet zone of at least 16px', () => {
    render(<ReceiveTokenScreen />, { theme: 'dark' });
    const props = mockQRCode.mock.calls[0][0];
    expect(props.backgroundColor).toBe(darkTheme.colors.qrBackground);
    expect(props.color).toBe(darkTheme.colors.qrForeground);
    expect(props.backgroundColor).toBe('#FFFFFF');
    expect(props.color).toBe('#000000');
    expect(props.quietZone).toBeGreaterThanOrEqual(16);
    expect(QR_QUIET_ZONE).toBeGreaterThanOrEqual(16);
  });

  it('shares the address with the network name and a network warning', async () => {
    const share = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: 'sharedAction' } as never);
    render(<ReceiveTokenScreen />);
    fireEvent.press(screen.getByTestId('receive-share-button'));
    await waitFor(() => expect(share).toHaveBeenCalled());
    const { message } = share.mock.calls[0][0] as { message: string };
    expect(message).toContain('0x1234567890123456789012345678901234567890');
    expect(message).toContain('Ethereum Mainnet');
    expect(message).toContain('네트워크로만 보내주세요');
  });

  it('copies with a toast instead of a blocking alert', () => {
    const setString = jest
      .spyOn(Clipboard, 'setString')
      .mockImplementation(() => undefined);
    render(<ReceiveTokenScreen />);
    fireEvent.press(screen.getByTestId('receive-copy-button'));
    expect(setString).toHaveBeenCalledWith(
      '0x1234567890123456789012345678901234567890',
    );
    expect(useToastStore.getState().current?.message).toBe(
      '주소를 복사했습니다',
    );
  });

  it('clarifies that ERC-20 tokens use the same address', () => {
    mockParams = { tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' };
    render(<ReceiveTokenScreen />);
    expect(screen.getByTestId('receive-token-notice')).toBeTruthy();
    expect(screen.getByText('USDC (ERC-20)')).toBeTruthy();
    expect(screen.getByText(/ERC-20 토큰도 같은 주소로 받습니다/)).toBeTruthy();
    expect(screen.getByText('USDC 받기')).toBeTruthy();
  });

  it('has an accessible back button in the header', () => {
    render(<ReceiveTokenScreen />);
    expect(screen.getByLabelText('뒤로 가기')).toBeTruthy();
  });
});

describe('buildShareMessage', () => {
  it('includes the token symbol when sharing for a token', () => {
    const message = buildShareMessage('0xabc', 'Base', 'USDC');
    expect(message).toContain('Base에서 USDC(ERC-20)');
    expect(message).toContain('반드시 Base 네트워크로만 보내주세요');
  });
});
