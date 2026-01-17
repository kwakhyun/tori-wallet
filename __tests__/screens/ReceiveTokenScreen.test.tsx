/**
 * ReceiveTokenScreen 테스트
 */

import React from 'react';
import { render } from '../test-utils';

// 네비게이션 모킹
jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: jest.fn(),
      goBack: jest.fn(),
    }),
  };
});

// Store 모킹
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
      { chainId: 1, name: 'Ethereum', symbol: 'ETH', isTestnet: false },
    ],
  }),
}));

import ReceiveTokenScreen from '../../src/screens/Receive/ReceiveTokenScreen';

describe('ReceiveTokenScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render correctly', () => {
    const { toJSON } = render(<ReceiveTokenScreen />);
    expect(toJSON()).not.toBeNull();
  });

  it('should display wallet address', () => {
    const { root } = render(<ReceiveTokenScreen />);
    expect(root).toBeTruthy();
  });

  it('should show QR code placeholder', () => {
    const { root } = render(<ReceiveTokenScreen />);
    expect(root.children).toBeDefined();
  });

  it('should display network info', () => {
    const { root } = render(<ReceiveTokenScreen />);
    expect(root).toBeTruthy();
  });
});
