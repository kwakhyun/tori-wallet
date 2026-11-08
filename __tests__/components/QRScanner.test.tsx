/**
 * QR 스캐너: 허용되지 않는 QR 안내와 '다시 스캔' 버튼 (44pt 터치 영역)
 */

import React from 'react';
import { StyleSheet, Vibration } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from 'styled-components/native';
import { darkTheme } from '../../src/styles/theme';
import { QRScanner } from '../../src/components/common/QRScanner';

let mockScannerConfig: {
  onCodeScanned: (codes: { type: string; value?: string }[]) => void;
};

jest.mock('react-native-vision-camera', () => ({
  Camera: () => null,
  useCameraDevice: () => ({ id: 'back', hasTorch: false }),
  useCameraPermission: () => ({
    hasPermission: true,
    requestPermission: jest.fn(() => Promise.resolve(true)),
  }),
  useCodeScanner: (config: typeof mockScannerConfig) => {
    mockScannerConfig = config;
    return config;
  },
}));

beforeEach(() => {
  jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it('offers a retry button with at least a 44pt touch target after a rejected code', () => {
  const onScan = jest.fn();
  const view = render(
    <ThemeProvider theme={darkTheme}>
      <QRScanner visible onClose={jest.fn()} onScan={onScan} mode="address" />
    </ThemeProvider>,
  );
  act(() => {
    mockScannerConfig.onCodeScanned([{ type: 'qr', value: 'not a wallet' }]);
  });
  expect(view.getByTestId('qr-scanner-error')).toBeTruthy();
  expect(onScan).not.toHaveBeenCalled();

  const retry = view.getByTestId('qr-scanner-retry');
  const style = StyleSheet.flatten(retry.props.style);
  const slop = retry.props.hitSlop ?? { top: 0, bottom: 0 };
  expect(
    Math.max(style.minHeight ?? 0, style.height ?? 0) + slop.top + slop.bottom,
  ).toBeGreaterThanOrEqual(44);
  expect(style.minHeight).toBeGreaterThanOrEqual(44);
  expect(retry.props.accessibilityRole).toBe('button');
  expect(retry.props.accessibilityHint).toBeTruthy();

  fireEvent.press(retry);
  expect(view.queryByTestId('qr-scanner-error')).toBeNull();
});
