/**
 * 토큰 수신 화면 (QR 코드 및 주소 표시)
 *
 * - QR은 스캐너 호환을 위해 테마와 무관하게 항상 흰 바탕 검은 코드 + 16px 이상 여백
 * - 공유 문구에 네트워크 이름과 "이 네트워크로만 보내라"는 경고를 포함
 * - 큰 글꼴에서도 넘치지 않도록 스크롤 가능
 */

import React, { useCallback, useMemo } from 'react';
import styled, { useTheme as useStyledTheme } from 'styled-components/native';
import { useShallow } from 'zustand/react/shallow';
import { StatusBar, Share, Clipboard, ScrollView } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'react-native-qrcode-svg';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { useTheme } from '@/hooks/useTheme';
import { useWalletStore } from '@/store/walletStore';
import { showToast } from '@/store/toastStore';
import { tokenService } from '@/services/tokenService';
import { Screen } from '@/components/common/Screen';
import { ScreenHeader } from '@/components/common/ScreenHeader';

type ReceiveRouteProp = RouteProp<RootStackParamList, 'ReceiveToken'>;

export const QR_SIZE = 200;
export const QR_QUIET_ZONE = 16;

/** 공유 문구: 주소 + 네트워크 + 다른 네트워크 전송 경고 */
export function buildShareMessage(
  address: string,
  networkName: string,
  tokenSymbol?: string,
): string {
  const subject = tokenSymbol
    ? `${networkName}에서 ${tokenSymbol}(ERC-20)을 받을 내 지갑 주소`
    : `내 ${networkName} 지갑 주소`;
  return [
    `${subject}:`,
    address,
    '',
    `⚠️ 반드시 ${networkName} 네트워크로만 보내주세요. 다른 네트워크로 보내면 자산을 잃을 수 있습니다.`,
  ].join('\n');
}

function ReceiveTokenScreen(): React.JSX.Element {
  const { isDarkMode } = useTheme();
  const theme = useStyledTheme();
  const route = useRoute<ReceiveRouteProp>();
  const tokenAddress = route.params?.tokenAddress;
  const { wallets, activeWalletIndex, networks, activeNetworkChainId } =
    useWalletStore(
      useShallow(state => ({
        wallets: state.wallets,
        activeWalletIndex: state.activeWalletIndex,
        networks: state.networks,
        activeNetworkChainId: state.activeNetworkChainId,
      })),
    );

  const activeWallet = wallets[activeWalletIndex];
  const activeNetwork = networks.find(n => n.chainId === activeNetworkChainId);
  const networkName = activeNetwork?.name || '현재';
  const nativeSymbol = activeNetwork?.symbol || 'ETH';

  // 토큰 심볼: 홈/포트폴리오와 공유하는 토큰 캐시 → 기본 토큰 목록 순으로 찾는다.
  const tokensQuery = useQuery({
    queryKey: ['tokens', activeWallet?.address, activeNetworkChainId],
    queryFn: () =>
      tokenService.getTokens(activeWallet?.address || '', activeNetworkChainId),
    enabled: !!tokenAddress && !!activeWallet?.address,
    staleTime: 30000,
  });

  const tokenSymbol = useMemo(() => {
    if (!tokenAddress) return undefined;
    const target = tokenAddress.toLowerCase();
    const fromQuery = (
      Array.isArray(tokensQuery.data) ? tokensQuery.data : []
    ).find(t => t.address !== 'native' && t.address.toLowerCase() === target);
    if (fromQuery) return fromQuery.symbol;
    const fromDefaults = tokenService
      .getDefaultTokens(activeNetworkChainId)
      .find(t => t.address !== 'native' && t.address.toLowerCase() === target);
    return fromDefaults?.symbol;
  }, [tokenAddress, tokensQuery.data, activeNetworkChainId]);

  const tokenLabel = tokenAddress
    ? tokenSymbol ?? `${tokenAddress.slice(0, 6)}...${tokenAddress.slice(-4)}`
    : undefined;

  const handleCopyAddress = useCallback(() => {
    if (activeWallet?.address) {
      Clipboard.setString(activeWallet.address);
      showToast('주소를 복사했습니다', 'success');
    }
  }, [activeWallet?.address]);

  const handleShare = useCallback(async () => {
    if (!activeWallet?.address) return;
    try {
      await Share.share({
        message: buildShareMessage(
          activeWallet.address,
          networkName,
          tokenLabel,
        ),
        title: 'Tori Wallet 주소',
      });
    } catch (error) {
      console.warn('Share failed:', error);
      showToast('공유하지 못했습니다', 'error');
    }
  }, [activeWallet?.address, networkName, tokenLabel]);

  if (!activeWallet) {
    return (
      <Screen>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <ScreenHeader title="받기" />
        <EmptyText>지갑이 없습니다</EmptyText>
      </Screen>
    );
  }

  return (
    <Screen testID="receive-screen">
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScreenHeader
        title={tokenLabel ? `${tokenLabel} 받기` : '받기'}
        testID="receive-header"
      />
      <ScrollView contentContainerStyle={scrollContentStyle}>
        <Content>
          <NetworkBadge
            accessible
            accessibilityLabel={`네트워크 ${networkName}${
              activeNetwork?.isTestnet ? ', 테스트넷' : ''
            }`}
          >
            <NetworkDot $isTestnet={activeNetwork?.isTestnet} />
            <NetworkName>{networkName}</NetworkName>
          </NetworkBadge>

          <QRContainer>
            {/* QR은 테마와 무관하게 흰 바탕 + 검은 코드, 여백(quiet zone) 16px 이상 */}
            <QRCodeWrapper
              testID="receive-qr"
              accessible
              accessibilityRole="image"
              accessibilityLabel="지갑 주소 QR 코드"
            >
              <QRCode
                value={activeWallet.address}
                size={QR_SIZE}
                quietZone={QR_QUIET_ZONE}
                backgroundColor={theme.colors.qrBackground}
                color={theme.colors.qrForeground}
                ecl="M"
              />
            </QRCodeWrapper>
          </QRContainer>

          {tokenAddress ? (
            <TokenNotice testID="receive-token-notice">
              <TokenNoticeTitle>{tokenLabel} (ERC-20)</TokenNoticeTitle>
              <TokenNoticeText>
                ERC-20 토큰도 같은 주소로 받습니다. 보내는 쪽에서 {networkName}{' '}
                네트워크를 선택했는지 확인하세요.
              </TokenNoticeText>
            </TokenNotice>
          ) : null}

          <Label>내 지갑 주소</Label>
          <AddressContainer
            onPress={handleCopyAddress}
            accessibilityRole="button"
            accessibilityLabel={`지갑 주소 ${activeWallet.address}, 눌러서 복사`}
            testID="receive-address"
          >
            <AddressText selectable>{activeWallet.address}</AddressText>
          </AddressContainer>

          <WarningBox>
            <WarningIcon importantForAccessibility="no">⚠️</WarningIcon>
            <WarningText>
              {networkName}의 {nativeSymbol} 또는 토큰만 이 주소로 전송하세요.
              다른 네트워크에서 전송하면 자산을 잃을 수 있습니다.
            </WarningText>
          </WarningBox>

          <ButtonRow>
            <ActionButton
              onPress={handleCopyAddress}
              accessibilityRole="button"
              accessibilityLabel="주소 복사"
              testID="receive-copy-button"
            >
              <ActionButtonText>주소 복사</ActionButtonText>
            </ActionButton>
            <ActionButton
              onPress={handleShare}
              accessibilityRole="button"
              accessibilityLabel="주소 공유하기"
              testID="receive-share-button"
            >
              <ActionButtonText>공유하기</ActionButtonText>
            </ActionButton>
          </ButtonRow>
        </Content>
      </ScrollView>
    </Screen>
  );
}

