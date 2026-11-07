/**
 * VerifyMnemonicScreen 테스트
 */

import React from 'react';
import { render, fireEvent } from '../test-utils';

const MNEMONIC =
  'abandon ability able about above absent absorb abstract absurd abuse access accident';

const mockGetSnapshot = jest.fn();
const mockSetWalletAddress = jest.fn();
jest.mock('../../src/services/onboardingVault', () => ({
  onboardingVault: {
    getSnapshot: () => mockGetSnapshot(),
    setWalletAddress: (address: string) => mockSetWalletAddress(address),
  },
}));

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
    deriveAccount: jest.fn().mockReturnValue({
      address: '0x1234567890123456789012345678901234567890',
    }),
  },
}));

import VerifyMnemonicScreen, {
  pickVerificationIndices,
} from '../../src/screens/Auth/VerifyMnemonicScreen';

const words = MNEMONIC.split(' ');

/** 화면에 표시된 "N번째 단어" 라벨에서 정답 단어를 구한다. */
const answersFor = (view: ReturnType<typeof render>) =>
  view
    .getAllByText(/^\d+번째 단어$/)
    .map(label => words[parseInt(String(label.props.children), 10) - 1]);

describe('VerifyMnemonicScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSnapshot.mockReturnValue({ sessionId: 1, mnemonic: MNEMONIC });
  });

  it('should render correctly', () => {
    const view = render(<VerifyMnemonicScreen />);
    expect(view.getByText('복구 구문 확인')).toBeTruthy();
    expect(view.getAllByText(/^\d+번째 단어$/)).toHaveLength(3);
  });

  it('chains focus to the next field and verifies from the last field', () => {
    const view = render(<VerifyMnemonicScreen />);
    const answers = answersFor(view);
    expect(view.getByTestId('verify-word-0').props.returnKeyType).toBe('next');
    expect(view.getByTestId('verify-word-2').props.returnKeyType).toBe('done');

    answers.forEach((answer, index) =>
      fireEvent.changeText(view.getByTestId(`verify-word-${index}`), answer),
    );
    fireEvent(view.getByTestId('verify-word-2'), 'submitEditing');

    expect(mockSetWalletAddress).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('SetPin');
  });

  it('shows inline errors for wrong words', () => {
    const view = render(<VerifyMnemonicScreen />);
    ['wrong', 'wrong', 'wrong'].forEach((answer, index) =>
      fireEvent.changeText(view.getByTestId(`verify-word-${index}`), answer),
    );
    fireEvent.press(view.getByTestId('verify-confirm'));

    expect(view.getByTestId('verify-error')).toBeTruthy();
    expect(view.getAllByText('올바른 단어를 입력해주세요')).toHaveLength(3);
    expect(mockNavigate).not.toHaveBeenCalledWith('SetPin');
  });

  it('keeps the confirm button disabled until every field is filled', () => {
    const view = render(<VerifyMnemonicScreen />);
    expect(
      view.getByTestId('verify-confirm').props.accessibilityState.disabled,
    ).toBe(true);
  });

  it('does not hang when the onboarding session is missing', () => {
    mockGetSnapshot.mockReturnValue(null);
    const view = render(<VerifyMnemonicScreen />);
    expect(view.queryAllByText(/^\d+번째 단어$/)).toHaveLength(0);
    expect(mockNavigate).toHaveBeenCalledWith('Welcome');
  });

  describe('pickVerificationIndices', () => {
    it('never loops forever for phrases shorter than three words', () => {
      expect(pickVerificationIndices(0)).toEqual([]);
      expect(pickVerificationIndices(1)).toEqual([0]);
      expect(pickVerificationIndices(2)).toEqual([0, 1]);
    });

    it('picks three distinct sorted positions', () => {
      const picks = pickVerificationIndices(24);
      expect(picks).toHaveLength(3);
      expect(new Set(picks).size).toBe(3);
      expect([...picks].sort((a, b) => a - b)).toEqual(picks);
      picks.forEach(index => expect(index).toBeLessThan(24));
    });
  });
});
