/**
 * 네트워크 선택 모달 테스트
 */

import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent } from '../test-utils';

const mockSetActiveNetwork = jest.fn();
let mockActiveChainId = 11155111;
const BUILT_IN = [
  { chainId: 1, name: 'Ethereum Mainnet', symbol: 'ETH', isTestnet: false },
  { chainId: 8453, name: 'Base', symbol: 'ETH', isTestnet: false },
  {
    chainId: 11155111,
    name: 'Sepolia Testnet',
    symbol: 'ETH',
    isTestnet: true,
  },
];
let mockNetworks: Array<Record<string, unknown>> = BUILT_IN;

jest.mock('../../src/store/walletStore', () => ({
  useWalletStore: () => ({
    networks: mockNetworks,
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
    mockNetworks = BUILT_IN;
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

  describe('user-added networks', () => {
    beforeEach(() => {
      mockActiveChainId = 1;
      mockNetworks = [
        ...BUILT_IN,
        // 기본 네트워크와 이름/통화가 같은 커스텀 네트워크
        {
          chainId: 1337,
          name: 'Ethereum Mainnet',
          symbol: 'ETH',
          isTestnet: false,
          isCustom: true,
          rpcUrl: 'https://rpc.example.com',
        },
      ];
    });

    it('lists custom networks in their own section with a badge and chain id', () => {
      render(<NetworkSelectorModal visible onClose={jest.fn()} />);

      expect(screen.getByText('내가 추가한 네트워크')).toBeTruthy();
      // 메인넷 묶음에는 기본 네트워크만
      const mainnets = screen.getByTestId('network-selector-group-mainnet');
      expect(
        mainnets.findAll(
          node => node.props.testID === 'network-selector-item-1337',
        ),
      ).toHaveLength(0);
      const custom = screen.getByTestId('network-selector-group-custom');
      expect(
        custom.findAll(
          node => node.props.testID === 'network-selector-item-1337',
        ).length,
      ).toBeGreaterThan(0);

      expect(
        screen.getByTestId('network-selector-item-1337-custom'),
      ).toHaveTextContent('커스텀');
      expect(screen.queryByTestId('network-selector-item-1-custom')).toBeNull();
      expect(screen.getByText('ETH · 체인 ID 1337')).toBeTruthy();
      expect(screen.getByText('ETH · 체인 ID 1')).toBeTruthy();
      expect(
        screen.getByTestId('network-selector-item-1337').props
          .accessibilityLabel,
      ).toBe('Ethereum Mainnet, ETH, 메인넷, 직접 추가함');
      expect(
        screen.getByTestId('network-selector-item-1').props.accessibilityLabel,
      ).toBe('Ethereum Mainnet, ETH, 메인넷');
      expect(
        screen.getByText(
          '직접 추가한 네트워크에서는 잔액 조회와 기본 통화 송금만 지원합니다.',
        ),
      ).toBeTruthy();
    });

    it('switches to a custom network from the shared list', () => {
      const onSelected = jest.fn();
      render(
        <NetworkSelectorModal
          visible
          onClose={jest.fn()}
          onSelected={onSelected}
        />,
      );
      fireEvent.press(screen.getByTestId('network-selector-item-1337'));
      expect(mockSetActiveNetwork).toHaveBeenCalledWith(1337);
      expect(onSelected).toHaveBeenCalledWith(1337);
    });

    it('does not offer deleting networks from the Home selector', () => {
      render(<NetworkSelectorModal visible onClose={jest.fn()} />);
      expect(screen.queryByTestId('network-remove-1337')).toBeNull();
    });
  });

  it('closes from an accessible close button', () => {
    const onClose = jest.fn();
    render(<NetworkSelectorModal visible onClose={onClose} />);
    fireEvent.press(screen.getByLabelText('닫기'));
    expect(onClose).toHaveBeenCalled();
  });
});
