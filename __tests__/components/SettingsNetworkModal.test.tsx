/**
 * 설정 네트워크 시트 테스트
 * 홈 네트워크 선택 모달과 같은 NetworkList를 쓰는지 (묶음/배지/체인 ID/전환 경고) 확인한다.
 */

import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent } from '../test-utils';

const mockSetActiveNetwork = jest.fn();
const mockRemoveNetwork = jest.fn();
let mockActiveChainId = 11155111;

jest.mock('../../src/store/walletStore', () => ({
  useWalletStore: () => ({
    networks: [
      { chainId: 1, name: 'Ethereum', symbol: 'ETH', isTestnet: false },
      {
        chainId: 11155111,
        name: 'Sepolia',
        symbol: 'ETH',
        isTestnet: true,
      },
      {
        chainId: 1337,
        name: 'Ethereum',
        symbol: 'ETH',
        isTestnet: false,
        isCustom: true,
        rpcUrl: 'https://rpc.example.com',
      },
    ],
    activeNetworkChainId: mockActiveChainId,
    setActiveNetwork: mockSetActiveNetwork,
    removeNetwork: mockRemoveNetwork,
  }),
}));

import { SettingsNetworkModal } from '../../src/screens/Settings/components/SettingsNetworkModal';

describe('SettingsNetworkModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockActiveChainId = 11155111;
  });

  it('uses the shared grouping, badge and chain id', () => {
    render(<SettingsNetworkModal visible onClose={jest.fn()} />);
    expect(screen.getByText('메인넷 (실제 자산)')).toBeTruthy();
    expect(screen.getByText('테스트넷 (무료 테스트)')).toBeTruthy();
    expect(screen.getByText('내가 추가한 네트워크')).toBeTruthy();
    expect(screen.getByTestId('network-option-1337-custom')).toHaveTextContent(
      '커스텀',
    );
    expect(screen.getByText('ETH · 체인 ID 1337')).toBeTruthy();
    expect(
      screen.getByTestId('network-option-1337').props.accessibilityLabel,
    ).toBe('Ethereum, ETH, 메인넷, 직접 추가함');
    // 안내 문구는 한 번만 (추가 버튼 아래)
    expect(
      screen.getAllByText(
        '직접 추가한 네트워크에서는 잔액 조회와 기본 통화 송금만 지원합니다.',
      ),
    ).toHaveLength(1);
  });

  it('asks before leaving a testnet for a custom mainnet', () => {
    const onClose = jest.fn();
    render(<SettingsNetworkModal visible onClose={onClose} />);
    fireEvent.press(screen.getByTestId('network-option-1337'));
    expect(mockSetActiveNetwork).not.toHaveBeenCalled();
    const [title, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(title).toBe('메인넷으로 전환할까요?');
    buttons.find((b: { text: string }) => b.text === '전환').onPress();
    expect(mockSetActiveNetwork).toHaveBeenCalledWith(1337);
    expect(onClose).toHaveBeenCalled();
  });

  it('offers deleting only user-added networks', () => {
    render(<SettingsNetworkModal visible onClose={jest.fn()} />);
    expect(screen.queryByTestId('network-remove-1')).toBeNull();
    fireEvent.press(screen.getByTestId('network-remove-1337'));
    const [title, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(title).toBe('네트워크 삭제');
    buttons.find((b: { text: string }) => b.text === '삭제').onPress();
    expect(mockRemoveNetwork).toHaveBeenCalledWith(1337);
  });
});
