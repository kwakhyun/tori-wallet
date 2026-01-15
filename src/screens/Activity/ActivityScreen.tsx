/**
 * Tori Wallet - Activity Screen
 * 트랜잭션 내역 조회 (Realm 캐시 기반)
 *
 * 개선사항:
 * - Realm 캐시에서 먼저 로드 (빠른 초기 로딩)
 * - 백그라운드에서 API 동기화
 * - 오프라인에서도 캐시된 데이터 표시
 */

import React, { useCallback, useEffect, useState } from 'react';
import styled, { useTheme } from 'styled-components/native';
import {
  SafeAreaView,
  StatusBar,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useWalletStore } from '@/store/walletStore';
import {
  transactionHistoryService,
  Transaction,
} from '@/services/transactionHistory';
import { useTransactions } from '@/realm/hooks';
import { transactionCacheService } from '@/realm/services';
import { ActivityScreenSkeleton } from '@/components/common/Skeleton';

function ActivityScreen(): React.JSX.Element {
  const theme = useTheme();
  const { wallets, activeWalletIndex, activeNetworkChainId, networks } =
    useWalletStore();

  const activeWallet = wallets[activeWalletIndex];
  const activeNetwork = networks.find(n => n.chainId === activeNetworkChainId);

  const [forceRefresh, setForceRefresh] = useState(false);
  const [hasSynced, setHasSynced] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Realm 캐시에서 트랜잭션 로드 (빠른 초기 로딩)
  const {
    transactions: cachedTransactions,
    isLoading: isCacheLoading,
    refetch: refetchCache,
  } = useTransactions(activeWallet?.address, {
    chainId: activeNetworkChainId,
    limit: 20,
  });

  // API에서 최신 트랜잭션 가져오기 (백그라운드 동기화)
  const {
    data: apiTransactions,
    isLoading: isApiLoading,
    isRefetching,
    refetch: refetchApi,
  } = useQuery({
    queryKey: ['transactions', activeWallet?.address, activeNetworkChainId],
    queryFn: () =>
      transactionHistoryService.getTransactions(
        activeWallet?.address || '',
        activeNetworkChainId,
        1,
        20,
        forceRefresh,
      ),
    enabled: !!activeWallet?.address,
    staleTime: 30000,
  });

  // API 결과를 Realm 캐시에 동기화
  useEffect(() => {
    const syncToCache = async () => {
      if (apiTransactions && apiTransactions.length > 0 && !hasSynced) {
        try {
          const transactionsToSync = apiTransactions.map(tx => ({
            hash: tx.hash,
            chainId: activeNetworkChainId,
            from: tx.from,
            to: tx.to,
            value: tx.value,
            valueWei: tx.valueWei,
            gasPrice: tx.gasPrice,
            gasUsed: tx.gasUsed,
            fee: tx.fee,
            timestamp: Math.floor(tx.timestamp / 1000), // seconds
            blockNumber: tx.blockNumber,
            status: tx.status as
              | 'pending'
              | 'confirmed'
              | 'failed'
              | 'cancelled',
            type: tx.type as
              | 'send'
              | 'receive'
              | 'swap'
              | 'approve'
              | 'contract',
            isLocal: false, // API에서 가져온 트랜잭션
          }));

          await transactionCacheService.syncTransactions(transactionsToSync);
          setHasSynced(true);
          // 캐시 새로고침
          refetchCache();
        } catch (error) {
          console.warn('Failed to sync transactions to cache:', error);
        }
      }
    };

    syncToCache();
  }, [apiTransactions, activeNetworkChainId, hasSynced, refetchCache]);

  // 네트워크 변경 시 동기화 플래그 및 로딩 상태 리셋
  useEffect(() => {
    setHasSynced(false);
    setIsInitialLoading(true);
  }, [activeNetworkChainId, activeWallet?.address]);

  // 표시할 트랜잭션 결정 (API 데이터 우선, 없으면 캐시)
  const transactions: Transaction[] = React.useMemo(() => {
    if (apiTransactions && apiTransactions.length > 0) {
      return apiTransactions;
    }
    // 캐시된 데이터를 Transaction 형식으로 변환
    return cachedTransactions.map(tx => ({
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: tx.value,
      valueWei: tx.valueWei,
      gasUsed: tx.gasUsed || '',
      gasPrice: tx.gasPrice,
      fee: tx.fee || '',
      timestamp: tx.timestamp * 1000, // milliseconds
      blockNumber: tx.blockNumber || '',
      isError: tx.status === 'failed',
      type: tx.type as 'send' | 'receive',
      status: tx.status as 'success' | 'failed' | 'pending',
    }));
  }, [apiTransactions, cachedTransactions]);

  // 초기 로딩 완료 체크 (API 첫 응답이 오면 초기 로딩 완료)
  useEffect(() => {
    if (!isApiLoading && isInitialLoading) {
      // API 응답이 왔으면 초기 로딩 완료
      setIsInitialLoading(false);
    }
  }, [isApiLoading, isInitialLoading]);

  // 로딩 상태: 초기 로딩 중이고 데이터가 없을 때만 스켈레톤 표시
  const isLoading = isInitialLoading && transactions.length === 0;

  const handleRefresh = useCallback(async () => {
    setForceRefresh(true);
    setHasSynced(false);
    transactionHistoryService.clearCache();
    await refetchApi();
    setForceRefresh(false);
  }, [refetchApi]);

  const formatAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatDate = (timestamp: number) => {
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

    return date.toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric',
    });
  };

  const openExplorer = useCallback(
    (txHash: string) => {
      const explorerUrl = activeNetwork?.blockExplorerUrl;
      if (explorerUrl) {
        Linking.openURL(`${explorerUrl}/tx/${txHash}`);
      }
    },
    [activeNetwork],
  );

  const renderTransaction = ({ item }: { item: Transaction }) => {
    const isSend = item.type === 'send';
    const icon = isSend ? '↑' : '↓';
    const iconColor = isSend ? theme.colors.error : theme.colors.success;
    const label = isSend ? '보냄' : '받음';
    const address = isSend ? item.to : item.from;

    return (
      <TransactionItem onPress={() => openExplorer(item.hash)}>
        <IconContainer $color={iconColor}>
          <IconText>{icon}</IconText>
        </IconContainer>

        <TransactionInfo>
          <TransactionRow>
            <TransactionLabel $failed={item.status === 'failed'}>
              {label}
              {item.status === 'failed' && ' (실패)'}
            </TransactionLabel>
            <TransactionAmount $isSend={isSend}>
              {isSend ? '-' : '+'}
              {parseFloat(item.value).toFixed(4)} {activeNetwork?.symbol}
            </TransactionAmount>
          </TransactionRow>

          <TransactionRow>
            <TransactionAddress>
              {isSend ? '→ ' : '← '}
              {formatAddress(address)}
            </TransactionAddress>
            <TransactionTime>{formatDate(item.timestamp)}</TransactionTime>
          </TransactionRow>

          {isSend &&
            item.fee &&
            item.fee !== '0' &&
            !isNaN(parseFloat(item.fee)) && (
              <TransactionFee>
                수수료:{' '}
                {item.fee.startsWith('<')
                  ? item.fee
                  : parseFloat(item.fee).toFixed(6)}{' '}
                {activeNetwork?.symbol}
              </TransactionFee>
            )}
        </TransactionInfo>

        <ChevronText>›</ChevronText>
      </TransactionItem>
    );
  };

  const renderEmpty = () => (
    <EmptyState>
      <EmptyIcon>📋</EmptyIcon>
      <EmptyText>거래 내역이 없습니다</EmptyText>
      <EmptySubText>
        {activeNetwork?.name}에서 토큰을 보내거나 받으면{'\n'}
        여기에 표시됩니다.
      </EmptySubText>
    </EmptyState>
  );

  if (!activeWallet) {
    return (
      <Container>
        <StatusBar barStyle="light-content" />
        <Content>
          <Title>활동</Title>
          <EmptyState>
            <EmptyText>지갑이 없습니다</EmptyText>
          </EmptyState>
        </Content>
      </Container>
    );
  }

  // FlatList 스타일
  const emptyContentStyle = { flex: 1 };

  return (
    <Container>
      <StatusBar barStyle="light-content" />
      <Content>
        <Header>
          <Title>활동</Title>
          <NetworkBadge>
            <NetworkDot $isTestnet={activeNetwork?.isTestnet} />
            <NetworkName>{activeNetwork?.name}</NetworkName>
          </NetworkBadge>
        </Header>

        {isLoading ? (
          <ActivityScreenSkeleton />
        ) : (
          <FlatList
            data={transactions}
            renderItem={renderTransaction}
            keyExtractor={item => item.hash}
            ListEmptyComponent={renderEmpty}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={handleRefresh}
                tintColor={theme.colors.primary}
              />
            }
            showsVerticalScrollIndicator={false}
            contentContainerStyle={
              !transactions?.length ? emptyContentStyle : undefined
            }
          />
        )}
      </Content>
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
`;

const Content = styled.View`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.lg}px;
`;

const Header = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const Title = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.h2.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.h2.fontWeight};
`;

