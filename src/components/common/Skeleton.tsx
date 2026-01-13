/**
 * Tori Wallet - Skeleton UI Component
 * 데이터 로딩 시 표시되는 스켈레톤 UI
 * Shimmer 애니메이션 효과 적용
 */

import React, { useEffect, useRef } from 'react';
import { Animated, DimensionValue, View, StyleSheet } from 'react-native';
import styled from 'styled-components/native';
import { palette } from '@/styles/theme';

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  alignSelf?: 'center' | 'flex-start' | 'flex-end';
  testID?: string;
}

/**
 * 기본 스켈레톤 컴포넌트 (Shimmer 효과)
 */
export function Skeleton({
  width = '100%',
  height = 20,
  borderRadius = 8,
  marginTop = 0,
  marginBottom = 0,
  marginLeft = 0,
  alignSelf,
  testID,
}: SkeletonProps) {
  const shimmerValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerValue, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerValue, {
          toValue: 0,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [shimmerValue]);

  // Shimmer 효과: opacity + 미세한 scale 변화
  const opacity = shimmerValue.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.4, 0.8, 0.4],
  });

  const scaleX = shimmerValue.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.02, 1],
  });

  return (
    <View
      testID={testID}
      style={[
        styles.container,
        {
          width,
          height,
          borderRadius,
          marginTop,
          marginBottom,
          marginLeft,
          alignSelf,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.shimmer,
          {
            opacity,
            transform: [{ scaleX }],
          },
        ]}
      />
      {/* Shimmer highlight overlay */}
      <Animated.View style={[styles.overlay, { opacity: shimmerValue }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: palette.gray[800],
  },
  shimmer: {
    flex: 1,
    backgroundColor: palette.gray[700],
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
});

/**
 * 원형 스켈레톤 (아바타, 아이콘 등)
 */
export function SkeletonCircle({ size = 40 }: { size?: number }) {
  return <Skeleton width={size} height={size} borderRadius={size / 2} />;
}

/**
 * 텍스트 라인 스켈레톤
 */
export function SkeletonText({
  width = '100%',
  lines = 1,
}: {
  width?: DimensionValue;
  lines?: number;
}) {
  return (
    <SkeletonTextContainer>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          width={index === lines - 1 && lines > 1 ? '70%' : width}
          height={14}
          marginBottom={index < lines - 1 ? 8 : 0}
        />
      ))}
    </SkeletonTextContainer>
  );
}

const SkeletonTextContainer = styled.View`
  flex-direction: column;
`;

/**
 * 홈 화면 잔액 스켈레톤
 */
export function BalanceSkeleton() {
  return (
    <BalanceSkeletonContainer>
      <Skeleton width={180} height={36} borderRadius={8} />
      <Skeleton width={100} height={18} borderRadius={6} marginTop={8} />
    </BalanceSkeletonContainer>
  );
}

const BalanceSkeletonContainer = styled.View`
  align-items: center;
  padding: ${({ theme }) => theme.spacing.md}px 0;
`;

/**
 * 토큰 아이템 스켈레톤
 */
export function TokenItemSkeleton() {
  return (
    <TokenSkeletonContainer>
      <SkeletonCircle size={44} />
      <TokenSkeletonInfo>
        <Skeleton width={80} height={16} borderRadius={6} />
        <Skeleton width={60} height={12} borderRadius={4} marginTop={6} />
      </TokenSkeletonInfo>
      <TokenSkeletonBalance>
        <Skeleton width={70} height={16} borderRadius={6} />
        <Skeleton width={50} height={12} borderRadius={4} marginTop={6} />
      </TokenSkeletonBalance>
    </TokenSkeletonContainer>
  );
}

const TokenSkeletonContainer = styled.View`
  flex-direction: row;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.md}px;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.lg}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const TokenSkeletonInfo = styled.View`
  flex: 1;
  margin-left: ${({ theme }) => theme.spacing.md}px;
`;

const TokenSkeletonBalance = styled.View`
  align-items: flex-end;
`;

/**
 * 액션 버튼 스켈레톤
 */
export function ActionButtonsSkeleton() {
  return (
    <ActionSkeletonContainer>
      {[1, 2, 3, 4, 5].map(i => (
        <ActionSkeletonItem key={i}>
          <SkeletonCircle size={48} />
          <Skeleton width={40} height={12} borderRadius={4} marginTop={8} />
        </ActionSkeletonItem>
      ))}
    </ActionSkeletonContainer>
  );
}

const ActionSkeletonContainer = styled.View`
  flex-direction: row;
  justify-content: space-around;
  padding: ${({ theme }) => theme.spacing.md}px 0;
