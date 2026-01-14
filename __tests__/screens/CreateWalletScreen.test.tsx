/**
 * Tori Wallet - CreateWalletScreen Tests
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
    generateMnemonic: jest
      .fn()
      .mockReturnValue(
        'test word one two three four five six seven eight nine ten eleven twelve',
      ),
  },
}));

import CreateWalletScreen from '../../src/screens/Auth/CreateWalletScreen';

describe('CreateWalletScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render correctly', () => {
    const { toJSON } = render(<CreateWalletScreen />);
    expect(toJSON()).not.toBeNull();
  });

  it('should display create wallet title', () => {
    const { getByText } = render(<CreateWalletScreen />);
    expect(getByText('새 지갑 만들기')).toBeTruthy();
  });

  it('should have word count options', () => {
    const { getByText } = render(<CreateWalletScreen />);
    expect(getByText('12 단어')).toBeTruthy();
    expect(getByText('24 단어')).toBeTruthy();
  });

  it('should have back button', () => {
    const { getByText } = render(<CreateWalletScreen />);
    const backButton = getByText('←');
    fireEvent.press(backButton);
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('should display description text', () => {
    const { getAllByText } = render(<CreateWalletScreen />);
    expect(getAllByText(/복구 구문/).length).toBeGreaterThan(0);
  });
});
