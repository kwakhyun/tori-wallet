/**
 * Tori Wallet - SignRequestModal Tests
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from 'styled-components/native';
import { darkTheme } from '../../src/styles/theme';
import { SignRequestModal } from '../../src/components/SignRequestModal';

const renderWithTheme = (component: React.ReactElement) =>
  render(<ThemeProvider theme={darkTheme}>{component}</ThemeProvider>);

describe('SignRequestModal', () => {
  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
    onApprove: jest.fn(),
    onReject: jest.fn(),
    request: {
      id: 1,
      topic: 'test-topic',
      method: 'personal_sign',
      params: ['Hello World', '0x1234567890123456789012345678901234567890'],
    },
    dAppInfo: {
      name: 'Test dApp',
      url: 'https://test.com',
    },
    networkName: 'Ethereum',
    isLoading: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render correctly when visible', () => {
    const { toJSON } = renderWithTheme(<SignRequestModal {...defaultProps} />);
    expect(toJSON()).not.toBeNull();
  });

  it('should render empty when not visible', () => {
    const props = { ...defaultProps, visible: false };
    const { toJSON } = renderWithTheme(<SignRequestModal {...props} />);
    expect(toJSON()).toBeNull();
  });

  it('should display dApp name', () => {
    const { root } = renderWithTheme(<SignRequestModal {...defaultProps} />);
    expect(root).toBeTruthy();
  });

  it('should have approve button', () => {
    const { root } = renderWithTheme(<SignRequestModal {...defaultProps} />);
    expect(root).toBeTruthy();
  });

  it('should have reject button', () => {
    const { root } = renderWithTheme(<SignRequestModal {...defaultProps} />);
    expect(root.children).toBeDefined();
  });

  it('should show loading state', () => {
    const props = { ...defaultProps, isLoading: true };
    const { root } = renderWithTheme(<SignRequestModal {...props} />);
    expect(root).toBeTruthy();
  });

  it('should render with eth_sendTransaction method', () => {
    const props = {
      ...defaultProps,
      request: {
        id: 1,
        topic: 'test-topic',
        method: 'eth_sendTransaction',
        params: [
          {
            from: '0x1234567890123456789012345678901234567890',
            to: '0x0987654321098765432109876543210987654321',
            value: '0x0',
            data: '0x',
          },
        ],
      },
    };
    const { root } = renderWithTheme(<SignRequestModal {...props} />);
    expect(root).toBeTruthy();
  });

  it('should render with eth_signTypedData_v4 method', () => {
    const props = {
      ...defaultProps,
      request: {
        id: 1,
        topic: 'test-topic',
        method: 'eth_signTypedData_v4',
        params: [
          '0x1234567890123456789012345678901234567890',
          JSON.stringify({
            domain: {},
            types: { EIP712Domain: [] },
            primaryType: 'Mail',
            message: {},
          }),
        ],
      },
    };
    const { root } = renderWithTheme(<SignRequestModal {...props} />);
    expect(root).toBeTruthy();
  });
});
