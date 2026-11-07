/**
 * BackupMnemonicScreen 테스트
 */

import React from 'react';
import { Alert, AlertButton, Platform } from 'react-native';
import { render, fireEvent, act } from '../test-utils';

const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const mockClear = jest.fn();
const mockGetSnapshot = jest.fn();
jest.mock('../../src/services/onboardingVault', () => ({
  onboardingVault: {
    getSnapshot: () => mockGetSnapshot(),
    clear: (reason?: string) => mockClear(reason),
  },
}));

// 네비게이션 모킹
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
type BeforeRemoveListener = (event: { preventDefault: () => void }) => void;
const mockBeforeRemove: BeforeRemoveListener[] = [];
jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: mockNavigate,
      goBack: mockGoBack,
      addListener: (event: string, listener: BeforeRemoveListener) => {
        if (event === 'beforeRemove') mockBeforeRemove.push(listener);
        return () => {
          const index = mockBeforeRemove.indexOf(listener);
          if (index >= 0) mockBeforeRemove.splice(index, 1);
        };
      },
    }),
  };
});

import BackupMnemonicScreen from '../../src/screens/Auth/BackupMnemonicScreen';

const lastAlert = () => (Alert.alert as jest.Mock).mock.calls.at(-1);
const pressAlertButton = (text: string) => {
  const buttons = (lastAlert()?.[2] ?? []) as AlertButton[];
  act(() => buttons.find(button => button.text === text)?.onPress?.());
};

const triggerRemove = () => {
  const preventDefault = jest.fn();
  act(() => mockBeforeRemove.forEach(listener => listener({ preventDefault })));
  return preventDefault;
};

describe('BackupMnemonicScreen', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    mockBeforeRemove.length = 0;
    mockGetSnapshot.mockReturnValue({ sessionId: 1, mnemonic: MNEMONIC });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    Platform.OS = originalOS;
    jest.restoreAllMocks();
  });

  it('should render correctly with the phrase hidden', () => {
    const view = render(<BackupMnemonicScreen />);
    expect(view.getByText('복구 구문 백업')).toBeTruthy();
    expect(view.queryByTestId('backup-words')).toBeNull();
    expect(view.getByLabelText('복구 구문 보기')).toBeTruthy();
  });

  it('reveals the phrase after confirmation and can hide it again', () => {
    const view = render(<BackupMnemonicScreen />);
    fireEvent.press(view.getByTestId('backup-reveal'));
    pressAlertButton('확인');

    expect(view.getByTestId('backup-words')).toBeTruthy();
    expect(view.getByLabelText('12번째 단어 about')).toBeTruthy();

    fireEvent.press(view.getByTestId('backup-hide'));
    expect(view.queryByTestId('backup-words')).toBeNull();
    // 한 번 확인했다면 다시 숨겨도 다음 단계로 갈 수 있다.
    expect(
      view.getByTestId('backup-continue').props.accessibilityState.disabled,
    ).toBe(false);
  });

  it('keeps continue disabled until the phrase has been revealed', () => {
    const view = render(<BackupMnemonicScreen />);
    expect(
      view.getByTestId('backup-continue').props.accessibilityState.disabled,
    ).toBe(true);
    expect(view.getByText('복구 구문을 먼저 확인하세요')).toBeTruthy();
  });

  it('confirms before discarding the phrase from the header back button', () => {
    const view = render(<BackupMnemonicScreen />);
    fireEvent.press(view.getByLabelText('뒤로 가기'));
    expect(mockGoBack).toHaveBeenCalled();

    // goBack → beforeRemove: 헤더/하드웨어 뒤로 가기 모두 같은 확인을 거친다.
    const preventDefault = triggerRemove();
    expect(preventDefault).toHaveBeenCalled();
    expect(lastAlert()?.[0]).toBe('백업을 중단할까요?');
    expect(mockClear).not.toHaveBeenCalled();

    pressAlertButton('중단');
    expect(mockClear).toHaveBeenCalledWith('cancelled');
  });

  it('keeps the phrase when the user chooses to continue the backup', () => {
    render(<BackupMnemonicScreen />);
    triggerRemove();
    const buttons = (lastAlert()?.[2] ?? []) as AlertButton[];
    expect(buttons.find(b => b.text === '계속 백업하기')?.style).toBe('cancel');
    expect(mockClear).not.toHaveBeenCalled();
  });

  it('shows a screenshot caution on iOS only', () => {
    Platform.OS = 'ios';
    const ios = render(<BackupMnemonicScreen />);
    expect(ios.getByTestId('backup-ios-screenshot-warning')).toBeTruthy();
    ios.unmount();

    Platform.OS = 'android';
    const android = render(<BackupMnemonicScreen />);
    expect(android.queryByTestId('backup-ios-screenshot-warning')).toBeNull();
  });
});