`;

const ActionSkeletonItem = styled.View`
  align-items: center;
`;

/**
 * 홈 화면 전체 스켈레톤
 */
export function HomeScreenSkeleton() {
  return (
    <HomeSkeletonContainer testID="home-skeleton">
      {/* Network Badge */}
      <NetworkSkeletonBadge>
        <SkeletonCircle size={8} />
        <Skeleton width={80} height={14} borderRadius={6} marginLeft={8} />
      </NetworkSkeletonBadge>

      {/* Wallet Card */}
      <WalletCardSkeleton>
        {/* Address */}
        <Skeleton width={140} height={16} borderRadius={6} alignSelf="center" />

        {/* Balance */}
        <BalanceSkeleton />

        {/* Action Buttons */}
        <ActionButtonsSkeleton />
      </WalletCardSkeleton>

      {/* Section Header */}
      <Skeleton
        width={60}
        height={18}
        borderRadius={6}
        marginTop={24}
        marginBottom={16}
      />

      {/* Token Items */}
      <TokenItemSkeleton />
      <TokenItemSkeleton />
    </HomeSkeletonContainer>
  );
}

const HomeSkeletonContainer = styled.View`
  padding: ${({ theme }) => theme.spacing.lg}px;
`;

const NetworkSkeletonBadge = styled.View`
  flex-direction: row;
  align-items: center;
  align-self: center;
  padding: ${({ theme }) => theme.spacing.sm}px
    ${({ theme }) => theme.spacing.md}px;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.full}px;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const WalletCardSkeleton = styled.View`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.xl}px;
  padding: ${({ theme }) => theme.spacing.lg}px;
`;

/**
 * 포트폴리오 화면 스켈레톤
 */
export function PortfolioScreenSkeleton() {
  return (
    <PortfolioSkeletonContainer>
      {/* Total Value Card */}
      <TotalValueCardSkeleton>
        <Skeleton width={80} height={14} borderRadius={6} alignSelf="center" />
        <Skeleton
          width={160}
          height={36}
          borderRadius={8}
          marginTop={12}
          alignSelf="center"
        />
      </TotalValueCardSkeleton>

      {/* Token Items */}
      <TokenItemSkeleton />
      <TokenItemSkeleton />
      <TokenItemSkeleton />
      <TokenItemSkeleton />
    </PortfolioSkeletonContainer>
  );
}

const PortfolioSkeletonContainer = styled.View`
  flex: 1;
`;

const TotalValueCardSkeleton = styled.View`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.lg}px;
  padding: ${({ theme }) => theme.spacing.lg}px;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

/**
 * 활동 화면 트랜잭션 아이템 스켈레톤
 */
export function TransactionItemSkeleton() {
  return (
    <TransactionSkeletonContainer>
      <SkeletonCircle size={44} />
      <TransactionSkeletonInfo>
        <TransactionSkeletonRow>
          <Skeleton width={50} height={16} borderRadius={6} />
          <Skeleton width={100} height={16} borderRadius={6} />
        </TransactionSkeletonRow>
        <TransactionSkeletonRow>
          <Skeleton width={90} height={12} borderRadius={4} marginTop={6} />
          <Skeleton width={60} height={12} borderRadius={4} marginTop={6} />
        </TransactionSkeletonRow>
      </TransactionSkeletonInfo>
    </TransactionSkeletonContainer>
  );
}

const TransactionSkeletonContainer = styled.View`
  flex-direction: row;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.md}px;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.lg}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const TransactionSkeletonInfo = styled.View`
  flex: 1;
  margin-left: ${({ theme }) => theme.spacing.md}px;
`;

const TransactionSkeletonRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
`;

/**
 * 활동 화면 스켈레톤
 */
export function ActivityScreenSkeleton() {
  return (
    <ActivitySkeletonContainer>
      <TransactionItemSkeleton />
      <TransactionItemSkeleton />
      <TransactionItemSkeleton />
      <TransactionItemSkeleton />
      <TransactionItemSkeleton />
    </ActivitySkeletonContainer>
  );
}

const ActivitySkeletonContainer = styled.View`
  flex: 1;
`;
