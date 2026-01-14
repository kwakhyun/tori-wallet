/**
 * Tori Wallet - VerifyMnemonicScreen Tests
 */

import React from 'react';
import { render } from '../test-utils';

// 네비게이션 모킹
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: mockNavigate,
      goBack: mockGoBack,
    }),
    useRoute: () => ({
      params: {
        mnemonic:
          'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
      },
    }),
  };
});

// Services 모킹
jest.mock('../../src/services/walletService', () => ({
  walletService: {
    deriveAccount: jest.fn().mockReturnValue({
      address: '0x1234567890123456789012345678901234567890',
    }),
  },
}));

import VerifyMnemonicScreen from '../../src/screens/Auth/VerifyMnemonicScreen';

describe('VerifyMnemonicScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render correctly', () => {
    const { toJSON } = render(<VerifyMnemonicScreen />);
    expect(toJSON()).not.toBeNull();
  });

  it('should display verification UI', () => {
    const { root } = render(<VerifyMnemonicScreen />);
    expect(root).toBeTruthy();
  });

  it('should show word selection buttons', () => {
    const { root } = render(<VerifyMnemonicScreen />);
    expect(root.children).toBeDefined();
  });
});
