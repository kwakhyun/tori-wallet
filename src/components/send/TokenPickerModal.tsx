/**
 * 토큰 선택 모달 (검색, 잔액, 최근 사용 토큰)
 *
 * 전송/스왑 화면이 함께 사용한다. 잔액을 모르면 '—'로 표시하고 0으로 꾸미지 않는다.
 */

import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal } from 'react-native';
import styled, { useTheme } from 'styled-components/native';
import { Screen } from '@/components/common/Screen';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { ErrorState, EmptyState } from '@/components/common/StateViews';

export interface PickerToken {
  /** 고유 키 (토큰 주소, 네이티브는 'native' 등) */
  id: string;
  symbol: string;
  name?: string;
  /** 검색/표시용 계약 주소 */
  address?: string;
  /** 표시용 잔액 문자열. null이면 '—', undefined면 표시 안 함 */
  balance?: string | null;
  /** 표시용 법정화폐 가치 */
  fiatValue?: string;
  logoUrl?: string;
}

interface Props {
  visible: boolean;
  title?: string;
  tokens: PickerToken[];
  selectedId?: string | null;
  /** 최근 사용 토큰 id (최신 순) */
  recentIds?: string[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onSelect: (token: PickerToken) => void;
  onClose: () => void;
  testID?: string;
}

export function filterPickerTokens(
  tokens: PickerToken[],
  query: string,
): PickerToken[] {
  const q = query.trim().toLowerCase();
  if (!q) return tokens;
  return tokens.filter(
    token =>
      token.symbol.toLowerCase().includes(q) ||
      (token.name ?? '').toLowerCase().includes(q) ||
      (token.address ?? '').toLowerCase() === q,
  );
}

export function TokenPickerModal({
  visible,
  title = '토큰 선택',
  tokens,
  selectedId,
  recentIds = [],
  isLoading = false,
  error,
  onRetry,
  onSelect,
  onClose,
  testID = 'token-picker',
}: Props): React.JSX.Element {
  const theme = useTheme();
  const [query, setQuery] = useState('');

  const filtered = useMemo(
    () => filterPickerTokens(tokens, query),
    [tokens, query],
  );
  const recent = useMemo(
    () =>
      query
        ? []
        : recentIds
            .map(id =>
              tokens.find(token => token.id.toLowerCase() === id.toLowerCase()),
            )
            .filter((token): token is PickerToken => !!token)
            .slice(0, 5),
    [recentIds, tokens, query],
  );

  const handleClose = () => {
    setQuery('');
    onClose();
  };

  const handleSelect = (token: PickerToken) => {
    setQuery('');
    onSelect(token);
  };

  const renderItem = ({ item }: { item: PickerToken }) => {
    const selected =
      !!selectedId && item.id.toLowerCase() === selectedId.toLowerCase();
    return (
      <TokenRow
        $selected={selected}
        onPress={() => handleSelect(item)}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`${item.symbol}${item.name ? ` ${item.name}` : ''}${
          item.balance !== undefined
            ? `, 잔액 ${item.balance ?? '알 수 없음'}`
            : ''
        }`}
        testID={`${testID}-item-${item.symbol}`}
      >
        {item.logoUrl ? (
          <TokenLogo source={{ uri: item.logoUrl }} />
        ) : (
          <LogoFallback>
            <LogoFallbackText>{item.symbol.slice(0, 1)}</LogoFallbackText>
          </LogoFallback>
        )}
        <TokenInfo>
          <TokenSymbol>{item.symbol}</TokenSymbol>
          {item.name ? (
            <TokenName numberOfLines={1}>{item.name}</TokenName>
          ) : null}
        </TokenInfo>
        <TokenBalance>
          {item.balance !== undefined ? (
            <BalanceText numberOfLines={1}>{item.balance ?? '—'}</BalanceText>
          ) : null}
          {item.fiatValue ? <FiatText>{item.fiatValue}</FiatText> : null}
        </TokenBalance>
        {selected ? <Check importantForAccessibility="no">✓</Check> : null}
      </TokenRow>
    );
  };

