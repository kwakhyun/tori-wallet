/**
 * dApp 연결(WalletConnect) 화면 — 페어링과 연결된 dApp 관리
 *
 * 연결 승인과 서명 요청은 WalletConnectHost가 앱 전역에서 처리한다. 이 화면을
 * 떠나도 대기 중인 요청은 거절되지 않는다.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components/native';
import { useShallow } from 'zustand/react/shallow';
import {
  StatusBar,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { readClipboard } from '@/utils/clipboard';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { useTheme } from '@/hooks/useTheme';
import { useWalletStore } from '@/store/walletStore';
import { showToast } from '@/store/toastStore';
import {
  wcService,
  parseCaipChainId,
  parseWalletConnectUri,
  WC_NOT_CONFIGURED_MESSAGE,
  type DAppSession,
  type WCStatus,
} from '@/services/wcService';
import { wcLogService } from '@/realm/services';
import { Screen } from '@/components/common/Screen';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { ErrorState } from '@/components/common/StateViews';
import { QRScanner } from '@/components/common/QRScanner';
import type { ScanResult } from '@/utils/paymentUri';
import { createLogger } from '@/utils/logger';

const logger = createLogger('WalletConnect');

type WalletConnectRouteProp = RouteProp<RootStackParamList, 'WalletConnect'>;

function shortAddress(address: string): string {
  return address.length > 14
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : address;
}

function uniqueAccountAddresses(accounts: string[]): string[] {
  const seen = new Map<string, string>();
  accounts.forEach(account => {
    const address = account.split(':')[2] || account;
    if (!seen.has(address.toLowerCase()))
      seen.set(address.toLowerCase(), address);
  });
  return Array.from(seen.values());
}

function WalletConnectScreen(): React.JSX.Element {
  const { theme, isDarkMode } = useTheme();
  const route = useRoute<WalletConnectRouteProp>();
  const routeUri = route.params?.uri;

  const { wallets, networks } = useWalletStore(
    useShallow(state => ({
      wallets: state.wallets,
      networks: state.networks,
    })),
  );

  const [status, setStatus] = useState<WCStatus>(() => wcService.getStatus());
  const [wcUri, setWcUri] = useState(routeUri || '');
  const [inputError, setInputError] = useState<string | null>(null);
  const [isPairing, setIsPairing] = useState(false);
  const [awaitingProposal, setAwaitingProposal] = useState(false);
  const [sessions, setSessions] = useState<DAppSession[]>(() =>
    wcService.getActiveSessions(),
  );
  const [scannerVisible, setScannerVisible] = useState(false);
  const alive = useRef(true);
  const autoPairedUri = useRef<string | null>(null);

  const notConfigured = status === 'not_configured';
  const pairingDisabled = notConfigured || isPairing;

  const refreshSessions = useCallback(() => {
    if (alive.current) setSessions(wcService.getActiveSessions());
  }, []);

  useEffect(() => {
    alive.current = true;
    const unsubscribeStatus = wcService.onStatusChange(next => {
      if (alive.current) setStatus(next);
    });
    const unsubscribeSessions = wcService.onSessionsChanged(event => {
      if (event.reason === 'approved' && alive.current)
        setAwaitingProposal(false);
      refreshSessions();
    });
    wcService
      .initialize()
      .catch(error => logger.warn('WalletConnect initialization failed', error))
      .finally(() => {
        if (!alive.current) return;
        setStatus(wcService.getStatus());
        refreshSessions();
      });
    return () => {
      alive.current = false;
      unsubscribeStatus();
      unsubscribeSessions();
    };
  }, [refreshSessions]);

  // 연결 요청을 보낸 뒤 제안이 오지 않으면 안내를 거둔다.
  useEffect(() => {
    if (!awaitingProposal) return;
    const timer = setTimeout(() => {
      if (alive.current) setAwaitingProposal(false);
    }, 30_000);
    return () => clearTimeout(timer);
  }, [awaitingProposal]);

  const pair = useCallback(async (input: string) => {
    const parsed = parseWalletConnectUri(input);
    if (!parsed.ok) {
      setInputError(parsed.reason);
      return;
    }
    if (!wcService.isConfigured()) {
      setInputError(WC_NOT_CONFIGURED_MESSAGE);
      return;
    }
    setInputError(null);
    setIsPairing(true);
    try {
      await wcService.pairWithUri(parsed.uri);
      if (!alive.current) return;
      setWcUri('');
      setAwaitingProposal(true);
    } catch (error) {
      if (!alive.current) return;
      setInputError(
        error instanceof Error && error.message
          ? error.message
          : '연결에 실패했습니다.',
      );
    } finally {
      if (alive.current) setIsPairing(false);
    }
  }, []);

  // 딥링크/다른 화면에서 URI와 함께 열리면 자동으로 페어링한다.
  useEffect(() => {
    if (!routeUri || notConfigured || autoPairedUri.current === routeUri)
      return;
    autoPairedUri.current = routeUri;
    setWcUri(routeUri);
    pair(routeUri);
  }, [routeUri, notConfigured, pair]);

  const handleConnect = useCallback(() => {
    pair(wcUri);
  }, [pair, wcUri]);

  const handlePaste = useCallback(async () => {
    try {
      const text = (await readClipboard()).trim();
      if (!text) {
        showToast('클립보드가 비어 있습니다.', 'info');
        return;
      }
      setWcUri(text);
      await pair(text);
    } catch (error) {
      logger.warn('Clipboard read failed', error);
      showToast('클립보드를 읽지 못했습니다.', 'error');
    }
  }, [pair]);

  const handleScan = useCallback(
    (result: ScanResult) => {
      if (result.kind !== 'walletconnect') return;
      setWcUri(result.uri);
      pair(result.uri);
    },
    [pair],
  );

  const handleRetryInit = useCallback(() => {
    wcService
      .initialize()
      .catch(error => logger.warn('WalletConnect initialization failed', error))
      .finally(() => {
        if (!alive.current) return;
        setStatus(wcService.getStatus());
        refreshSessions();
      });
  }, [refreshSessions]);

  const handleDisconnect = useCallback(
    (session: DAppSession) => {
      Alert.alert(
        '연결 해제',
        `${session.name}과(와)의 연결을 해제하시겠습니까?\n해제 후에는 이 dApp이 서명을 요청할 수 없습니다.`,
        [
          { text: '취소', style: 'cancel' },
          {
            text: '해제',
            style: 'destructive',
            onPress: async () => {
              try {
                await wcService.disconnectSession(session.topic);
                await wcLogService
                  .logSessionDisconnected(session.topic)
                  .catch(error => logger.warn('Session log failed', error));
                showToast(`${session.name} 연결을 해제했습니다.`, 'success');
              } catch (error) {
                logger.warn('Failed to disconnect', error);
                showToast(
                  '연결 해제에 실패했습니다. 다시 시도해주세요.',
                  'error',
                );
              } finally {
                refreshSessions();
              }
            },
          },
        ],
      );
    },
    [refreshSessions],
  );

  const chainName = (caip: string): string => {
    const chainId = parseCaipChainId(caip);
    if (chainId === null) return caip;
    return (
      (networks || []).find(network => network.chainId === chainId)?.name ||
      `체인 ${chainId}`
    );
  };

  const accountLabel = (address: string): string => {
    const wallet = (wallets || []).find(
      item => item.address.toLowerCase() === address.toLowerCase(),
    );
    return wallet
      ? `${wallet.name} · ${shortAddress(address)}`
      : shortAddress(address);
  };

  return (
    <Screen>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScreenHeader title="WalletConnect" testID="wc-header" />
      <ScrollView keyboardShouldPersistTaps="handled">
        <Content>
          {notConfigured && (
            <NoticeBox accessibilityRole="alert" testID="wc-not-configured">
              <NoticeText>{WC_NOT_CONFIGURED_MESSAGE}</NoticeText>
            </NoticeBox>
          )}
          {status === 'error' && (
            <ErrorState
              compact
              title="WalletConnect에 연결하지 못했습니다"
              message="네트워크 연결을 확인한 뒤 다시 시도해주세요."
              onRetry={handleRetryInit}
              testID="wc-init-error"
            />
          )}

          {/* 연결 입력 */}
          <ConnectSection>
            <Label nativeID="wc-uri-label">WalletConnect URI</Label>
            <URIInput
              value={wcUri}
              onChangeText={(text: string) => {
                setWcUri(text);
                if (inputError) setInputError(null);
              }}
              placeholder="wc:..."
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!notConfigured}
              accessibilityLabel="WalletConnect URI"
              accessibilityLabelledBy="wc-uri-label"
              testID="wc-uri-input"
            />
            {inputError ? (
              <ErrorText accessibilityRole="alert" testID="wc-uri-error">
                {inputError}
              </ErrorText>
            ) : null}
            <ActionRow>
              <OutlineButton
                onPress={() => setScannerVisible(true)}
                disabled={pairingDisabled}
                $disabled={pairingDisabled}
                accessibilityRole="button"
                accessibilityLabel="QR 코드로 연결"
                accessibilityState={{ disabled: pairingDisabled }}
                testID="wc-scan-button"
              >
                <OutlineButtonText>QR 스캔</OutlineButtonText>
              </OutlineButton>
              <OutlineButton
                onPress={handlePaste}
                disabled={pairingDisabled}
                $disabled={pairingDisabled}
                accessibilityRole="button"
                accessibilityLabel="클립보드에서 붙여넣고 연결"
                accessibilityState={{ disabled: pairingDisabled }}
                testID="wc-paste-button"
              >
                <OutlineButtonText>붙여넣기</OutlineButtonText>
              </OutlineButton>
              <ConnectButton
                onPress={handleConnect}
                disabled={pairingDisabled}
                // 연결 중에는 누를 수 없게만 하고 기본 색은 유지한다 (회색 배경 위
                // 흰 스피너는 라이트 모드에서 보이지 않는다).
                $disabled={notConfigured}
                accessibilityRole="button"
                accessibilityLabel="연결"
                accessibilityState={{
                  disabled: pairingDisabled,
                  busy: isPairing,
                }}
                testID="wc-connect-button"
              >
                {isPairing ? (
                  <ActivityIndicator
                    color={theme.colors.onPrimary}
                    size="small"
                    testID="wc-connect-spinner"
                  />
                ) : (
                  <ConnectButtonText $disabled={notConfigured}>
                    연결
                  </ConnectButtonText>
                )}
              </ConnectButton>
            </ActionRow>
            <HintText>
              {awaitingProposal
                ? 'dApp의 연결 요청을 기다리는 중입니다. 잠시 후 연결 승인 창이 열립니다.'
                : 'dApp의 WalletConnect QR을 스캔하거나 연결 URI를 붙여넣으세요.'}
            </HintText>
          </ConnectSection>

          {/* 연결된 dApp */}
          <SectionTitle accessibilityRole="header">연결된 dApp</SectionTitle>
          {sessions.length === 0 ? (
            <EmptyBox testID="wc-sessions-empty">
              <EmptyIcon importantForAccessibility="no">🔌</EmptyIcon>
              <EmptyText>연결된 dApp이 없습니다</EmptyText>
            </EmptyBox>
          ) : (
            sessions.map(session => {
              const addresses = uniqueAccountAddresses(session.accounts);
              const chainNames = Array.from(
                new Set(session.chains.map(chainName)),
              );
              return (
                <SessionCard key={session.topic} testID="wc-session">
                  <SessionInfo>
                    <SessionName>{session.name}</SessionName>
                    <SessionUrl>{session.url}</SessionUrl>
                    {addresses.map(address => (
                      <SessionMeta
                        key={address}
                        accessibilityLabel={`연결된 계정 ${address}`}
                      >
                        계정: {accountLabel(address)}
                      </SessionMeta>
                    ))}
                    <SessionMeta>네트워크: {chainNames.join(', ')}</SessionMeta>
                  </SessionInfo>
                  <DisconnectButton
                    onPress={() => handleDisconnect(session)}
                    accessibilityRole="button"
                    accessibilityLabel={`${session.name} 연결 해제`}
                    testID="wc-disconnect"
                  >
                    <DisconnectText>해제</DisconnectText>
                  </DisconnectButton>
                </SessionCard>
              );
            })
          )}

          {/* 도움말 */}
          <HelpSection>
            <HelpTitle>WalletConnect 사용법</HelpTitle>
            <HelpText>
              1. dApp 웹사이트에서 "WalletConnect"를 선택합니다{'\n'}
              2. "QR 스캔"으로 화면의 QR을 스캔하거나, 연결 URI를 복사해
              "붙여넣기"를 누릅니다{'\n'}
              3. 연결 승인 창에서 연결할 계정과 네트워크를 확인하고 승인합니다
              {'\n'}
              4. 이후 서명 요청은 앱 어디에 있든 확인 창으로 표시됩니다
            </HelpText>
          </HelpSection>
        </Content>
      </ScrollView>

      <QRScanner
        visible={scannerVisible}
        mode="walletconnect"
        title="WalletConnect QR 스캔"
        onClose={() => setScannerVisible(false)}
        onScan={handleScan}
      />
    </Screen>
  );
}

