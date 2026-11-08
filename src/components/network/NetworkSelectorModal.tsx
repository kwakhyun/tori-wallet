/**
 * 네트워크 선택 모달 (홈)
 *
 * 설정의 네트워크 시트와 같은 NetworkList를 쓴다: 기본 메인넷 / 기본 테스트넷 /
 * 내가 추가한 네트워크로 나누고, 직접 추가한 네트워크에는 '커스텀' 배지와 체인 ID를 붙인다.
 * 테스트넷에서 메인넷으로 전환할 때는 실제 자산이 사용된다는 확인을 받는다.
 */

import React from 'react';
import { ScrollView } from 'react-native';
import styled from 'styled-components/native';
import { AppModal } from '@/components/common/AppModal';
import { Screen } from '@/components/common/Screen';
import { IconButton } from '@/components/common/IconButton';
import { NetworkList, useNetworkSwitch } from './NetworkList';

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
  const { networks, activeChainId, selectNetwork } = useNetworkSwitch({
    onClose,
    onSwitched: onSelected,
  });

  return (
    <AppModal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onLock={onClose}
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
            <NetworkList
              networks={networks}
              activeChainId={activeChainId}
              onSelect={selectNetwork}
              itemTestIDPrefix={`${testID}-item-`}
              testID={testID}
            />
          </Content>
        </ScrollView>
      </Screen>
    </AppModal>
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
  padding: ${({ theme }) => theme.spacing.lg}px;
`;

export default NetworkSelectorModal;
