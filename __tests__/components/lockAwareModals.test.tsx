/**
 * 화면 모달은 자동 잠금 시 닫히거나(시트/선택기) 취소된다(PIN 확인).
 * 잠금 오버레이 위나 아래에 시트가 남아 잠금 화면이 가려지지 않게 한다.
 */

import React from 'react';
import { act, render } from '@testing-library/react-native';
import { ThemeProvider } from 'styled-components/native';
import { darkTheme } from '../../src/styles/theme';
import { useWalletStore } from '../../src/store/walletStore';
import { SheetModal } from '../../src/screens/Settings/components/SettingsUI';
import { PinVerifyModal } from '../../src/screens/Settings/components/PinPrompt';
import { NetworkSelectorModal } from '../../src/components/network/NetworkSelectorModal';
import { TokenPickerModal } from '../../src/components/send/TokenPickerModal';
import { QRScanner } from '../../src/components/common/QRScanner';

// 권한 요청이 거부로 끝나게 해 권한 요청이 반복되지 않게 한다.
jest.mock('react-native-vision-camera', () => ({
  Camera: jest.fn(() => null),
  useCameraDevice: jest.fn(() => null),
  useCameraPermission: jest.fn(() => ({
    hasPermission: false,
    requestPermission: jest.fn(() => Promise.resolve(false)),
  })),
  useCodeScanner: jest.fn(() => null),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), canGoBack: () => true }),
}));

const wrap = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={darkTheme}>{ui}</ThemeProvider>);

const lock = () =>
  act(() => {
    useWalletStore.getState().lock();
  });

beforeEach(() => {
  useWalletStore.setState({ hasWallet: true, isLocked: false });
});

describe('screen modals on auto-lock', () => {
  it('closes a Settings sheet', () => {
    const onClose = jest.fn();
    const view = wrap(
      <SheetModal visible title="테마" onClose={onClose} testID="sheet">
        {null}
      </SheetModal>,
    );
    expect(view.getByTestId('sheet')).toBeTruthy();
    lock();
    expect(view.queryByTestId('sheet')).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('only hides a sheet whose work cannot be interrupted, and shows it again after unlock', () => {
    const onClose = jest.fn();
    const view = wrap(
      <SheetModal
        visible
        title="지갑 삭제"
        onClose={onClose}
        closeDisabled
        testID="busy-sheet"
      >
        {null}
      </SheetModal>,
    );
    lock();
    expect(view.queryByTestId('busy-sheet')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      useWalletStore.setState({ isLocked: false });
    });
    expect(view.getByTestId('busy-sheet')).toBeTruthy();
  });

  it('cancels the Settings PIN prompt', () => {
    const onCancel = jest.fn();
    const view = wrap(
      <PinVerifyModal
        visible
        title="PIN 확인"
        description="PIN을 입력하세요"
        onVerified={jest.fn()}
        onCancel={onCancel}
      />,
    );
    expect(view.getByTestId('pin-verify-modal')).toBeTruthy();
    lock();
    expect(view.queryByTestId('pin-verify-modal')).toBeNull();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('closes the network selector and the token picker', () => {
    const onCloseNetwork = jest.fn();
    const onClosePicker = jest.fn();
    const view = wrap(
      <>
        <NetworkSelectorModal visible onClose={onCloseNetwork} />
        <TokenPickerModal
          visible={false}
          tokens={[]}
          onSelect={jest.fn()}
          onClose={onClosePicker}
          testID="picker"
        />
      </>,
    );
    expect(view.getByTestId('network-selector')).toBeTruthy();
    lock();
    expect(view.queryByTestId('network-selector')).toBeNull();
    expect(onCloseNetwork).toHaveBeenCalledTimes(1);
    // 열려 있지 않던 모달은 건드리지 않는다.
    expect(onClosePicker).not.toHaveBeenCalled();
  });

  it('closes the QR scanner (camera off while locked)', async () => {
    const onClose = jest.fn();
    const view = wrap(
      <QRScanner visible onClose={onClose} onScan={jest.fn()} />,
    );
    // 카메라 권한 요청 결과를 반영한다.
    await act(async () => {});
    expect(view.getByTestId('qr-scanner-container')).toBeTruthy();
    lock();
    expect(view.queryByTestId('qr-scanner-container')).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
