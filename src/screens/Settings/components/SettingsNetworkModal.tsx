/**
 * 설정 화면 네트워크 선택/관리 모달
 *
 * - 메인넷/테스트넷/커스텀 네트워크 구분 표시
 * - 테스트넷 → 메인넷 전환 시 실제 자산 경고 확인
 * - "네트워크 추가"로 커스텀 네트워크 등록, 커스텀 네트워크는 삭제 가능
 */

import React, { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import styled from 'styled-components/native';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/common/Button';
import { IconButton } from '@/components/common/IconButton';
import { AddNetworkModal } from '@/components/network/AddNetworkModal';
import { useWalletStore, type Network } from '@/store/walletStore';
import { showToast } from '@/store/toastStore';
import { Badge, HintText, SectionTitle, SheetModal } from './SettingsUI';

interface SettingsNetworkModalProps {
  visible: boolean;
  onClose: () => void;
}

export function SettingsNetworkModal({
  visible,
  onClose,
}: SettingsNetworkModalProps): React.JSX.Element {
  const { networks, activeNetworkChainId, setActiveNetwork, removeNetwork } =
    useWalletStore(
      useShallow(state => ({
        networks: state.networks,
        activeNetworkChainId: state.activeNetworkChainId,
        setActiveNetwork: state.setActiveNetwork,
        removeNetwork: state.removeNetwork,
      })),
    );
  const [showAdd, setShowAdd] = useState(false);
  const activeNetwork = networks.find(n => n.chainId === activeNetworkChainId);

  const select = useCallback(
    (network: Network) => {
      setActiveNetwork(network.chainId);
      onClose();
      showToast(`${network.name}(으)로 전환했습니다.`, 'success');
    },
    [onClose, setActiveNetwork],
  );

  const handleSelect = useCallback(
    (network: Network) => {
      if (network.chainId === activeNetworkChainId) {
        onClose();
        return;
      }
      // 테스트넷에서 실제 자산 네트워크로 옮길 때는 확인을 받는다.
      if (activeNetwork?.isTestnet && !network.isTestnet) {
        Alert.alert(
          '메인넷으로 전환',
          `${network.name}은(는) 실제 자산이 사용되는 네트워크입니다.\n\n거래 시 실제 암호화폐가 소모되며, 잘못된 전송은 되돌릴 수 없습니다.\n\n계속하시겠습니까?`,
          [
            { text: '취소', style: 'cancel' },
            { text: '전환', onPress: () => select(network) },
          ],
        );
        return;
      }
      select(network);
    },
    [activeNetwork?.isTestnet, activeNetworkChainId, onClose, select],
  );

  const handleRemove = useCallback(
    (network: Network) => {
      Alert.alert(
        '네트워크 삭제',
        `${network.name} 네트워크를 목록에서 삭제할까요?${
          network.chainId === activeNetworkChainId
            ? '\n\n현재 사용 중인 네트워크라 기본 테스트넷(Sepolia)으로 전환됩니다.'
            : ''
        }`,
        [
          { text: '취소', style: 'cancel' },
          {
            text: '삭제',
            style: 'destructive',
            onPress: () => {
              try {
                removeNetwork(network.chainId);
                showToast('네트워크를 삭제했습니다.', 'success');
              } catch (error) {
                Alert.alert(
                  '삭제할 수 없음',
                  error instanceof Error ? error.message : String(error),
                );
              }
            },
          },
        ],
      );
    },
    [activeNetworkChainId, removeNetwork],
  );

  const handleAdded = useCallback(() => setShowAdd(false), []);

  const groups: { title: string; items: Network[] }[] = [
    {
      title: '메인넷 (실제 자산)',
      items: networks.filter(n => !n.isCustom && !n.isTestnet),
    },
    {
      title: '테스트넷 (무료 테스트)',
      items: networks.filter(n => !n.isCustom && n.isTestnet),
    },
    { title: '내가 추가한 네트워크', items: networks.filter(n => n.isCustom) },
  ];

  return (
    <SheetModal
      visible={visible}
      title="네트워크"
      onClose={onClose}
      testID="settings-network-modal"
    >
      {groups.map(group =>
        group.items.length > 0 ? (
          <Group key={group.title}>
            <SectionTitle>{group.title}</SectionTitle>
            {group.items.map(network => {
              const active = network.chainId === activeNetworkChainId;
              return (
                <NetworkRow key={network.chainId} $active={active}>
                  <NetworkTouchable
                    onPress={() => handleSelect(network)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active, checked: active }}
                    accessibilityLabel={`${network.name}, ${network.symbol}${
                      network.isTestnet ? ', 테스트넷' : ', 메인넷'
                    }${network.isCustom ? ', 직접 추가함' : ''}`}
                    testID={`network-option-${network.chainId}`}
                  >
                    <Dot $testnet={!!network.isTestnet} />
                    <NetworkInfo>
                      <NameRow>
                        <NetworkName numberOfLines={1}>
                          {network.name}
                        </NetworkName>
                        {network.isCustom ? <Badge>커스텀</Badge> : null}
                      </NameRow>
                      <NetworkMeta>
                        {network.symbol} · 체인 ID {network.chainId}
                      </NetworkMeta>
                    </NetworkInfo>
                    {active ? (
                      <Check importantForAccessibility="no">✓</Check>
                    ) : null}
                  </NetworkTouchable>
                  {network.isCustom ? (
                    <IconButton
                      icon="🗑️"
                      accessibilityLabel={`${network.name} 네트워크 삭제`}
                      onPress={() => handleRemove(network)}
                      testID={`network-remove-${network.chainId}`}
                    />
                  ) : null}
                </NetworkRow>
              );
            })}
          </Group>
        ) : null,
      )}
      <Button
        title="+ 네트워크 추가"
        variant="outline"
        onPress={() => setShowAdd(true)}
        fullWidth
        testID="network-add-button"
      />
      <HintText>
        직접 추가한 네트워크에서는 잔액 조회와 기본 통화 송금만 지원합니다.
      </HintText>
      <AddNetworkModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onAdded={handleAdded}
      />
    </SheetModal>
  );
}

const Group = styled.View`
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
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
  margin-right: ${({ theme }) => theme.spacing.sm}px;
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
  flex-shrink: 1;
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