const Content = styled.View`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.lg}px;
  padding-top: ${({ theme }) => theme.spacing.sm}px;
`;

const NoticeBox = styled.View`
  background-color: ${({ theme }) => theme.colors.warningSubtle};
  border-left-width: 4px;
  border-left-color: ${({ theme }) => theme.colors.warning};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const NoticeText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  line-height: 20px;
`;

const ConnectSection = styled.View`
  margin-bottom: ${({ theme }) => theme.spacing.xl}px;
`;

const Label = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const URIInput = styled(TextInput)`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  min-height: 48px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  border-width: 1px;
  border-color: ${({ theme }) => theme.colors.border};
`;

const ErrorText = styled.Text`
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
`;

const ActionRow = styled.View`
  flex-direction: row;
  gap: ${({ theme }) => theme.spacing.sm}px;
  margin-top: ${({ theme }) => theme.spacing.sm}px;
`;

const OutlineButton = styled.TouchableOpacity<{ $disabled?: boolean }>`
  flex: 1;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  border-width: 1px;
  border-color: ${({ theme }) => theme.colors.border};
  background-color: ${({ theme }) => theme.colors.surface};
  opacity: ${({ $disabled }) => ($disabled ? 0.5 : 1)};
`;

const OutlineButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.button.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.button.fontWeight};
`;

const ConnectButton = styled.TouchableOpacity<{ $disabled?: boolean }>`
  flex: 1;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme, $disabled }) =>
    $disabled ? theme.colors.disabledBackground : theme.colors.primary};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
