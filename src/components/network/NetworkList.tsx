/**
 * 네트워크 목록 (홈 네트워크 선택 모달 / 설정 네트워크 관리 시트 공용)
 *
 * - 기본 메인넷 / 기본 테스트넷 / 내가 추가한 네트워크 세 묶음으로 나눈다.
 * - 직접 추가한 네트워크는 '커스텀' 배지, 체인 ID, 접근성 라벨 ', 직접 추가함'을 붙여
 *   기본 네트워크와 이름·통화 기호가 같아도(예: 직접 추가한 'Ethereum') 구분되게 한다.
 * - useNetworkSwitch: 테스트넷에서 메인넷으로 옮길 때 실제 자산 경고 확인을 받는다.
 *
 * 색상은 테마 토큰만 사용한다.
 */

import React, { useCallback } from 'react';
import { Alert } from 'react-native';
import styled from 'styled-components/native';
import { useShallow } from 'zustand/react/shallow';
import { useWalletStore, type Network } from '@/store/walletStore';
import { showToast } from '@/store/toastStore';
import { IconButton } from '@/components/common/IconButton';

/** 직접 추가한 네트워크에서 되는 일 (설정 시트와 홈 선택 모달이 같은 문구를 쓴다) */
export const CUSTOM_NETWORK_HINT =
  '직접 추가한 네트워크에서는 잔액 조회와 기본 통화 송금만 지원합니다.';

export interface NetworkGroup {
  key: 'mainnet' | 'testnet' | 'custom';
  title: string;
  items: Network[];
}

/** 기본 메인넷 / 기본 테스트넷 / 직접 추가한 네트워크 (빈 묶음 포함) */
export function groupNetworks(networks: readonly Network[]): NetworkGroup[] {
  return [
    {
      key: 'mainnet',
      title: '메인넷 (실제 자산)',
      items: networks.filter(n => !n.isCustom && !n.isTestnet),
    },
    {
      key: 'testnet',
      title: '테스트넷 (무료 테스트)',
      items: networks.filter(n => !n.isCustom && n.isTestnet),
    },
    {
      key: 'custom',
      title: '내가 추가한 네트워크',
      items: networks.filter(n => n.isCustom),
    },
  ];
}

/** 행의 접근성 라벨: 이름, 통화, 메인넷/테스트넷, 직접 추가 여부 */
export function networkAccessibilityLabel(network: Network): string {
  return `${network.name}, ${network.symbol}${
    network.isTestnet ? ', 테스트넷' : ', 메인넷'
  }${network.isCustom ? ', 직접 추가함' : ''}`;
}

interface UseNetworkSwitchOptions {
  /** 목록을 닫는다 (같은 네트워크를 고르거나 전환이 끝났을 때) */
  onClose: () => void;
  /** 전환이 끝난 뒤 호출 (확인 대화상자에서 취소하면 호출되지 않음) */
  onSwitched?: (chainId: number) => void;
}

/**
 * 네트워크 전환 동작 (두 목록 공통)
 * 테스트넷에서 실제 자산 네트워크로 옮길 때는 확인을 받는다.
 */
