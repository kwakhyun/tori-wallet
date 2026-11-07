/**
 * 공용 기반 컴포넌트 테스트 (PinPad, ScreenHeader, ToastHost, StateViews)
 */

import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from 'styled-components/native';
import { darkTheme } from '../../src/styles/theme';
import { PinPad } from '../../src/components/common/PinPad';
import { ScreenHeader } from '../../src/components/common/ScreenHeader';
import { ToastHost } from '../../src/components/common/ToastHost';
import { ErrorState } from '../../src/components/common/StateViews';
import { showToast, useToastStore } from '../../src/store/toastStore';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, canGoBack: () => true }),
}));

const wrap = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={darkTheme}>{ui}</ThemeProvider>);

describe('PinPad', () => {
  it('announces how many digits were entered', () => {
    const { getByTestId } = wrap(
      <PinPad value="12" onDigit={jest.fn()} onDelete={jest.fn()} />,
    );
    expect(getByTestId('pin-dots').props.accessibilityLabel).toBe(
      'PIN 6자리 중 2자리 입력됨',
    );
  });

  it('forwards digits and deletes', () => {
    const onDigit = jest.fn();
    const onDelete = jest.fn();
    const { getByTestId } = wrap(
      <PinPad value="1" onDigit={onDigit} onDelete={onDelete} />,
    );
    fireEvent.press(getByTestId('pin-key-7'));
    fireEvent.press(getByTestId('pin-key-delete'));
    expect(onDigit).toHaveBeenCalledWith('7');
    expect(onDelete).toHaveBeenCalled();
  });

  it('ignores input when disabled or full', () => {
    const onDigit = jest.fn();
    const { getByTestId, rerender } = wrap(
      <PinPad value="" disabled onDigit={onDigit} onDelete={jest.fn()} />,
    );
    fireEvent.press(getByTestId('pin-key-1'));
    rerender(
      <ThemeProvider theme={darkTheme}>
        <PinPad value="123456" onDigit={onDigit} onDelete={jest.fn()} />
      </ThemeProvider>,
    );
    fireEvent.press(getByTestId('pin-key-2'));
    expect(onDigit).not.toHaveBeenCalled();
  });

  it('renders an optional left action with an accessibility label', () => {
    const onPress = jest.fn();
    const { getByLabelText } = wrap(
      <PinPad
        value=""
        onDigit={jest.fn()}
        onDelete={jest.fn()}
        leftAction={{
          label: '🔐',
          accessibilityLabel: '생체인증으로 잠금 해제',
          onPress,
        }}
      />,
    );
    fireEvent.press(getByLabelText('생체인증으로 잠금 해제'));
    expect(onPress).toHaveBeenCalled();
  });
});

describe('ScreenHeader', () => {
  beforeEach(() => mockGoBack.mockClear());

  it('labels the back button for screen readers and goes back', () => {
    const { getByLabelText, getByText } = wrap(<ScreenHeader title="전송" />);
    expect(getByText('전송')).toBeTruthy();
    fireEvent.press(getByLabelText('뒤로 가기'));
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('uses a custom close handler', () => {
    const onBack = jest.fn();
    const { getByLabelText } = wrap(
      <ScreenHeader title="주소록" leftIcon="close" onBack={onBack} />,
    );
    fireEvent.press(getByLabelText('닫기'));
    expect(onBack).toHaveBeenCalled();
    expect(mockGoBack).not.toHaveBeenCalled();
  });
});

describe('ToastHost', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useToastStore.getState().reset();
  });
  afterEach(() => jest.useRealTimers());

  it('shows a queued toast and dismisses it after its duration', () => {
    const { queryByText } = wrap(<ToastHost />);
    act(() => showToast('주소를 복사했습니다', 'success', 1000));
    expect(queryByText('주소를 복사했습니다')).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(1500);
    });
    expect(useToastStore.getState().current).toBeNull();
  });

  it('does not stack duplicate messages', () => {
    showToast('a');
    showToast('a');
    showToast('b');
    expect(useToastStore.getState().queue.map(t => t.message)).toEqual(['b']);
  });
});

describe('ErrorState', () => {
  it('offers a retry action', () => {
    const onRetry = jest.fn();
    const { getByText } = wrap(<ErrorState onRetry={onRetry} />);
    fireEvent.press(getByText('다시 시도'));
    expect(onRetry).toHaveBeenCalled();
  });
});
