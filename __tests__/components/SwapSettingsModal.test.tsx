/**
 * 스왑 설정 모달 테스트 — swapStore가 유일한 설정 저장소
 */

import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react-native';
import { ThemeProvider } from 'styled-components/native';
import { SwapSettingsModal } from '../../src/components/swap/SwapSettingsModal';
import { useSwapStore } from '../../src/store/swapStore';
import { theme } from '../../src/styles/theme';

const initialState = useSwapStore.getState();

afterEach(() => {
  cleanup();
  useSwapStore.setState(initialState);
});

function mount(onClose = jest.fn()) {
  return {
    onClose,
    ...render(
      <ThemeProvider theme={theme}>
        <SwapSettingsModal visible onClose={onClose} />
      </ThemeProvider>,
    ),
  };
}

it('persists the chosen slippage to swapStore on save', () => {
  const view = mount();
  fireEvent.press(view.getByTestId('swap-settings-slippage-3'));
  expect(useSwapStore.getState().settings.defaultSlippage).toBe(0.5);

  fireEvent.press(view.getByTestId('swap-settings-save'));
  expect(useSwapStore.getState().settings).toEqual({
    defaultSlippage: 3,
    autoSlippage: false,
  });
  expect(view.onClose).toHaveBeenCalled();
});

it('discards unsaved changes when closed', () => {
  const view = mount();
  fireEvent.press(view.getByTestId('swap-settings-slippage-1'));
  fireEvent.press(view.getByLabelText('닫기'));
  expect(useSwapStore.getState().settings.autoSlippage).toBe(true);
});

it('warns about high slippage', () => {
  const view = mount();
  expect(view.queryByRole('alert')).toBeNull();
  fireEvent.press(view.getByTestId('swap-settings-slippage-3'));
  expect(view.getByText(/높은 슬리피지/)).toBeTruthy();
});

it('does not offer settings the 0x flow cannot honor', () => {
  const view = mount();
  expect(view.queryByText('거래 기한')).toBeNull();
  expect(view.queryByText('가스 우선순위')).toBeNull();
  expect(view.queryByText('전문가 모드')).toBeNull();
  expect(view.queryByText('가격 영향 경고')).toBeNull();
});
