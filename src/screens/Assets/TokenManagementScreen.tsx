/**
 * 토큰 관리 화면
 *
 * - 현재 네트워크의 기본 토큰 + 사용자 토큰을 보여 주고 표시/숨김을 바꾼다.
 * - 컨트랙트 주소로 사용자 토큰을 추가한다: 주소 검증 → 체인에서 심볼/이름/소수 자릿수 조회
 *   → 가짜 이름 경고와 함께 확인 → 저장
 * - 사용자 토큰은 삭제할 수 있다.
 * 변경 후에는 토큰 목록 캐시(['tokens'])를 무효화해 홈/포트폴리오에 바로 반영한다.
 */

import React, { useCallback, useMemo, useState } from 'react';
import styled from 'styled-components/native';
import { useShallow } from 'zustand/react/shallow';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { isAddress } from 'viem';
import { useTheme } from '@/hooks/useTheme';
import { useWalletStore } from '@/store/walletStore';
import { showToast } from '@/store/toastStore';
import { tokenService, type TokenConfig } from '@/services/tokenService';
import {
  useCustomTokens,
  useTokenVisibility,
} from '@/realm/hooks/useTokenList';
import { Screen } from '@/components/common/Screen';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { IconButton } from '@/components/common/IconButton';

interface ManagedToken extends TokenConfig {
  isCustom: boolean;
}

export const FAKE_TOKEN_WARNING =
  '누구나 원하는 이름과 심볼로 토큰을 만들 수 있습니다. 공식 사이트나 신뢰할 수 있는 출처에서 확인한 컨트랙트 주소만 추가하세요.';

