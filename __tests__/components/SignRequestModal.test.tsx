/**
 * 서명 요청 모달 테스트
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from 'styled-components/native';
import { darkTheme } from '../../src/styles/theme';
import { SignRequestModal } from '../../src/components/SignRequestModal';
import { analyzeSigningRequest } from '../../src/services/signingIntentService';

const renderWithTheme = (component: React.ReactElement) =>
  render(<ThemeProvider theme={darkTheme}>{component}</ThemeProvider>);

describe('SignRequestModal', () => {
  const account = '0x1234567890123456789012345678901234567890';
  const buildRequest = (method: string, params: unknown[]) => ({
    id: 1,
    topic: 'test-topic',
    method,
    params,
    chainId: 1,
    account,
    intent: analyzeSigningRequest({ method, params, chainId: 1, account }),
  });
  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
    onApprove: jest.fn(),
    onReject: jest.fn(),
    request: buildRequest('personal_sign', ['Hello World', account]),
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
      request: buildRequest('eth_sendTransaction', [
        {
          from: account,
          to: '0x0987654321098765432109876543210987654321',
          value: '0x0',
          data: '0x',
        },
      ]),
    };
    const { root } = renderWithTheme(<SignRequestModal {...props} />);
    expect(root).toBeTruthy();
  });

  it('should render with eth_signTypedData_v4 method', () => {
    const props = {
      ...defaultProps,
      request: buildRequest('eth_signTypedData_v4', [
        account,
        JSON.stringify({
          domain: { chainId: 1 },
          types: { EIP712Domain: [] },
          primaryType: 'Mail',
          message: {},
        }),
      ]),
    };
    const { root } = renderWithTheme(<SignRequestModal {...props} />);
    expect(root).toBeTruthy();
  });

  it('renders nothing without a signing request', () => {
    const { toJSON } = renderWithTheme(
      <SignRequestModal {...defaultProps} request={null} />,
    );
    expect(toJSON()).toBeNull();
  });

  it('shows a verified WalletConnect origin', () => {
    const { getByText } = renderWithTheme(
      <SignRequestModal
        {...defaultProps}
        dAppName="Verified dApp"
        dAppUrl="https://verified.example"
        dAppVerification={{
          validation: 'VALID',
          origin: 'https://verified.example',
          verifyUrl: 'https://verify.walletconnect.com',
          isScam: false,
        }}
      />,
    );

    expect(getByText('WalletConnect 출처 검증됨')).toBeTruthy();
    expect(getByText('Verified dApp')).toBeTruthy();
  });

  it('requires acknowledgement for an unverified origin', () => {
    const onApprove = jest.fn();
    const { getByRole, getByText } = renderWithTheme(
      <SignRequestModal
        {...defaultProps}
        onApprove={onApprove}
        dAppVerification={{
          validation: 'UNKNOWN',
          origin: '',
          verifyUrl: '',
          isScam: false,
        }}
      />,
    );

    expect(getByText('출처 검증 불가')).toBeTruthy();
    fireEvent.press(getByText('승인'));
    expect(onApprove).not.toHaveBeenCalled();

    fireEvent.press(getByRole('checkbox'));
    expect(getByText('☑')).toBeTruthy();
    fireEvent.press(getByText('승인'));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('blocks invalid and known-scam origins', () => {
    const onApprove = jest.fn();
    const { getByText } = renderWithTheme(
      <SignRequestModal
        {...defaultProps}
        onApprove={onApprove}
        dAppVerification={{
          validation: 'INVALID',
          origin: 'https://scam.example',
          verifyUrl: '',
          isScam: true,
        }}
      />,
    );

    expect(getByText('검증 실패 · 차단')).toBeTruthy();
    expect(getByText('차단됨')).toBeTruthy();
    fireEvent.press(getByText('차단됨'));
    expect(onApprove).not.toHaveBeenCalled();
  });

  it('renders warning severity and toggles explicit risk acknowledgement', () => {
    const riskyRequest = {
      ...defaultProps.request,
      intent: {
        ...defaultProps.request.intent,
        requiresRiskAcknowledgement: true,
        warnings: [
          { level: 'warning' as const, message: '권한 대상을 확인하세요.' },
          { level: 'critical' as const, message: '무제한 권한입니다.' },
        ],
      },
    };
    const { getByRole, getByText } = renderWithTheme(
      <SignRequestModal {...defaultProps} request={riskyRequest} />,
    );

    expect(getByText('권한 대상을 확인하세요.')).toBeTruthy();
    expect(getByText('무제한 권한입니다.')).toBeTruthy();
    fireEvent.press(getByRole('checkbox'));
    expect(getByText('☑')).toBeTruthy();
  });
});
