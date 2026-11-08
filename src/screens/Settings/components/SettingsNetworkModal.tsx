/**
 * 설정 화면 네트워크 선택/관리 모달
 *
 * - 목록과 전환 동작은 홈의 네트워크 선택 모달과 같은 NetworkList/useNetworkSwitch를 쓴다
 *   (메인넷/테스트넷/커스텀 구분, 커스텀 배지와 체인 ID, 테스트넷 → 메인넷 경고 확인)
 * - "네트워크 추가"로 커스텀 네트워크 등록, 커스텀 네트워크는 삭제 가능
 */

import React, { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/common/Button';
import { AddNetworkModal } from '@/components/network/AddNetworkModal';
import {
  CUSTOM_NETWORK_HINT,
  NetworkList,
  useNetworkSwitch,
} from '@/components/network/NetworkList';
import { useWalletStore, type Network } from '@/store/walletStore';
import { showToast } from '@/store/toastStore';
import { HintText, SheetModal } from './SettingsUI';

interface SettingsNetworkModalProps {
  visible: boolean;
  onClose: () => void;
}

export function SettingsNetworkModal({
  visible,
  onClose,
}: SettingsNetworkModalProps): React.JSX.Element {
  const { removeNetwork } = useWalletStore(
    useShallow(state => ({ removeNetwork: state.removeNetwork })),
  );
  const {
    networks,
    activeChainId: activeNetworkChainId,
    selectNetwork,
  } = useNetworkSwitch({ onClose });
  const [showAdd, setShowAdd] = useState(false);

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

  return (
    <SheetModal
      visible={visible}
      title="네트워크"
      onClose={onClose}
      testID="settings-network-modal"
    >
      <NetworkList
        networks={networks}
        activeChainId={activeNetworkChainId}
        onSelect={selectNetwork}
        onRemove={handleRemove}
        itemTestIDPrefix="network-option-"
        removeTestIDPrefix="network-remove-"
        showCustomHint={false}
        testID="settings-network-list"
      />
      <Button
        title="+ 네트워크 추가"
        variant="outline"
        onPress={() => setShowAdd(true)}
        fullWidth
        testID="network-add-button"
      />
      <HintText>{CUSTOM_NETWORK_HINT}</HintText>
      <AddNetworkModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onAdded={handleAdded}
      />
    </SheetModal>
  );
}