function shorten(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function TokenManagementScreen(): React.JSX.Element {
  const { theme, isDarkMode } = useTheme();
  const queryClient = useQueryClient();
  const { networks, activeNetworkChainId } = useWalletStore(
    useShallow(state => ({
      networks: state.networks,
      activeNetworkChainId: state.activeNetworkChainId,
    })),
  );
  const activeNetwork = networks.find(n => n.chainId === activeNetworkChainId);

  const {
    tokens: customEntries,
    isLoading: isCustomLoading,
    addCustomToken,
    removeCustomToken,
  } = useCustomTokens(activeNetworkChainId);
  const {
    hiddenAddresses,
    isLoading: isHiddenLoading,
    setHidden,
  } = useTokenVisibility(activeNetworkChainId);

  const [contractInput, setContractInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [busyAddress, setBusyAddress] = useState<string | null>(null);

  const managedTokens = useMemo<ManagedToken[]>(() => {
    const defaults: ManagedToken[] = tokenService
      .getDefaultTokens(activeNetworkChainId)
      .map(token => ({ ...token, isCustom: false }));
    const custom: ManagedToken[] = (customEntries || [])
      .filter(entry => isAddress(entry.address))
      .filter(
        entry =>
          !defaults.some(
            d => d.address.toLowerCase() === entry.address.toLowerCase(),
          ),
      )
      .map(entry => ({
        symbol: entry.symbol,
        name: entry.name,
        address: entry.address as `0x${string}`,
        decimals: entry.decimals,
        coingeckoId: entry.coingeckoId || undefined,
        logoUrl: entry.logoUrl || undefined,
        isCustom: true,
      }));
    return [...defaults, ...custom];
  }, [activeNetworkChainId, customEntries]);

  const invalidateTokens = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['tokens'] });
  }, [queryClient]);

  const handleToggle = useCallback(
    async (token: ManagedToken, visible: boolean) => {
      if (token.address === 'native') return;
      setBusyAddress(token.address);
      try {
        const ok = await setHidden(
          {
            address: token.address,
            chainId: activeNetworkChainId,
            symbol: token.symbol,
            name: token.name,
            decimals: token.decimals,
            logoUrl: token.logoUrl,
            coingeckoId: token.coingeckoId,
            isCustom: token.isCustom,
          },
          !visible,
        );
        if (!ok) throw new Error('update failed');
        invalidateTokens();
      } catch {
        showToast('설정을 저장하지 못했습니다', 'error');
      } finally {
        setBusyAddress(null);
      }
    },
    [activeNetworkChainId, setHidden, invalidateTokens],
  );

  const handleRemove = useCallback(
    (token: ManagedToken) => {
      Alert.alert(
        `${token.symbol} 삭제`,
        '목록에서 이 토큰을 삭제할까요? 지갑의 토큰 잔액에는 영향이 없습니다.',
        [
          { text: '취소', style: 'cancel' },
          {
            text: '삭제',
            style: 'destructive',
            onPress: async () => {
              try {
                const ok = await removeCustomToken(
                  token.address,
                  activeNetworkChainId,
                );
                if (!ok) throw new Error('delete failed');
                invalidateTokens();
                showToast(`${token.symbol}을(를) 삭제했습니다`, 'success');
              } catch {
                showToast('토큰을 삭제하지 못했습니다', 'error');
              }
            },
          },
        ],
      );
    },
    [activeNetworkChainId, removeCustomToken, invalidateTokens],
  );

  const handleAdd = useCallback(async () => {
    const address = contractInput.trim();
    if (!isAddress(address)) {
      setInputError('올바른 컨트랙트 주소(0x로 시작하는 42자)를 입력해주세요.');
      return;
    }
    if (
      managedTokens.some(
        t =>
          t.address !== 'native' &&
          t.address.toLowerCase() === address.toLowerCase(),
      )
    ) {
      setInputError('이미 목록에 있는 토큰입니다.');
      return;
    }
    setInputError(null);
    setIsLookingUp(true);
    let metadata;
    try {
      metadata = await tokenService.getTokenMetadata(
        address,
        activeNetworkChainId,
      );
    } catch (error) {
      setInputError(
        error instanceof Error
          ? error.message
          : '토큰 정보를 읽을 수 없습니다.',
      );
      return;
    } finally {
      setIsLookingUp(false);
    }

    Alert.alert(
      '이 토큰을 추가할까요?',
      `${metadata.name} (${metadata.symbol})\n소수 자릿수: ${
        metadata.decimals
      }\n네트워크: ${activeNetwork?.name ?? ''}\n컨트랙트: ${shorten(
        metadata.address,
      )}\n\n${FAKE_TOKEN_WARNING}`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '추가',
          onPress: async () => {
            try {
              await addCustomToken({
                address: metadata.address,
                chainId: activeNetworkChainId,
                symbol: metadata.symbol,
                name: metadata.name,
                decimals: metadata.decimals,
              });
              setContractInput('');
              invalidateTokens();
              showToast(`${metadata.symbol}을(를) 추가했습니다`, 'success');
            } catch {
              showToast('토큰을 추가하지 못했습니다', 'error');
            }
          },
        },
      ],
    );
  }, [
    contractInput,
    managedTokens,
    activeNetworkChainId,
    activeNetwork?.name,
    addCustomToken,
    invalidateTokens,
  ]);

  const isLoading = isCustomLoading || isHiddenLoading;

  return (
    <Screen testID="TokenManagement-screen">
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScreenHeader
        title="토큰 관리"
        subtitle={activeNetwork?.name}
        testID="token-management-header"
      />
      <KeyboardAvoidingView
        style={flexStyle}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView keyboardShouldPersistTaps="handled">
          <Content>
            <SectionTitle accessibilityRole="header">
              {activeNetwork?.name ?? '현재 네트워크'} 토큰
            </SectionTitle>
            {isLoading ? (
              <ActivityIndicator
                color={theme.colors.primary}
                accessibilityLabel="토큰 목록 불러오는 중"
              />
            ) : (
              <Card>
                {managedTokens.map(token => {
                  const isNative = token.address === 'native';
                  const visible =
                    isNative ||
                    !hiddenAddresses.has(token.address.toLowerCase());
                  const key = isNative ? 'native' : token.address;
                  return (
                    <TokenRow key={key} testID={`token-manage-row-${key}`}>
                      <TokenInfo>
                        <TokenSymbol>
                          {token.symbol}
                          {token.isCustom ? (
                            <CustomTag> · 직접 추가</CustomTag>
                          ) : null}
                        </TokenSymbol>
                        <TokenName numberOfLines={1}>
                          {isNative
                            ? `${token.name} · 네트워크 기본 자산`
                            : `${token.name} · ${shorten(token.address)}`}
                        </TokenName>
                      </TokenInfo>
                      {token.isCustom ? (
                        <IconButton
                          icon="🗑"
                          accessibilityLabel={`${token.symbol} 삭제`}
                          onPress={() => handleRemove(token)}
                          testID={`token-manage-remove-${key}`}
                        />
                      ) : null}
                      <Switch
                        value={visible}
                        disabled={isNative || busyAddress === token.address}
                        onValueChange={value => handleToggle(token, value)}
                        accessibilityLabel={`${token.symbol} 홈에 표시`}
                        accessibilityHint={
                          isNative
                            ? '네트워크 기본 자산은 숨길 수 없습니다'
                            : undefined
                        }
                        trackColor={{
                          true: theme.colors.primary,
                          false: theme.colors.disabledBackground,
                        }}
                        testID={`token-manage-toggle-${key}`}
                      />
                    </TokenRow>
                  );
                })}
              </Card>
            )}

            <SectionTitle accessibilityRole="header">
              사용자 토큰 추가
            </SectionTitle>
            <Card>
              <WarningText testID="token-manage-warning">
                ⚠️ {FAKE_TOKEN_WARNING}
              </WarningText>
              <InputLabel nativeID="token-contract-label">
                토큰 컨트랙트 주소
              </InputLabel>
              <ContractInput
                value={contractInput}
                onChangeText={text => {
                  setContractInput(text);
                  if (inputError) setInputError(null);
                }}
                placeholder="0x..."
                placeholderTextColor={theme.colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="토큰 컨트랙트 주소"
                accessibilityLabelledBy="token-contract-label"
                $error={!!inputError}
                testID="token-manage-input"
              />
              {inputError ? (
                <ErrorText
                  accessibilityRole="alert"
                  testID="token-manage-error"
                >
                  {inputError}
                </ErrorText>
              ) : null}
              <AddButton
                onPress={handleAdd}
                disabled={isLookingUp || contractInput.trim().length === 0}
                accessibilityRole="button"
                accessibilityLabel="토큰 정보 확인 후 추가"
                accessibilityState={{
                  disabled: isLookingUp || contractInput.trim().length === 0,
                  busy: isLookingUp,
                }}
                testID="token-manage-add"
              >
                {isLookingUp ? (
                  <ActivityIndicator color={theme.colors.primary} />
                ) : (
                  <AddButtonText $disabled={contractInput.trim().length === 0}>
                    토큰 정보 확인
                  </AddButtonText>
                )}
              </AddButton>
            </Card>
          </Content>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const flexStyle = { flex: 1 };

const Content = styled.View`
  padding: ${({ theme }) => theme.spacing.lg}px;
  padding-top: ${({ theme }) => theme.spacing.sm}px;
`;

const SectionTitle = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  font-weight: 600;
  margin-top: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const Card = styled.View`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.sm}px
    ${({ theme }) => theme.spacing.md}px;
`;

const TokenRow = styled.View`
  flex-direction: row;
  align-items: center;
  min-height: 56px;
  border-bottom-width: 1px;
  border-bottom-color: ${({ theme }) => theme.colors.border};
`;

const TokenInfo = styled.View`
  flex: 1;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const TokenSymbol = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 16px;
  font-weight: 600;
`;

const CustomTag = styled.Text`
  color: ${({ theme }) => theme.colors.warning};
  font-size: 12px;
  font-weight: 500;
`;

const TokenName = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 12px;
  margin-top: 2px;
`;

const WarningText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  background-color: ${({ theme }) => theme.colors.warningSubtle};
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  padding: ${({ theme }) => theme.spacing.sm}px;
  font-size: 13px;
  line-height: 19px;
  margin: ${({ theme }) => theme.spacing.sm}px 0;
`;

const InputLabel = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  margin-top: ${({ theme }) => theme.spacing.sm}px;
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
`;

const ContractInput = styled.TextInput<{ $error: boolean }>`
  min-height: 48px;
  border-width: 1px;
  border-color: ${({ theme, $error }) =>
    $error ? theme.colors.error : theme.colors.inputBorder};
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  padding: 0 ${({ theme }) => theme.spacing.md}px;
  color: ${({ theme }) => theme.colors.textPrimary};
  background-color: ${({ theme }) => theme.colors.inputBackground};
  font-family: monospace;
  font-size: 14px;
`;

const ErrorText = styled.Text`
  color: ${({ theme }) => theme.colors.error};
  font-size: 13px;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
`;

const AddButton = styled.TouchableOpacity`
  min-height: 48px;
  margin: ${({ theme }) => theme.spacing.md}px 0
    ${({ theme }) => theme.spacing.sm}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme, disabled }) =>
    disabled ? theme.colors.disabledBackground : theme.colors.primary};
`;

const AddButtonText = styled.Text<{ $disabled: boolean }>`
  color: ${({ theme, $disabled }) =>
    $disabled ? theme.colors.disabledText : theme.colors.onPrimary};
  font-size: 16px;
  font-weight: 600;
`;
