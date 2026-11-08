/**
 * 오프라인 배너 테스트
 *
 * 배너는 화면 위에 겹치지 않고 Screen 레이아웃 안(상단 안전 영역 아래, 헤더 위)에 그려져
 * 헤더를 아래로 민다.
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import { act, render } from '@testing-library/react-native';
import NetInfo from '@react-native-community/netinfo';
import type { ReactTestRendererJSON } from 'react-test-renderer';
import { ThemeProvider } from 'styled-components/native';
import { lightTheme } from '../../src/styles/theme';
import { Screen, TabScreen } from '../../src/components/common/Screen';
import { ScreenHeader } from '../../src/components/common/ScreenHeader';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), canGoBack: () => true }),
}));

type NetInfoListener = (state: {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}) => void;

const addEventListener = NetInfo.addEventListener as unknown as jest.Mock;
let emit: NetInfoListener = () => {};
const unsubscribe = jest.fn();

const wrap = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);

beforeEach(() => {
  addEventListener.mockReset();
  unsubscribe.mockReset();
  addEventListener.mockImplementation((listener: NetInfoListener) => {
    emit = listener;
    return unsubscribe;
  });
});

const goOffline = () =>
  act(() => emit({ isConnected: false, isInternetReachable: false }));
const goOnline = () =>
  act(() => emit({ isConnected: true, isInternetReachable: true }));

describe('OfflineBanner', () => {
  it('renders inside the screen layout above the header instead of floating over it', () => {
    const view = wrap(
      <Screen testID="send-screen">
        <ScreenHeader title="송금" testID="send-header" />
      </Screen>,
    );
    expect(view.queryByTestId('offline-banner')).toBeNull();

    goOffline();

    const banner = view.getByTestId('offline-banner');
    // 배너가 화면 컨테이너의 첫 번째 자식이고 헤더가 그 뒤에 온다 (헤더를 아래로 민다).
    const tree = view.toJSON() as ReactTestRendererJSON;
    expect(tree.props.testID).toBe('send-screen');
    expect(
      (tree.children as ReactTestRendererJSON[]).map(
        child => child.props.testID,
      ),
    ).toEqual(['offline-banner', 'send-header']);

    const style = StyleSheet.flatten(banner.props.style);
    expect(style.position).not.toBe('absolute');
    expect(style.top).toBeUndefined();
    expect(style.zIndex).toBeUndefined();
    expect(banner.props.accessibilityLiveRegion).toBe('polite');

    goOnline();
    expect(view.queryByTestId('offline-banner')).toBeNull();
  });

  it('treats an unreachable internet connection as offline', () => {
    const view = wrap(<TabScreen testID="home-screen" />);
    act(() => emit({ isConnected: true, isInternetReachable: false }));
    expect(view.getByTestId('offline-banner')).toBeTruthy();

    // 초기의 null(확인 전)은 오프라인으로 보지 않는다.
    act(() => emit({ isConnected: true, isInternetReachable: null }));
    expect(view.queryByTestId('offline-banner')).toBeNull();
  });

  it('shares one NetInfo subscription across mounted screens and releases it', () => {
    const view = wrap(
      <>
        <Screen testID="first" />
        <TabScreen testID="second" />
      </>,
    );
    expect(addEventListener).toHaveBeenCalledTimes(1);

    goOffline();
    expect(view.getAllByTestId('offline-banner')).toHaveLength(2);

    view.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('can be turned off for screens that do not depend on the network', () => {
    const view = wrap(<Screen testID="pin-sheet" offlineBanner={false} />);
    goOffline();
    expect(view.queryByTestId('offline-banner')).toBeNull();
  });
});