export function useNetworkSwitch({
  onClose,
  onSwitched,
}: UseNetworkSwitchOptions): {
  activeChainId: number;
  networks: Network[];
  selectNetwork: (network: Network) => void;
} {
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
      onSwitched?.(network.chainId);
    },
    [setActiveNetwork, onClose, onSwitched],
  );

  const selectNetwork = useCallback(
    (network: Network) => {
      if (network.chainId === activeNetworkChainId) {
        onClose();
        return;
      }
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

  return { activeChainId: activeNetworkChainId, networks, selectNetwork };
}

export interface NetworkListProps {
  networks: readonly Network[];
  activeChainId: number;
  onSelect: (network: Network) => void;
  /** 있으면 직접 추가한 네트워크 행에 삭제 버튼을 둔다 */
  onRemove?: (network: Network) => void;
  /** 행 testID 접두사 (뒤에 체인 ID가 붙는다) */
  itemTestIDPrefix: string;
  /** 삭제 버튼 testID 접두사 (뒤에 체인 ID가 붙는다) */
  removeTestIDPrefix?: string;
  /** 직접 추가한 네트워크 묶음 아래에 지원 범위 안내를 보일지 (기본 true) */
  showCustomHint?: boolean;
  /** 묶음 testID 접두사 (`${testID}-group-mainnet|testnet|custom`) */
  testID?: string;
}

export function NetworkList({
  networks,
  activeChainId,
  onSelect,
  onRemove,
  itemTestIDPrefix,
  removeTestIDPrefix = 'network-remove-',
  showCustomHint = true,
  testID = 'network-list',
}: NetworkListProps): React.JSX.Element {
  return (
    <>
      {groupNetworks(networks).map(group =>
        group.items.length > 0 ? (
          <Group key={group.key} testID={`${testID}-group-${group.key}`}>
            <SectionTitle accessibilityRole="header">
              {group.title}
            </SectionTitle>
            {group.items.map(network => {
              const active = network.chainId === activeChainId;
              return (
                <NetworkRow key={network.chainId} $active={active}>
                  <NetworkTouchable
                    onPress={() => onSelect(network)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active, checked: active }}
                    accessibilityLabel={networkAccessibilityLabel(network)}
                    testID={`${itemTestIDPrefix}${network.chainId}`}
                  >
                    <Dot $testnet={!!network.isTestnet} />
                    <NetworkInfo>
                      <NameRow>
                        <NetworkName numberOfLines={1}>
                          {network.name}
                        </NetworkName>
                        {network.isCustom ? (
                          <Badge
                            testID={`${itemTestIDPrefix}${network.chainId}-custom`}
                          >
                            커스텀
                          </Badge>
                        ) : null}
                      </NameRow>
                      <NetworkMeta numberOfLines={1}>
                        {network.symbol} · 체인 ID {network.chainId}
                        {network.isTestnet ? ' · 실제 가치 없음' : ''}
                      </NetworkMeta>
                    </NetworkInfo>
                    {active ? (
                      <Check importantForAccessibility="no">✓</Check>
                    ) : null}
                  </NetworkTouchable>
                  {onRemove && network.isCustom ? (
                    <IconButton
                      icon="🗑️"
                      accessibilityLabel={`${network.name} 네트워크 삭제`}
                      onPress={() => onRemove(network)}
                      testID={`${removeTestIDPrefix}${network.chainId}`}
                    />
                  ) : null}
                </NetworkRow>
              );
            })}
            {group.key === 'custom' && showCustomHint ? (
              <Hint>{CUSTOM_NETWORK_HINT}</Hint>
            ) : null}
          </Group>
        ) : null,
      )}
    </>
  );
}

const Group = styled.View`
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const SectionTitle = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  font-weight: 600;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
  margin-left: ${({ theme }) => theme.spacing.xs}px;
`;

const NetworkRow = styled.View<{ $active: boolean }>`
  flex-direction: row;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  border-width: 1px;
  border-color: ${({ theme, $active }) =>
    $active ? theme.colors.primary : theme.colors.border};
  background-color: ${({ theme, $active }) =>
    $active ? theme.colors.primarySubtle : theme.colors.surface};
  padding-right: ${({ theme }) => theme.spacing.xs}px;
`;

const NetworkTouchable = styled.TouchableOpacity`
  flex: 1;
  flex-direction: row;
  align-items: center;
  min-height: 56px;
  padding: 10px ${({ theme }) => theme.spacing.md}px;
`;

const Dot = styled.View<{ $testnet: boolean }>`
  width: 10px;
  height: 10px;
  border-radius: 5px;
  margin-right: ${({ theme }) => theme.spacing.md}px;
  background-color: ${({ theme, $testnet }) =>
    $testnet ? theme.colors.warning : theme.colors.success};
`;

const NetworkInfo = styled.View`
  flex: 1;
`;

const NameRow = styled.View`
  flex-direction: row;
  align-items: center;
`;

const NetworkName = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 16px;
  font-weight: 600;
  flex-shrink: 1;
`;

const Badge = styled.Text`
  font-size: 11px;
  font-weight: 700;
  overflow: hidden;
  padding: 2px 6px;
  border-radius: 6px;
  margin-left: ${({ theme }) => theme.spacing.xs}px;
  color: ${({ theme }) => theme.colors.textPrimary};
  background-color: ${({ theme }) => theme.colors.warningSubtle};
`;

const NetworkMeta = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  margin-top: 2px;
`;

const Check = styled.Text`
  color: ${({ theme }) => theme.colors.primary};
  font-size: 20px;
  font-weight: 700;
`;

const Hint = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  line-height: 18px;
  margin: 0 ${({ theme }) => theme.spacing.xs}px;
`;

export default NetworkList;