const NetworkBadge = styled.View`
  flex-direction: row;
  align-items: center;
  background-color: ${({ theme }) => theme.colors.surface};
  padding: ${({ theme }) => theme.spacing.xs}px
    ${({ theme }) => theme.spacing.sm}px;
  border-radius: ${({ theme }) => theme.borderRadius.full}px;
`;

const NetworkDot = styled.View<{ $isTestnet?: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 4px;
  background-color: ${({ theme, $isTestnet }) =>
    $isTestnet ? theme.colors.warning : theme.colors.success};
  margin-right: ${({ theme }) => theme.spacing.xs}px;
`;

const NetworkName = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
`;

const TransactionItem = styled(TouchableOpacity)`
  flex-direction: row;
  align-items: center;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const IconContainer = styled.View<{ $color: string }>`
  width: 40px;
  height: 40px;
  border-radius: 20px;
  background-color: ${({ $color }) => $color}20;
  align-items: center;
  justify-content: center;
  margin-right: ${({ theme }) => theme.spacing.md}px;
`;

const IconText = styled.Text`
  font-size: 18px;
  font-weight: bold;
`;

const TransactionInfo = styled.View`
  flex: 1;
`;

const TransactionRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
`;

const TransactionLabel = styled.Text<{ $failed?: boolean }>`
  color: ${({ theme, $failed }) =>
    $failed ? theme.colors.error : theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  font-weight: 600;
`;

const TransactionAmount = styled.Text<{ $isSend: boolean }>`
  color: ${({ theme, $isSend }) =>
    $isSend ? theme.colors.error : theme.colors.success};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  font-weight: 600;
`;

const TransactionAddress = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
`;

const TransactionTime = styled.Text`
  color: ${({ theme }) => theme.colors.textTertiary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
`;

const TransactionFee = styled.Text`
  color: ${({ theme }) => theme.colors.textTertiary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
`;

const ChevronText = styled.Text`
  color: ${({ theme }) => theme.colors.textTertiary};
  font-size: 20px;
  margin-left: ${({ theme }) => theme.spacing.sm}px;
`;

const EmptyState = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
`;

const EmptyIcon = styled.Text`
  font-size: 48px;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const EmptyText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  text-align: center;
  font-weight: 600;
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
`;

const EmptySubText = styled.Text`
  color: ${({ theme }) => theme.colors.textTertiary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  text-align: center;
  line-height: 20px;
`;

export default ActivityScreen;