`;

const ConnectButtonText = styled.Text<{ $disabled?: boolean }>`
  color: ${({ theme, $disabled }) =>
    $disabled ? theme.colors.disabledText : theme.colors.onPrimary};
  font-size: ${({ theme }) => theme.typography.button.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.button.fontWeight};
`;

const HintText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  line-height: 18px;
  margin-top: ${({ theme }) => theme.spacing.sm}px;
`;

const SectionTitle = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.h3.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.h3.fontWeight};
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const EmptyBox = styled.View`
  align-items: center;
  padding: ${({ theme }) => theme.spacing.xl}px;
`;

const EmptyIcon = styled.Text`
  font-size: 48px;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const EmptyText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
`;

const SessionCard = styled.View`
  flex-direction: row;
  align-items: center;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const SessionInfo = styled.View`
  flex: 1;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const SessionName = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  font-weight: 600;
`;

const SessionUrl = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  margin-bottom: 2px;
`;

const SessionMeta = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  line-height: 18px;
`;

const DisconnectButton = styled.TouchableOpacity`
  min-height: 44px;
  min-width: 56px;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme }) => theme.colors.errorSubtle};
  border-width: 1px;
  border-color: ${({ theme }) => theme.colors.error};
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  padding: 0 ${({ theme }) => theme.spacing.md}px;
`;

const DisconnectText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  font-weight: 600;
`;

const HelpSection = styled.View`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.lg}px;
  margin-top: ${({ theme }) => theme.spacing.xl}px;
`;

const HelpTitle = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  font-weight: 600;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const HelpText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  line-height: 22px;
`;

export default WalletConnectScreen;
