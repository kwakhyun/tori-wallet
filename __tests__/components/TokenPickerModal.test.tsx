/**
 * 토큰 선택 모달: 목록 일부만 있을 때도 불러오는 중/실패 상태를 숨기지 않는다.
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from 'styled-components/native';
import { darkTheme } from '../../src/styles/theme';
import {
  TokenPickerModal,
  type PickerToken,
} from '../../src/components/send/TokenPickerModal';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), canGoBack: () => true }),
}));

const native: PickerToken = { id: 'native', symbol: 'ETH', balance: '1.5' };

function mount(props: Partial<React.ComponentProps<typeof TokenPickerModal>>) {
  return render(
    <ThemeProvider theme={darkTheme}>
      <TokenPickerModal
        visible
        tokens={[native]}
        onSelect={jest.fn()}
        onClose={jest.fn()}
        testID="picker"
        {...props}
      />
    </ThemeProvider>,
  );
}

it('shows an inline loading row while the list loads even with a synthetic native entry', () => {
  const view = mount({ isLoading: true });
  expect(view.getByTestId('picker-loading-inline')).toHaveTextContent(
    /토큰 목록 불러오는 중/,
  );
  // 이미 있는 항목은 계속 고를 수 있다.
  expect(view.getByTestId('picker-item-ETH')).toBeTruthy();
  expect(view.queryByTestId('picker-error-inline')).toBeNull();
});

it('shows an inline error with retry when the list failed but some tokens exist', () => {
  const onRetry = jest.fn();
  const view = mount({ error: '잔액을 불러오지 못했습니다.', onRetry });
  expect(view.getByTestId('picker-error-inline')).toHaveTextContent(
    /토큰 목록을 불러오지 못했습니다.*잔액을 불러오지 못했습니다\./,
  );
  expect(view.getByTestId('picker-item-ETH')).toBeTruthy();
  fireEvent.press(view.getByTestId('picker-retry-inline'));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

it('prefers the loading row while a retry is in flight', () => {
  const view = mount({ isLoading: true, error: 'x', onRetry: jest.fn() });
  expect(view.getByTestId('picker-loading-inline')).toBeTruthy();
  expect(view.queryByTestId('picker-error-inline')).toBeNull();
});

it('keeps the full-screen loading state when there are no tokens at all', () => {
  const view = mount({ tokens: [], isLoading: true });
  expect(view.getByTestId('picker-loading')).toBeTruthy();
  expect(view.queryByTestId('picker-loading-inline')).toBeNull();
});

it('keeps the full-screen error state when there are no tokens at all', () => {
  const view = mount({ tokens: [], error: 'x', onRetry: jest.fn() });
  expect(view.getByTestId('picker-error')).toBeTruthy();
  expect(view.queryByTestId('picker-error-inline')).toBeNull();
});

it("renders an unknown balance as '—' and never as 0", () => {
  const view = mount({
    tokens: [native, { id: '0xabc', symbol: 'USDC', balance: null }],
  });
  expect(view.getByTestId('picker-item-USDC')).toHaveTextContent(/USDC—/);
  expect(view.getByTestId('picker-item-USDC').props.accessibilityLabel).toBe(
    'USDC, 잔액 알 수 없음',
  );
});
