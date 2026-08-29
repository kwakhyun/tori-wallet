/**
 * 스왑 내역 화면
 */

import React, { useCallback, useMemo } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import styled, { useTheme } from 'styled-components/native';
import { useNavigation } from '@react-navigation/native';
import { useShallow } from 'zustand/react/shallow';
import { useSwapStore, SwapHistoryItem } from '@/store/swapStore';
import { useWalletStore } from '@/store/walletStore';

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
  const navigation = useNavigation();
  const { history, clearHistory } = useSwapStore(
    useShallow(state => ({
      history: state.history,
      clearHistory: state.clearHistory,
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
    <HistoryItem>
      <HistoryIconContainer>
        <HistoryIcon>🔄</HistoryIcon>
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
              {parseFloat(item.sellToken.amount).toFixed(4)}{' '}
              {item.sellToken.symbol}
            </AmountValue>
          </AmountRow>
          <AmountRow>
            <AmountLabel>받은 금액</AmountLabel>
            <AmountValue $highlight>
              {parseFloat(item.buyToken.amount).toFixed(4)}{' '}
              {item.buyToken.symbol}
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
    <EmptyContainer>
      <EmptyIcon>📊</EmptyIcon>
      <EmptyTitle>스왑 내역이 없습니다</EmptyTitle>
      <EmptyText>
        {activeNetwork?.name || '현재 네트워크'}에서{'\n'}
        스왑을 진행하면 여기에 표시됩니다.
      </EmptyText>
    </EmptyContainer>
  );

  return (
    <Container>
      <Header>
        <BackButton onPress={() => navigation.goBack()}>
          <BackIcon>←</BackIcon>
        </BackButton>
        <HeaderTitle>스왑 내역</HeaderTitle>
        {filteredHistory.length > 0 && (
          <ClearButton onPress={clearHistory}>
            <ClearButtonText>삭제</ClearButtonText>
          </ClearButton>
        )}
        {filteredHistory.length === 0 && <HeaderSpacer />}
      </Header>

      <NetworkBadge>
        <NetworkDot />
        <NetworkText>{activeNetwork?.name || 'Unknown'}</NetworkText>
      </NetworkBadge>

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
    </Container>
  );
}

// Styled Components
const Container = styled.SafeAreaView`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
`;

const Header = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.md}px;
`;

const BackButton = styled.TouchableOpacity`
  width: 40px;
  height: 40px;
  align-items: center;
  justify-content: center;
`;

const BackIcon = styled.Text`
  font-size: 24px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const HeaderTitle = styled.Text`
  font-size: 18px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const ClearButton = styled.TouchableOpacity`
  padding: ${({ theme }) => theme.spacing.sm}px;
`;

const ClearButtonText = styled.Text`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.error};
`;

const HeaderSpacer = styled.View`
  width: 40px;
`;

const NetworkBadge = styled.View`
  flex-direction: row;
  align-items: center;
  align-self: center;
  background-color: ${({ theme }) => theme.colors.surface};
  padding: ${({ theme }) => theme.spacing.xs}px
    ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.full}px;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const NetworkDot = styled.View`
  width: 8px;
  height: 8px;
  border-radius: 4px;
  background-color: ${({ theme }) => theme.colors.primary};
  margin-right: ${({ theme }) => theme.spacing.xs}px;
`;

const NetworkText = styled.Text`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const HistoryItem = styled.View`
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