const scrollContentStyle = { flexGrow: 1 };

const Content = styled.View`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.lg}px;
  padding-top: ${({ theme }) => theme.spacing.sm}px;
`;

const EmptyText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  text-align: center;
  margin-top: 100px;
`;

const NetworkBadge = styled.View`
  flex-direction: row;
  align-items: center;
  align-self: center;
  background-color: ${({ theme }) => theme.colors.surface};
  padding: ${({ theme }) => theme.spacing.xs}px
    ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.full}px;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
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
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
`;

const QRContainer = styled.View`
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const QRCodeWrapper = styled.View`
  background-color: ${({ theme }) => theme.colors.qrBackground};
  border-radius: ${({ theme }) => theme.borderRadius.lg}px;
  padding: ${({ theme }) => theme.spacing.sm}px;
  justify-content: center;
  align-items: center;
`;

const TokenNotice = styled.View`
  background-color: ${({ theme }) => theme.colors.primarySubtle};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const TokenNoticeTitle = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  font-weight: 600;
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
`;

const TokenNoticeText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  line-height: 20px;
`;

const Label = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
  text-align: center;
`;

const AddressContainer = styled.TouchableOpacity`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
  min-height: 44px;
  justify-content: center;
`;

const AddressText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  font-family: monospace;
  text-align: center;
`;

const WarningBox = styled.View`
  flex-direction: row;
  background-color: ${({ theme }) => theme.colors.warningSubtle};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  border-left-width: 4px;
  border-left-color: ${({ theme }) => theme.colors.warning};
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const WarningIcon = styled.Text`
  font-size: 20px;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const WarningText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  flex: 1;
  line-height: 20px;
`;

const ButtonRow = styled.View`
  flex-direction: row;
  gap: ${({ theme }) => theme.spacing.md}px;
  margin-top: auto;
`;

const ActionButton = styled.TouchableOpacity`
  flex: 1;
  min-height: 52px;
  background-color: ${({ theme }) => theme.colors.primary};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  align-items: center;
  justify-content: center;
`;

const ActionButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.onPrimary};
  font-size: ${({ theme }) => theme.typography.button.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.button.fontWeight};
  text-align: center;
`;

export default ReceiveTokenScreen;
