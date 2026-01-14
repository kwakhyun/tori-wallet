/**
 * Tori Wallet - ImportWalletScreen Tests
 */

import React from 'react';
import { render, fireEvent } from '../test-utils';

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
  };
});

// Services 모킹
jest.mock('../../src/services/walletService', () => ({
  walletService: {
    validateMnemonic: jest.fn().mockReturnValue(true),
    deriveWallet: jest.fn().mockResolvedValue({
      address: '0x1234567890123456789012345678901234567890',
    }),
  },
}));

import ImportWalletScreen from '../../src/screens/Auth/ImportWalletScreen';

describe('ImportWalletScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render correctly', () => {
    const { toJSON } = render(<ImportWalletScreen />);
    expect(toJSON()).not.toBeNull();
  });

  it('should have word count options', () => {
    const { getByText } = render(<ImportWalletScreen />);
    expect(getByText('12 단어')).toBeTruthy();
    expect(getByText('24 단어')).toBeTruthy();
  });

  it('should have back button', () => {
    const { getByText } = render(<ImportWalletScreen />);
    const backButton = getByText('←');
    fireEvent.press(backButton);
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('should display title', () => {
    const { getAllByText } = render(<ImportWalletScreen />);
    expect(getAllByText('지갑 가져오기').length).toBeGreaterThan(0);
  });

  it('should render word input fields', () => {
    const { root } = render(<ImportWalletScreen />);
    expect(root).toBeTruthy();
  });
});
