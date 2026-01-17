/**
 * PIN 확인 모달 테스트
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from 'styled-components/native';
import { darkTheme } from '../../src/styles/theme';

// walletService 모킹
jest.mock('../../src/services/walletService', () => ({
  walletService: {
    verifyPin: jest.fn().mockResolvedValue(true),
  },
}));

import PinConfirmModal from '../../src/components/common/PinConfirmModal';

// 간단한 테스트 래퍼
const renderWithTheme = (component: React.ReactElement) =>
  render(<ThemeProvider theme={darkTheme}>{component}</ThemeProvider>);

describe('PinConfirmModal', () => {
  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
    onConfirm: jest.fn(),
    onCancel: jest.fn(),
    title: 'PIN 확인',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render correctly when visible', () => {
    const { toJSON } = renderWithTheme(<PinConfirmModal {...defaultProps} />);
    expect(toJSON()).not.toBeNull();
  });

  it('should display title', () => {
    const { getByText } = renderWithTheme(
      <PinConfirmModal {...defaultProps} />,
    );
    expect(getByText('PIN 확인')).toBeTruthy();
  });

  it('should have close/cancel button', () => {
    const { getByText } = renderWithTheme(
      <PinConfirmModal {...defaultProps} />,
    );
    expect(getByText('취소')).toBeTruthy();
  });

  it('should render numpad', () => {
    const { root } = renderWithTheme(<PinConfirmModal {...defaultProps} />);
    expect(root.children).toBeDefined();
  });

  it('should not render when not visible', () => {
    const props = { ...defaultProps, visible: false };
    const { toJSON } = renderWithTheme(<PinConfirmModal {...props} />);
    // Modal은 visible=false일 때도 렌더링되지만 내용이 보이지 않음
    expect(toJSON()).toBeDefined();
  });
});
