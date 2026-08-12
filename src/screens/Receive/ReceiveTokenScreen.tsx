/**
 * 토큰 수신 화면 (QR 코드 및 주소 표시)
 */

import React, { useCallback } from 'react';
import styled from 'styled-components/native';
import { useTheme } from '@/hooks/useTheme';
import { SafeAreaView, StatusBar, Alert, Share, Clipboard } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useWalletStore } from '@/store/walletStore';
import QRCode from 'react-native-qrcode-svg';

function ReceiveTokenScreen(): React.JSX.Element {
  const navigation = useNavigation();
  const { theme, isDarkMode } = useTheme();
  const { wallets, activeWalletIndex, networks, activeNetworkChainId } =
    useWalletStore();

  const activeWallet = wallets[activeWalletIndex];
  const activeNetwork = networks.find(n => n.chainId === activeNetworkChainId);

  const handleCopyAddress = useCallback(() => {
    if (activeWallet?.address) {
      Clipboard.setString(activeWallet.address);
      Alert.alert('복사 완료', '지갑 주소가 클립보드에 복사되었습니다.');
    }
  }, [activeWallet?.address]);

  const handleShare = useCallback(async () => {
    if (activeWallet?.address) {
      try {
        await Share.share({
          message: activeWallet.address,
          title: 'Tori Wallet 주소',
        });
      } catch (error) {
        console.error('Share failed:', error);
      }
    }
  }, [activeWallet?.address]);

  if (!activeWallet) {
    return (
      <Container>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <Content>
          <EmptyText>지갑이 없습니다</EmptyText>
        </Content>
      </Container>
    );
  }

  return (
    <Container>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <Content>
        <Header>
          <BackButton onPress={() => navigation.goBack()}>
            <BackButtonText>←</BackButtonText>
          </BackButton>
          <HeaderTitle>받기</HeaderTitle>
          <Placeholder />
        </Header>

        <QRContainer>
          <QRCodeWrapper>
            <QRCode
              value={activeWallet.address}
              size={180}
              backgroundColor={theme.colors.surface}
              color={theme.colors.textPrimary}
            />
          </QRCodeWrapper>
        </QRContainer>

        <InfoSection>
          <NetworkBadge>
            <NetworkDot $isTestnet={activeNetwork?.isTestnet} />
            <NetworkName>{activeNetwork?.name || 'Unknown'}</NetworkName>
          </NetworkBadge>

          <Label>내 지갑 주소</Label>
          <AddressContainer>
            <AddressText selectable>{activeWallet.address}</AddressText>
          </AddressContainer>

          <WarningBox>
            <WarningIcon>⚠️</WarningIcon>
            <WarningText>
              {activeNetwork?.name}의 {activeNetwork?.symbol || 'ETH'} 또는
              토큰만 이 주소로 전송하세요. 다른 네트워크에서 전송하면 자산을
              잃을 수 있습니다.
            </WarningText>
          </WarningBox>
        </InfoSection>

        <ButtonRow>
          <ActionButton onPress={handleCopyAddress}>
            <ActionButtonText>📋 주소 복사</ActionButtonText>
          </ActionButton>
          <ActionButton onPress={handleShare}>
            <ActionButtonText>📤 공유하기</ActionButtonText>
          </ActionButton>
        </ButtonRow>
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
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.xl}px;
`;

const BackButton = styled.TouchableOpacity`
  padding: ${({ theme }) => theme.spacing.sm}px;
`;

const BackButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 24px;
`;

const HeaderTitle = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.h2.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.h2.fontWeight};
`;

const Placeholder = styled.View`
  width: 40px;
`;

const EmptyText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  text-align: center;
  margin-top: 100px;
`;

const QRContainer = styled.View`
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.xl}px;
`;

const QRCodeWrapper = styled.View`
  width: 200px;
  height: 200px;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.lg}px;
  justify-content: center;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.sm}px;
`;

const InfoSection = styled.View`
  flex: 1;
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
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
`;

const Label = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
  text-align: center;
`;

const AddressContainer = styled.View`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const AddressText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  font-family: monospace;
  text-align: center;
`;

const WarningBox = styled.View`
  flex-direction: row;
  background-color: ${({ theme }) => theme.colors.backgroundSecondary};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  border-left-width: 4px;
  border-left-color: ${({ theme }) => theme.colors.warning};
`;

const WarningIcon = styled.Text`
  font-size: 20px;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const WarningText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  flex: 1;
  line-height: 18px;
`;

const ButtonRow = styled.View`
  flex-direction: row;
  gap: ${({ theme }) => theme.spacing.md}px;
`;

const ActionButton = styled.TouchableOpacity`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.primary};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  align-items: center;
`;

const ActionButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.button.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.button.fontWeight};
`;

export default ReceiveTokenScreen;