  const renderBody = () => {
    if (isLoading && tokens.length === 0) {
      return (
        <Centered testID={`${testID}-loading`}>
          <ActivityIndicator color={theme.colors.primary} />
        </Centered>
      );
    }
    if (error && tokens.length === 0) {
      return (
        <ErrorState
          title="토큰 목록을 불러오지 못했습니다"
          message={error}
          onRetry={onRetry}
          testID={`${testID}-error`}
        />
      );
    }
    return (
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <EmptyState
            title="검색 결과가 없습니다"
            message="토큰 이름, 심볼 또는 계약 주소로 검색해주세요."
            testID={`${testID}-empty`}
          />
        }
      />
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <Screen testID={testID}>
        <ScreenHeader
          title={title}
          leftIcon="close"
          onBack={handleClose}
          backTestID={`${testID}-close`}
        />
        <SearchInput
          value={query}
          onChangeText={setQuery}
          placeholder="이름, 심볼 또는 주소 검색"
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="토큰 검색"
          testID={`${testID}-search`}
        />
        {recent.length > 0 ? (
          <RecentSection>
            <RecentLabel>최근 사용</RecentLabel>
            <RecentRow>
              {recent.map(token => (
                <RecentChip
                  key={token.id}
                  hitSlop={{ top: 4, bottom: 4 }}
                  onPress={() => handleSelect(token)}
                  accessibilityRole="button"
                  accessibilityLabel={`최근 사용 토큰 ${token.symbol} 선택`}
                  testID={`${testID}-recent-${token.symbol}`}
                >
                  <RecentChipText>{token.symbol}</RecentChipText>
                </RecentChip>
              ))}
            </RecentRow>
          </RecentSection>
        ) : null}
        {renderBody()}
      </Screen>
    </Modal>
  );
}

const SearchInput = styled.TextInput`
  margin: 0 ${({ theme }) => theme.spacing.md}px
    ${({ theme }) => theme.spacing.sm}px;
  min-height: 44px;
  padding: 0 ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 15px;
`;

const RecentSection = styled.View`
  padding: 0 ${({ theme }) => theme.spacing.md}px
    ${({ theme }) => theme.spacing.sm}px;
`;

const RecentLabel = styled.Text`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
`;

const RecentRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 8px;
`;

const RecentChip = styled.TouchableOpacity`
  min-height: 36px;
  justify-content: center;
  padding: 0 ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.full}px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background-color: ${({ theme }) => theme.colors.surface};
`;

const RecentChipText = styled.Text`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Centered = styled.View`
  padding: 40px;
  align-items: center;
`;

const TokenRow = styled.TouchableOpacity<{ $selected: boolean }>`
  flex-direction: row;
  align-items: center;
  min-height: 64px;
  padding: ${({ theme }) => theme.spacing.sm}px
    ${({ theme }) => theme.spacing.md}px;
  border-bottom-width: 1px;
  border-bottom-color: ${({ theme }) => theme.colors.border};
  background-color: ${({ theme, $selected }) =>
    $selected ? theme.colors.primarySubtle : 'transparent'};
`;

const TokenLogo = styled.Image`
  width: 36px;
  height: 36px;
  border-radius: 18px;
  margin-right: ${({ theme }) => theme.spacing.md}px;
`;

const LogoFallback = styled.View`
  width: 36px;
  height: 36px;
  border-radius: 18px;
  margin-right: ${({ theme }) => theme.spacing.md}px;
  background-color: ${({ theme }) => theme.colors.backgroundTertiary};
  align-items: center;
  justify-content: center;
`;

const LogoFallbackText = styled.Text`
  font-size: 15px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const TokenInfo = styled.View`
  flex: 1;
`;

const TokenSymbol = styled.Text`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const TokenName = styled.Text`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: 2px;
`;

const TokenBalance = styled.View`
  align-items: flex-end;
  max-width: 45%;
`;

const BalanceText = styled.Text`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const FiatText = styled.Text`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: 2px;
`;

const Check = styled.Text`
  margin-left: ${({ theme }) => theme.spacing.sm}px;
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.primary};
`;

export default TokenPickerModal;
