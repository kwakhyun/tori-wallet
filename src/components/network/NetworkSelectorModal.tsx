/**
 * 네트워크 선택 모달 (메인넷/테스트넷 구분)
 *
 * walletStore의 networks / activeNetworkChainId / setActiveNetwork를 직접 사용한다.
 * 테스트넷에서 메인넷으로 전환할 때는 실제 자산이 사용된다는 확인을 받는다.
 */

import React, { useCallback } from 'react';
import { Alert, Modal, ScrollView } from 'react-native';
import styled from 'styled-components/native';
import { useShallow } from 'zustand/react/shallow';
import { useWalletStore, type Network } from '@/store/walletStore';
import { Screen } from '@/components/common/Screen';
import { IconButton } from '@/components/common/IconButton';
import { showToast } from '@/store/toastStore';

export interface NetworkSelectorModalProps {
  visible: boolean;
  onClose: () => void;
  /** 전환이 끝난 뒤 호출 (확인 대화상자에서 취소하면 호출되지 않음) */
  onSelected?: (chainId: number) => void;
  testID?: string;
}

export function NetworkSelectorModal({
  visible,
  onClose,
  onSelected,
  testID = 'network-selector',
}: NetworkSelectorModalProps): React.JSX.Element {
  const { networks, activeNetworkChainId, setActiveNetwork } = useWalletStore(
    useShallow(state => ({
      networks: state.networks,
      activeNetworkChainId: state.activeNetworkChainId,
      setActiveNetwork: state.setActiveNetwork,
    })),
  );

  const activeNetwork = networks.find(n => n.chainId === activeNetworkChainId);

  const applyNetwork = useCallback(
    (network: Network) => {
      setActiveNetwork(network.chainId);
      onClose();
      showToast(`${network.name}(으)로 전환했습니다`, 'success');
      onSelected?.(network.chainId);
    },
    [setActiveNetwork, onClose, onSelected],
  );

  const handleSelect = useCallback(
    (network: Network) => {
      if (network.chainId === activeNetworkChainId) {
        onClose();
        return;
      }
      // 테스트넷에서 메인넷으로 전환할 때 경고
      if (activeNetwork?.isTestnet && !network.isTestnet) {
        Alert.alert(
          '메인넷으로 전환할까요?',
          `${network.name}은(는) 실제 자산이 사용되는 네트워크입니다.\n\n거래 시 실제 암호화폐가 소모되며, 잘못된 전송은 복구할 수 없습니다.`,
          [
            { text: '취소', style: 'cancel' },
            { text: '전환', onPress: () => applyNetwork(network) },
          ],
        );
        return;
      }
      applyNetwork(network);
    },
    [activeNetwork?.isTestnet, activeNetworkChainId, applyNetwork, onClose],
  );

  const renderNetwork = (network: Network) => {
    const selected = network.chainId === activeNetworkChainId;
    return (
      <NetworkItem
        key={network.chainId}
        onPress={() => handleSelect(network)}
        $selected={selected}
        accessibilityRole="radio"
        accessibilityState={{ selected, checked: selected }}
        accessibilityLabel={`${network.name}, ${
          network.isTestnet ? '테스트넷' : '메인넷'
        }`}
        testID={`${testID}-item-${network.chainId}`}
      >
        <NetworkDot $isTestnet={!!network.isTestnet} />
        <NetworkInfo>
          <NetworkName>{network.name}</NetworkName>
          <NetworkSymbol>
            {network.symbol}
            {network.isTestnet ? ' · 실제 가치 없음' : ''}
          </NetworkSymbol>
        </NetworkInfo>
        {selected ? (
          <CheckMark importantForAccessibility="no">✓</CheckMark>
        ) : null}
      </NetworkItem>
    );
  };

  const mainnets = networks.filter(n => !n.isTestnet);
  const testnets = networks.filter(n => n.isTestnet);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <Screen testID={testID}>
        <Header>
          <HeaderTitle accessibilityRole="header">네트워크 선택</HeaderTitle>
          <IconButton
            icon="✕"
            accessibilityLabel="닫기"
            onPress={onClose}
            testID={`${testID}-close`}
          />
        </Header>
        <ScrollView>
          <Content>
            <SectionTitle accessibilityRole="header">
              메인넷 (실제 자산)
            </SectionTitle>
            {mainnets.map(renderNetwork)}
            {testnets.length > 0 ? (
              <>
                <SectionTitle accessibilityRole="header">
                  테스트넷 (무료 테스트)
                </SectionTitle>
                {testnets.map(renderNetwork)}
              </>
            ) : null}
          </Content>
        </ScrollView>
      </Screen>
    </Modal>
  );
}

const Header = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  min-height: 56px;
  padding: 0 ${({ theme }) => theme.spacing.sm}px 0
    ${({ theme }) => theme.spacing.lg}px;
  border-bottom-width: 1px;
  border-bottom-color: ${({ theme }) => theme.colors.border};
`;

const HeaderTitle = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 18px;
  font-weight: 600;
`;

const Content = styled.View`
  padding: ${({ theme }) => theme.spacing.md}px
    ${({ theme }) => theme.spacing.lg}px;
`;

const SectionTitle = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  font-weight: 600;
  margin-top: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const NetworkItem = styled.TouchableOpacity<{ $selected: boolean }>`
  flex-direction: row;
  align-items: center;
  min-height: 56px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  border-width: 1px;
  border-color: ${({ theme, $selected }) =>
    $selected ? theme.colors.primary : theme.colors.border};
  background-color: ${({ theme, $selected }) =>
    $selected ? theme.colors.primarySubtle : theme.colors.surface};
`;

const NetworkDot = styled.View<{ $isTestnet: boolean }>`
  width: 10px;
  height: 10px;
  border-radius: 5px;
  margin-right: ${({ theme }) => theme.spacing.md}px;
  background-color: ${({ theme, $isTestnet }) =>
    $isTestnet ? theme.colors.warning : theme.colors.success};
`;

const NetworkInfo = styled.View`
  flex: 1;
`;

const NetworkName = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 16px;
  font-weight: 600;
`;

const NetworkSymbol = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  margin-top: 2px;
`;

const CheckMark = styled.Text`
  color: ${({ theme }) => theme.colors.primary};
  font-size: 18px;
  font-weight: 700;
`;

export default NetworkSelectorModal;
