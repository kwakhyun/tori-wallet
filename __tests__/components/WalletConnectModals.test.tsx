/**
 * WalletConnect 연결 제안 / 네트워크 전환 모달
 * - 처리 중에는 Android 뒤로 가기(onRequestClose)로 거부하지 않는다.
 * - 네트워크 전환은 dApp에 연결된 계정을 보여주고, 다른 계정이 활성이면 승인을 막는다.
 */

import React from 'react';
import { Modal, ScrollView } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from 'styled-components/native';
import { lightTheme } from '../../src/styles/theme';
import { ChainSwitchModal } from '../../src/components/walletconnect/ChainSwitchModal';
import { ProposalModal } from '../../src/components/walletconnect/ProposalModal';

const ADDRESS = '0x1234567890123456789012345678901234567890';

const renderWithTheme = (component: React.ReactElement) =>
  render(<ThemeProvider theme={lightTheme}>{component}</ThemeProvider>);

const chainProps = {
  visible: true,
  dAppName: 'dApp',
  dAppUrl: 'https://dapp.example',
  fromNetworkName: 'Ethereum',
  toNetworkName: 'Polygon',
  isAddChain: false,
  onApprove: jest.fn(),
  onReject: jest.fn(),
};

const proposalProps = {
  visible: true,
  proposalId: 1,
  dAppName: 'Swap',
  dAppUrl: 'https://swap.example',
  verification: {
    validation: 'VALID' as const,
    origin: 'https://swap.example',
    verifyUrl: '',
    isScam: false,
  },
  accountAddress: ADDRESS,
  chains: [{ chainId: 1, name: 'Ethereum', required: true }],
  methodLabels: [],
  onApprove: jest.fn(),
  onReject: jest.fn(),
};

beforeEach(() => jest.clearAllMocks());

describe('Android back while processing', () => {
  it('ChainSwitchModal: back rejects when idle, does nothing while switching', () => {
    const view = renderWithTheme(<ChainSwitchModal {...chainProps} />);
    view.UNSAFE_getByType(Modal).props.onRequestClose();
    expect(chainProps.onReject).toHaveBeenCalledTimes(1);

    view.rerender(
      <ThemeProvider theme={lightTheme}>
        <ChainSwitchModal {...chainProps} isProcessing />
      </ThemeProvider>,
    );
    view.UNSAFE_getByType(Modal).props.onRequestClose();
    expect(chainProps.onReject).toHaveBeenCalledTimes(1);
  });

  it('ProposalModal: back rejects when idle, does nothing while approving', () => {
    const view = renderWithTheme(<ProposalModal {...proposalProps} />);
    view.UNSAFE_getByType(Modal).props.onRequestClose();
    expect(proposalProps.onReject).toHaveBeenCalledTimes(1);

    view.rerender(
      <ThemeProvider theme={lightTheme}>
        <ProposalModal {...proposalProps} isProcessing />
      </ThemeProvider>,
    );
    view.UNSAFE_getByType(Modal).props.onRequestClose();
    expect(proposalProps.onReject).toHaveBeenCalledTimes(1);
  });
});

describe('ChainSwitchModal connected account', () => {
  it('shows the account the dApp is connected to', () => {
    const { getByTestId, getByText, queryByTestId } = renderWithTheme(
      <ChainSwitchModal
        {...chainProps}
        accountAddress={ADDRESS}
        accountName="계정 1"
      />,
    );
    expect(getByTestId('wc-chain-switch-account').props.children).toBe(
      ADDRESS,
    );
    expect(getByText('계정 1')).toBeTruthy();
    expect(queryByTestId('wc-chain-switch-account-mismatch')).toBeNull();
  });

  it('blocks the switch while another account is active and offers to switch accounts', () => {
    const onSwitchAccount = jest.fn();
    const { getByTestId, getByLabelText } = renderWithTheme(
      <ChainSwitchModal
        {...chainProps}
        accountAddress={ADDRESS}
        accountName="계정 1"
        accountMismatch
        onSwitchAccount={onSwitchAccount}
      />,
    );
    expect(getByTestId('wc-chain-switch-account-mismatch')).toBeTruthy();
    const approve = getByLabelText('Polygon(으)로 전환');
    expect(approve.props.accessibilityState).toEqual({ disabled: true });
    fireEvent.press(approve);
    expect(chainProps.onApprove).not.toHaveBeenCalled();
    fireEvent.press(getByTestId('wc-chain-switch-switch-account'));
    expect(onSwitchAccount).toHaveBeenCalledTimes(1);
  });

  it('scrolls the body so the account notice cannot push the buttons off a small screen', () => {
    const view = renderWithTheme(
      <ChainSwitchModal
        {...chainProps}
        accountAddress={ADDRESS}
        accountMismatch
        onSwitchAccount={jest.fn()}
      />,
    );
    const scroll = view.UNSAFE_getByType(ScrollView);
    // 안내와 계정 정보는 스크롤 영역 안, 승인/거부 버튼은 그 밖에 있다.
    expect(
      scroll.findAll(
        node => node.props.testID === 'wc-chain-switch-account-mismatch',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      scroll.findAll(node => node.props.testID === 'wc-chain-switch-approve'),
    ).toHaveLength(0);
  });
});
