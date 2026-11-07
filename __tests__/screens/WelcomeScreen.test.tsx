/**
 * WelcomeScreen 테스트
 * 웰컴 스크린 테스트
 */

import React from 'react';
import { render, fireEvent } from '../test-utils';
import WelcomeScreen from '../../src/screens/Auth/WelcomeScreen';
import { onboardingVault } from '../../src/services/onboardingVault';

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

  describe('진행 중이던 온보딩 초기화 안내', () => {
    const MNEMONIC =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    afterEach(() => {
      onboardingVault.clear();
      onboardingVault.dismissResetNotice();
    });

    it('explains that wallet creation was reset when the app went to the background', () => {
      onboardingVault.start(MNEMONIC);
      onboardingVault.clear('background');

      const { getByTestId, getByText } = render(<WelcomeScreen />);

      expect(getByTestId('welcome-reset-notice')).toBeTruthy();
      expect(
        getByText(/보안을 위해 앱을 벗어나는 동안 진행 중이던 지갑 생성이/),
      ).toBeTruthy();
    });

    it('uses import copy and mentions the 10 minute expiry', () => {
      onboardingVault.start(MNEMONIC, '0xabc');
      onboardingVault.clear('expired');

      const { getByText } = render(<WelcomeScreen />);

      expect(getByText(/10분이 지나 진행 중이던 지갑 가져오기가/)).toBeTruthy();
    });

    it('does not show a notice after the user cancels or completes', () => {
      onboardingVault.start(MNEMONIC);
      onboardingVault.clear('cancelled');
      const cancelled = render(<WelcomeScreen />);
      expect(cancelled.queryByTestId('welcome-reset-notice')).toBeNull();
      cancelled.unmount();

      onboardingVault.start(MNEMONIC);
      onboardingVault.clear('completed');
      const completed = render(<WelcomeScreen />);
      expect(completed.queryByTestId('welcome-reset-notice')).toBeNull();
    });

    it('can be dismissed', () => {
      onboardingVault.start(MNEMONIC);
      onboardingVault.clear('background');
      const { getByLabelText, queryByTestId } = render(<WelcomeScreen />);

      fireEvent.press(getByLabelText('안내 닫기'));

      expect(queryByTestId('welcome-reset-notice')).toBeNull();
      expect(onboardingVault.getResetNotice()).toBeNull();
    });
  });
});
