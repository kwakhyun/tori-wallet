/**
 * ToastHost: 잠긴 동안 숨김(알림·소비 없음), iOS 전체 창 오버레이, 키보드 위 배치,
 * iOS 비활성 상태(개인정보 보호 화면) 처리, Android 모달 안 표시
 */

import React from 'react';
import {
  AccessibilityInfo,
  AppState,
  Keyboard,
  Modal,
  Platform,
  StyleSheet,
  Text,
} from 'react-native';
import { act, render, within } from '@testing-library/react-native';
import { ThemeProvider } from 'styled-components/native';
import { FullWindowOverlay } from 'react-native-screens';
import { darkTheme } from '../../src/styles/theme';
import { ToastHost } from '../../src/components/common/ToastHost';
import { AppModal } from '../../src/components/common/AppModal';
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
  // RN Jest 목의 AccessibilityInfo 함수는 이미 jest.fn이라 spyOn이 같은 목을 돌려준다.
  announce.mockClear();
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

describe('ToastHost while the app is not active (iOS privacy cover)', () => {
  const originalState = AppState.currentState;
  let appStateHandler: ((state: string) => void) | undefined;

  beforeEach(() => {
    Platform.OS = 'ios';
    appStateHandler = undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _type: string,
      handler: (state: string) => void,
    ) => {
      appStateHandler = handler;
      return { remove: jest.fn() };
    }) as never);
  });

  afterEach(() => {
    (AppState as { currentState: unknown }).currentState = originalState;
  });

  it('draws the toast inside the app tree, under the privacy view, until the app is active again', () => {
    (AppState as { currentState: unknown }).currentState = 'inactive';
    const view = wrap();
    act(() =>
      showToast('거래가 완료되었습니다 · 0.5 ETH 전송', 'success', 4000),
    );
    // 창에 직접 올라가는 오버레이를 쓰지 않으므로 앱 전환기 스냅샷에 보이지 않는다.
    expect(view.getByTestId('toast')).toBeTruthy();
    expect(view.UNSAFE_queryAllByType(FullWindowOverlay)).toHaveLength(0);

    act(() => appStateHandler?.('active'));
    expect(view.UNSAFE_getAllByType(FullWindowOverlay)).toHaveLength(1);

    act(() => appStateHandler?.('background'));
    expect(view.UNSAFE_queryAllByType(FullWindowOverlay)).toHaveLength(0);
    expect(view.getByTestId('toast')).toBeTruthy();
  });
});

describe('ToastHost with an open Android modal (Dialog)', () => {
  beforeEach(() => {
    Platform.OS = 'android';
  });

  const app = (modals: { sheet: boolean; nested?: boolean }) => (
    <ThemeProvider theme={darkTheme}>
      <ToastHost />
      <AppModal visible={modals.sheet} testID="sheet">
        <Text>sheet</Text>
        <AppModal visible={!!modals.nested} testID="nested">
          <Text>nested</Text>
        </AppModal>
      </AppModal>
    </ThemeProvider>
  );

  const modal = (view: ReturnType<typeof render>, id: string) =>
    view
      .UNSAFE_getAllByType(Modal)
      .find(instance => instance.props.testID === id)!;

  it('draws the toast inside the open modal instead of under it, announcing once', () => {
    const view = render(app({ sheet: true }));
    act(() => showToast('네트워크를 추가했습니다', 'success', 1000));

    expect(view.getAllByTestId('toast')).toHaveLength(1);
    expect(within(modal(view, 'sheet')).getByTestId('toast')).toBeTruthy();
    expect(announce).toHaveBeenCalledTimes(1);

    // 모달이 닫히면 앱 루트에 다시 그리고, 타이머는 그대로 하나만 돈다.
    view.rerender(app({ sheet: false }));
    expect(view.getAllByTestId('toast')).toHaveLength(1);
    expect(announce).toHaveBeenCalledTimes(1);
    act(() => {
      jest.advanceTimersByTime(1500);
    });
    expect(view.queryByTestId('toast')).toBeNull();
  });

  it('uses the topmost modal when modals are nested', () => {
    const view = render(app({ sheet: true, nested: true }));
    act(() => showToast('클립보드를 읽지 못했습니다', 'error'));

    expect(view.getAllByTestId('toast')).toHaveLength(1);
    expect(within(modal(view, 'nested')).getByTestId('toast')).toBeTruthy();

    view.rerender(app({ sheet: true, nested: false }));
    expect(view.getAllByTestId('toast')).toHaveLength(1);
    expect(within(modal(view, 'sheet')).getByTestId('toast')).toBeTruthy();
  });

  it('keeps toasts out of modals while the wallet is locked', () => {
    const view = render(app({ sheet: true }));
    setWallet({ isLocked: true });
    act(() => showToast('거래가 완료되었습니다 · 0.5 ETH 전송', 'success'));
    expect(view.queryByTestId('toast')).toBeNull();
    expect(announce).not.toHaveBeenCalled();
  });

  it('does not add a modal toast surface on iOS (the overlay covers modals)', () => {
    Platform.OS = 'ios';
    const view = render(app({ sheet: true }));
    act(() => showToast('네트워크를 추가했습니다', 'success'));
    expect(view.getAllByTestId('toast')).toHaveLength(1);
    expect(within(modal(view, 'sheet')).queryByTestId('toast')).toBeNull();
    expect(view.UNSAFE_getAllByType(FullWindowOverlay)).toHaveLength(1);
  });
});
