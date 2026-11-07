/**
 * ToastHost: 잠긴 동안 숨김(알림·소비 없음), iOS 전체 창 오버레이, 키보드 위 배치
 */

import React from 'react';
import {
  AccessibilityInfo,
  Keyboard,
  Platform,
  StyleSheet,
} from 'react-native';
import { act, render } from '@testing-library/react-native';
import { ThemeProvider } from 'styled-components/native';
import { FullWindowOverlay } from 'react-native-screens';
import { darkTheme } from '../../src/styles/theme';
import { ToastHost } from '../../src/components/common/ToastHost';
import { showToast, useToastStore } from '../../src/store/toastStore';
import { useWalletStore } from '../../src/store/walletStore';

type KeyboardHandler = (event?: { endCoordinates: { height: number } }) => void;

const wrap = () =>
  render(
    <ThemeProvider theme={darkTheme}>
      <ToastHost />
    </ThemeProvider>,
  );

const setWallet = (state: { hasWallet?: boolean; isLocked?: boolean }) =>
  act(() => {
    useWalletStore.setState(state);
  });

const toastBottom = (view: ReturnType<typeof wrap>) =>
  StyleSheet.flatten(view.getByTestId('toast-container').props.style)?.bottom;

const originalOS = Platform.OS;
let keyboardHandlers: Record<string, KeyboardHandler>;
let announce: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  useToastStore.getState().reset();
  useWalletStore.setState({ hasWallet: true, isLocked: false });
  announce = jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation(() => undefined);
  keyboardHandlers = {};
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((
    event: string,
    handler: KeyboardHandler,
  ) => {
    keyboardHandlers[event] = handler;
    return { remove: jest.fn() };
  }) as never);
});

afterEach(() => {
  Platform.OS = originalOS;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('ToastHost while the wallet is locked', () => {
  it('renders nothing, does not announce and keeps the toast for after unlock', () => {
    setWallet({ isLocked: true });
    const view = wrap();
    act(() =>
      showToast('거래가 완료되었습니다 · 0.5 ETH 전송', 'success', 1000),
    );

    expect(view.queryByTestId('toast')).toBeNull();
    expect(announce).not.toHaveBeenCalled();

    // 잠긴 동안에는 타이머가 돌지 않아 토스트가 소비되지 않는다.
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(useToastStore.getState().current?.message).toBe(
      '거래가 완료되었습니다 · 0.5 ETH 전송',
    );

    setWallet({ isLocked: false });
    expect(view.getByTestId('toast')).toBeTruthy();
    expect(announce).toHaveBeenCalledWith(
      '거래가 완료되었습니다 · 0.5 ETH 전송',
    );

    act(() => {
      jest.advanceTimersByTime(1500);
    });
    expect(useToastStore.getState().current).toBeNull();
  });

  it('hides a toast that was already showing when the lock engages', () => {
    const view = wrap();
    act(() => showToast('주소를 복사했습니다', 'success', 1000));
    expect(view.getByTestId('toast')).toBeTruthy();

    setWallet({ isLocked: true });
    expect(view.queryByTestId('toast')).toBeNull();
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(useToastStore.getState().current?.message).toBe(
      '주소를 복사했습니다',
    );
  });

  it('still shows toasts when there is no wallet (e.g. after a PIN-reset)', () => {
    setWallet({ hasWallet: false, isLocked: true });
    const view = wrap();
    act(() => showToast('지갑을 초기화했습니다.', 'success'));
    expect(view.getByTestId('toast')).toBeTruthy();
  });
});

describe('ToastHost placement', () => {
  it('renders through a full-window overlay on iOS so it sits above modals', () => {
    Platform.OS = 'ios';
    const view = wrap();
    expect(view.UNSAFE_queryAllByType(FullWindowOverlay)).toHaveLength(0);

    act(() => showToast('네트워크를 추가했습니다', 'success'));
    const overlays = view.UNSAFE_getAllByType(FullWindowOverlay);
    expect(overlays).toHaveLength(1);
    // 화면 낭독기가 아래 앱을 계속 탐색할 수 있어야 한다.
    expect(overlays[0].props.unstable_accessibilityContainerViewIsModal).toBe(
      false,
    );
  });

  it('lifts the toast above the iOS keyboard', () => {
    Platform.OS = 'ios';
    const view = wrap();
    act(() => showToast('클립보드에 지갑 주소나 ENS 이름이 없습니다', 'info'));
    expect(toastBottom(view)).toBe(96);

    act(() =>
      keyboardHandlers.keyboardWillShow({ endCoordinates: { height: 300 } }),
    );
    expect(toastBottom(view)).toBe(316);

    act(() => keyboardHandlers.keyboardWillHide());
    expect(toastBottom(view)).toBe(96);
  });

  it('stays in the app tree on Android (adjustResize moves it)', () => {
    Platform.OS = 'android';
    const view = wrap();
    act(() => showToast('저장했습니다', 'success'));
    expect(view.getByTestId('toast')).toBeTruthy();
    expect(view.UNSAFE_queryAllByType(FullWindowOverlay)).toHaveLength(0);
    expect(keyboardHandlers.keyboardWillShow).toBeUndefined();
  });
});
