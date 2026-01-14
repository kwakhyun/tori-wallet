/**
 * Tori Wallet - WelcomeScreen Tests
 * 웰컴 스크린 테스트
 */

import React from 'react';
import { render, fireEvent } from '../test-utils';
import WelcomeScreen from '../../src/screens/Auth/WelcomeScreen';

// 네비게이션 모킹
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: mockNavigate,
    }),
  };
});

describe('WelcomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render correctly', () => {
    const { getByText } = render(<WelcomeScreen />);

    expect(getByText('Tori Wallet')).toBeTruthy();
  });

  it('should display tagline', () => {
    const { getByText } = render(<WelcomeScreen />);

    expect(getByText(/안전하고 간편한/i)).toBeTruthy();
  });

  it('should have create wallet button', () => {
    const { getByText } = render(<WelcomeScreen />);

    expect(getByText(/새 지갑 만들기/i)).toBeTruthy();
  });

  it('should have import wallet button', () => {
    const { getByText } = render(<WelcomeScreen />);

    expect(getByText(/기존 지갑 가져오기/i)).toBeTruthy();
  });

  it('should navigate to CreateWallet on create button press', () => {
    const { getByText } = render(<WelcomeScreen />);

    const createButton = getByText(/새 지갑 만들기/i);
    fireEvent.press(createButton);

    expect(mockNavigate).toHaveBeenCalledWith('CreateWallet');
  });

  it('should navigate to ImportWallet on import button press', () => {
    const { getByText } = render(<WelcomeScreen />);

    const importButton = getByText(/기존 지갑 가져오기/i);
    fireEvent.press(importButton);

    expect(mockNavigate).toHaveBeenCalledWith('ImportWallet');
  });
});
