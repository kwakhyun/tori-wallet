/**
 * 스왑 내역 화면
 */

import React, { useCallback, useMemo } from 'react';
import { Alert, FlatList, StyleSheet } from 'react-native';
import styled, { useTheme } from 'styled-components/native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useShallow } from 'zustand/react/shallow';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { useSwapStore, SwapHistoryItem } from '@/store/swapStore';
import { useWalletStore } from '@/store/walletStore';
import { showToast } from '@/store/toastStore';
import { Screen } from '@/components/common/Screen';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { NetworkBadge } from '@/components/send/NetworkBadge';
import { formatDisplayAmount } from '@/utils/format';

// 스타일 정의
const styles = StyleSheet.create({
  listContentEmpty: {
    flex: 1,
  },
  listContent: {
    padding: 16,
  },
});

// ItemSeparatorComponent를 컴포넌트 외부로 이동
const ItemSeparator = () => <Separator />;

function SwapHistoryScreen(): React.JSX.Element {
  const theme = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { history, clearHistoryForChain } = useSwapStore(
    useShallow(state => ({
      history: state.history,
      clearHistoryForChain: state.clearHistoryForChain,
    })),
  );
  const { activeNetworkChainId, networks } = useWalletStore(
    useShallow(state => ({
      activeNetworkChainId: state.activeNetworkChainId,
      networks: state.networks,
    })),
  );

  const filteredHistory = useMemo(() => {
    return history.filter(item => item.chainId === activeNetworkChainId);
  }, [history, activeNetworkChainId]);

  const activeNetwork = networks.find(n => n.chainId === activeNetworkChainId);
  const networkName = activeNetwork?.name || '현재 네트워크';

  // 현재 네트워크의 내역만, 확인 후 삭제한다. 다른 네트워크 내역은 유지된다.
  const handleClear = useCallback(() => {
    Alert.alert(
      '스왑 내역 삭제',
      `${networkName}의 스왑 내역 ${filteredHistory.length}건을 이 기기에서 삭제할까요?\n다른 네트워크의 내역과 블록체인 기록은 그대로 남습니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            clearHistoryForChain(activeNetworkChainId);
            showToast(`${networkName} 스왑 내역을 삭제했습니다.`, 'success');
          },
        },
      ],
    );
  }, [
    networkName,
    filteredHistory.length,
    clearHistoryForChain,
    activeNetworkChainId,
  ]);

  const formatDate = useCallback((timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '방금 전';
    if (diffMins < 60) return `${diffMins}분 전`;
    if (diffHours < 24) return `${diffHours}시간 전`;
    if (diffDays < 7) return `${diffDays}일 전`;
    return date.toLocaleDateString('ko-KR');
  }, []);

  const getStatusColor = (status: SwapHistoryItem['status']): string => {
    switch (status) {
      case 'success':
        return theme.colors.success;
      case 'failed':
        return theme.colors.error;
      case 'pending':
        return theme.colors.warning;
      default:
        return theme.colors.textMuted;
    }
  };

  const getStatusText = (status: SwapHistoryItem['status']): string => {
    switch (status) {
      case 'success':
        return '완료';
      case 'failed':
        return '실패';
      case 'pending':
        return '진행 중';
      default:
        return '-';
    }
  };

  const renderItem = ({ item }: { item: SwapHistoryItem }) => (
    <HistoryItem
      onPress={() =>
        navigation.navigate('TransactionDetail', {
          txHash: item.txHash,
          chainId: item.chainId,
        })
      }
      accessibilityRole="button"
      accessibilityLabel={`${item.sellToken.symbol}에서 ${
        item.buyToken.symbol
      } 스왑, ${getStatusText(item.status)}, ${formatDate(
        item.timestamp,
      )}. 거래 상세 보기`}
      testID={`swap-history-item-${item.id}`}
    >
      <HistoryIconContainer>
        <HistoryIcon importantForAccessibility="no">🔄</HistoryIcon>
      </HistoryIconContainer>

      <HistoryContent>
        <HistoryMain>
          <TokenPair>
            {item.sellToken.symbol} → {item.buyToken.symbol}
          </TokenPair>
          <HistoryTime>{formatDate(item.timestamp)}</HistoryTime>
        </HistoryMain>

        <HistoryDetails>
          <AmountRow>
            <AmountLabel>보낸 금액</AmountLabel>
            <AmountValue>
              {formatDisplayAmount(item.sellToken.amount)}{' '}
              {item.sellToken.symbol}
            </AmountValue>
          </AmountRow>
          <AmountRow>
            <AmountLabel>받은 금액</AmountLabel>
            <AmountValue $highlight>
              {formatDisplayAmount(item.buyToken.amount)} {item.buyToken.symbol}
            </AmountValue>
          </AmountRow>
        </HistoryDetails>

        <HistoryFooter>
          <StatusBadge $status={item.status}>
            <StatusDot
              style={{ backgroundColor: getStatusColor(item.status) }}
            />
            <StatusText>{getStatusText(item.status)}</StatusText>
          </StatusBadge>
          <RateText>
            1 {item.sellToken.symbol} = {item.rate} {item.buyToken.symbol}
          </RateText>
        </HistoryFooter>
      </HistoryContent>
    </HistoryItem>
  );

  const renderEmpty = () => (
    <EmptyContainer testID="swap-history-empty">
      <EmptyIcon importantForAccessibility="no">📊</EmptyIcon>
      <EmptyTitle>스왑 내역이 없습니다</EmptyTitle>
      <EmptyText>
        {activeNetwork?.name || '현재 네트워크'}에서{'\n'}
        스왑을 진행하면 여기에 표시됩니다.
      </EmptyText>
    </EmptyContainer>
  );

  return (
    <Screen testID="swap-history-screen">
      <ScreenHeader
        title="스왑 내역"
        backTestID="swap-history-back"
        right={
          filteredHistory.length > 0 ? (
            <ClearButton
              onPress={handleClear}
              accessibilityRole="button"
              accessibilityLabel={`${networkName} 스왑 내역 삭제`}
              testID="swap-history-clear"
            >
              <ClearButtonText>삭제</ClearButtonText>
            </ClearButton>
          ) : undefined
        }
      />

      <BadgeWrapper>
        <NetworkBadge
          name={activeNetwork?.name}
          isTestnet={activeNetwork?.isTestnet}
          testID="swap-history-network"
        />
      </BadgeWrapper>

      <FlatList
        data={filteredHistory}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={
          filteredHistory.length === 0
            ? styles.listContentEmpty
            : styles.listContent
        }
        ItemSeparatorComponent={ItemSeparator}
      />
    </Screen>
  );
}

// Styled Components
const ClearButton = styled.TouchableOpacity`
  min-height: 44px;
  justify-content: center;
  padding: 0 ${({ theme }) => theme.spacing.sm}px;
`;

const ClearButtonText = styled.Text`
  font-size: 15px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.error};
`;

const BadgeWrapper = styled.View`
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const HistoryItem = styled.TouchableOpacity`
  flex-direction: row;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.lg}px;
  padding: ${({ theme }) => theme.spacing.md}px;
`;

const HistoryIconContainer = styled.View`
  width: 48px;
  height: 48px;
  border-radius: 24px;
  background-color: ${({ theme }) => theme.colors.backgroundSecondary};
  align-items: center;
  justify-content: center;
  margin-right: ${({ theme }) => theme.spacing.md}px;
`;

const HistoryIcon = styled.Text`
  font-size: 24px;
`;

const HistoryContent = styled.View`
  flex: 1;
`;

const HistoryMain = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const TokenPair = styled.Text`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const HistoryTime = styled.Text`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const HistoryDetails = styled.View`
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const AmountRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  margin-bottom: 2px;
`;

const AmountLabel = styled.Text`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const AmountValue = styled.Text<{ $highlight?: boolean }>`
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme, $highlight }) =>
    $highlight ? theme.colors.success : theme.colors.textPrimary};
`;

const HistoryFooter = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
`;

const StatusBadge = styled.View<{ $status: SwapHistoryItem['status'] }>`
  flex-direction: row;
  align-items: center;
`;

const StatusDot = styled.View`
  width: 6px;
  height: 6px;
  border-radius: 3px;
  margin-right: 4px;
`;

const StatusText = styled.Text`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const RateText = styled.Text`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const Separator = styled.View`
  height: ${({ theme }) => theme.spacing.sm}px;
`;

const EmptyContainer = styled.View`
  flex: 1;
  justify-content: center;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.xl}px;
`;

const EmptyIcon = styled.Text`
  font-size: 64px;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const EmptyTitle = styled.Text`
  font-size: 18px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const EmptyText = styled.Text`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
  line-height: 20px;
`;

export default SwapHistoryScreen;
