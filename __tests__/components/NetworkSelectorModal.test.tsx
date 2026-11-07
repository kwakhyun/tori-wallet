/**
 * 네트워크 선택 모달 테스트
 */

import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent } from '../test-utils';

const mockSetActiveNetwork = jest.fn();
let mockActiveChainId = 11155111;

jest.mock('../../src/store/walletStore', () => ({
  useWalletStore: () => ({
    networks: [
      { chainId: 1, name: 'Ethereum Mainnet', symbol: 'ETH', isTestnet: false },
      { chainId: 8453, name: 'Base', symbol: 'ETH', isTestnet: false },
      {
        chainId: 11155111,
        name: 'Sepolia Testnet',
        symbol: 'ETH',
        isTestnet: true,
      },
    ],
    activeNetworkChainId: mockActiveChainId,
    setActiveNetwork: mockSetActiveNetwork,
  }),
}));

import { NetworkSelectorModal } from '../../src/components/network/NetworkSelectorModal';

describe('NetworkSelectorModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockActiveChainId = 11155111;
  });

  it('groups networks into mainnet and testnet sections', () => {
    render(<NetworkSelectorModal visible onClose={jest.fn()} />);
    expect(screen.getByText('메인넷 (실제 자산)')).toBeTruthy();
    expect(screen.getByText('테스트넷 (무료 테스트)')).toBeTruthy();
    expect(
      screen.getByTestId('network-selector-item-11155111').props
        .accessibilityState,
    ).toEqual(expect.objectContaining({ selected: true }));
  });

  it('asks for confirmation before switching from a testnet to a mainnet', () => {
    const onClose = jest.fn();
    render(<NetworkSelectorModal visible onClose={onClose} />);
    fireEvent.press(screen.getByTestId('network-selector-item-1'));

    expect(mockSetActiveNetwork).not.toHaveBeenCalled();
    const [title, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(title).toBe('메인넷으로 전환할까요?');
    buttons.find((b: { text: string }) => b.text === '전환').onPress();
    expect(mockSetActiveNetwork).toHaveBeenCalledWith(1);
    expect(onClose).toHaveBeenCalled();
  });

  it('switches between mainnets without a confirmation', () => {
    mockActiveChainId = 1;
    const onSelected = jest.fn();
    render(
      <NetworkSelectorModal
        visible
        onClose={jest.fn()}
        onSelected={onSelected}
      />,
    );
    fireEvent.press(screen.getByTestId('network-selector-item-8453'));
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockSetActiveNetwork).toHaveBeenCalledWith(8453);
    expect(onSelected).toHaveBeenCalledWith(8453);
  });

  it('closes from an accessible close button', () => {
    const onClose = jest.fn();
    render(<NetworkSelectorModal visible onClose={onClose} />);
    fireEvent.press(screen.getByLabelText('닫기'));
    expect(onClose).toHaveBeenCalled();
  });
});
