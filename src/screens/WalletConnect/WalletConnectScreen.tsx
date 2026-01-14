/**
 * Tori Wallet - WalletConnect Screen
 * dApp 연결 관리 화면
 */

import React, { useState, useCallback, useEffect } from 'react';
import styled from 'styled-components/native';
import {
  SafeAreaView,
  StatusBar,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { useWalletStore } from '@/store/walletStore';
import { wcService, DAppSession } from '@/services/wcService';
import { signingService } from '@/services/signingService';
import { useWCActiveSessions, useWCRequestLog } from '@/realm/hooks';
import { SignRequestModal, SignRequest } from '@/components/SignRequestModal';
import { createLogger } from '@/utils/logger';

const logger = createLogger('WalletConnect');

type NavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'WalletConnect'
>;
type WalletConnectRouteProp = RouteProp<RootStackParamList, 'WalletConnect'>;

function WalletConnectScreen(): React.JSX.Element {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<WalletConnectRouteProp>();

  const { wallets, activeWalletIndex, activeNetworkChainId } = useWalletStore();
  const activeWallet = wallets[activeWalletIndex];

  const [wcUri, setWcUri] = useState(route.params?.uri || '');
  const [isConnecting, setIsConnecting] = useState(false);
  const [sessions, setSessions] = useState<DAppSession[]>([]);
  const [pendingProposal, setPendingProposal] = useState<any>(null);
  const [signRequest, setSignRequest] = useState<SignRequest | null>(null);
  const [currentRequestDApp, setCurrentRequestDApp] = useState<{
    name: string;
    url: string;
  } | null>(null);

  // Realm WalletConnect 세션 로그 훅
  const { logSessionConnected, logSessionDisconnected } = useWCActiveSessions();

  const { logRequest } = useWCRequestLog();

  // WalletConnect 초기화
  useEffect(() => {
    const initWC = async () => {
      try {
        await wcService.initialize();
        const activeSessions = wcService.getActiveSessions();
        setSessions(activeSessions);
      } catch (error) {
        logger.error('Failed to initialize WalletConnect:', error);
      }
    };

    initWC();

    // 세션 제안 핸들러
    wcService.onSessionProposal(proposal => {
      logger.debug('Session proposal received');
      setPendingProposal(proposal);
    });

    // 세션 요청 핸들러
    wcService.onSessionRequest(async request => {
      logger.debug('Session request received:', request.params.request.method);
      const { topic, params } = request;
      const { request: requestParams } = params;

      // wcService에서 직접 세션 정보 가져오기
      const activeSessions = wcService.getActiveSessions();
      const session = activeSessions.find(s => s.topic === topic);

      logger.debug('Processing request method:', requestParams.method);

      setCurrentRequestDApp({
        name: session?.name || 'Unknown dApp',
        url: session?.url || '',
      });

      // 서명 요청 모달 표시
      setSignRequest({
        id: request.id,
        topic,
        method: requestParams.method,
        params: requestParams.params,
      });
    });
  }, []); // 의존성 배열을 비워서 한 번만 실행

  const handleConnect = useCallback(async () => {
    if (!wcUri.trim()) {
      Alert.alert('오류', 'WalletConnect URI를 입력해주세요.');
      return;
    }

    if (!wcUri.startsWith('wc:')) {
      Alert.alert('오류', '유효한 WalletConnect URI가 아닙니다.');
      return;
    }

    setIsConnecting(true);
    try {
      await wcService.pair(wcUri);
      setWcUri('');
    } catch (error) {
      console.error('Failed to connect:', error);
      Alert.alert('연결 실패', '연결에 실패했습니다. URI를 확인해주세요.');
    } finally {
      setIsConnecting(false);
    }
  }, [wcUri]);

  const handleApproveSession = useCallback(async () => {
    if (!pendingProposal || !activeWallet) return;

    try {
      await wcService.approveSession(pendingProposal, activeWallet.address, [
        activeNetworkChainId,
      ]);

      // Realm에 세션 연결 로그 저장
      const proposer = pendingProposal.params.proposer.metadata;
      const activeSessions = wcService.getActiveSessions();
      const newSession = activeSessions.find(s => s.name === proposer.name);

      if (newSession) {
        await logSessionConnected({
          topic: newSession.topic,
          dappName: proposer.name,
          dappUrl: proposer.url,
          dappIcon: proposer.icons?.[0],
          chains: [`eip155:${activeNetworkChainId}`],
          accounts: [activeWallet.address],
          expiresAt: newSession.expiry
            ? new Date(newSession.expiry * 1000)
            : undefined,
        });
      }

      setPendingProposal(null);
      setSessions(activeSessions);
      Alert.alert('연결 완료', 'dApp과 연결되었습니다.');
    } catch (error) {
      console.error('Failed to approve session:', error);
      Alert.alert('오류', '세션 승인에 실패했습니다.');
    }
  }, [
    pendingProposal,
    activeWallet,
    activeNetworkChainId,
    logSessionConnected,
  ]);

  const handleRejectSession = useCallback(async () => {
    if (!pendingProposal) return;

    try {
      await wcService.rejectSession(pendingProposal);
      setPendingProposal(null);
    } catch (error) {
      console.error('Failed to reject session:', error);
    }
  }, [pendingProposal]);

  const handleDisconnect = useCallback(
    async (topic: string) => {
      Alert.alert('연결 해제', '이 dApp과의 연결을 해제하시겠습니까?', [
        { text: '취소', style: 'cancel' },
        {
          text: '해제',
          style: 'destructive',
          onPress: async () => {
            try {
              await wcService.disconnectSession(topic);
              // Realm에 세션 해제 로그
              await logSessionDisconnected(topic);
              setSessions(wcService.getActiveSessions());
            } catch (error) {
              console.error('Failed to disconnect:', error);
            }
          },
        },
      ]);
    },
    [logSessionDisconnected],
  );

  // 서명 요청 승인
  const handleApproveSignRequest = useCallback(async () => {
    if (!signRequest) return;

    // Realm에 요청 로그 저장 (pending → approved)
    await logRequest({
      sessionTopic: signRequest.topic,
      requestId: signRequest.id,
      method: signRequest.method,
      params: signRequest.params,
      chainId: activeNetworkChainId,
      dappName: currentRequestDApp?.name,
    });

    try {
      logger.debug('Processing sign request:', signRequest.method);

      // 실제 서명 처리
      const result = await signingService.handleRequest(
        signRequest.method,
        signRequest.params,
        activeNetworkChainId,
      );

      logger.info('Sign request completed successfully');

      // 서명 결과를 dApp에 전송
      await wcService.respondRequest(signRequest.topic, signRequest.id, result);

      // 성공 알림
      const isTransaction = signRequest.method.includes('Transaction');
      Alert.alert(
        isTransaction ? '트랜잭션 전송 완료' : '서명 완료',
        isTransaction
          ? `트랜잭션이 블록체인에 전송되었습니다.\n\nTx Hash:\n${result.slice(
              0,
              20,
            )}...`
          : '서명이 완료되었습니다.',
        [{ text: '확인' }],
      );

      setSignRequest(null);
      setCurrentRequestDApp(null);
    } catch (error) {
      logger.error('Failed to sign:', error);

      // 에러 발생 시 dApp에 거부 응답
      try {
        await wcService.rejectRequest(signRequest.topic, signRequest.id);
      } catch (rejectError) {
        console.error('[WC] Failed to reject after error:', rejectError);
      }

      const errorMessage =
        error instanceof Error ? error.message : '알 수 없는 오류';
      Alert.alert(
        '서명 실패',
        `서명 처리 중 오류가 발생했습니다.\n\n${errorMessage}`,
        [{ text: '확인' }],
      );

      setSignRequest(null);
      setCurrentRequestDApp(null);
    }
  }, [signRequest, activeNetworkChainId, currentRequestDApp?.name, logRequest]);

  // 서명 요청 거부
  const handleRejectSignRequest = useCallback(async () => {
    if (!signRequest) return;

    try {
      await wcService.rejectRequest(signRequest.topic, signRequest.id);
      setSignRequest(null);
      setCurrentRequestDApp(null);
    } catch (error) {
      console.error('Failed to reject:', error);
    }
  }, [signRequest]);

  // 현재 네트워크 이름 가져오기
  const activeNetwork = useWalletStore
    .getState()
    .networks.find(n => n.chainId === activeNetworkChainId);

  const renderPendingProposal = () => {
    if (!pendingProposal) return null;

    const { params } = pendingProposal;
    const proposer = params.proposer.metadata;

    return (
      <ProposalCard>
        <ProposalHeader>
          <ProposalIcon>🔗</ProposalIcon>
          <ProposalTitle>연결 요청</ProposalTitle>
        </ProposalHeader>

        <DAppInfo>
          <DAppName>{proposer.name}</DAppName>
          <DAppUrl>{proposer.url}</DAppUrl>
        </DAppInfo>

        <PermissionSection>
          <PermissionTitle>요청 권한:</PermissionTitle>
          <PermissionItem>• 지갑 주소 조회</PermissionItem>
          <PermissionItem>• 트랜잭션 서명 요청</PermissionItem>
          <PermissionItem>• 메시지 서명 요청</PermissionItem>
        </PermissionSection>

        <ButtonRow>
          <SecondaryButton onPress={handleRejectSession}>
            <SecondaryButtonText>거부</SecondaryButtonText>
          </SecondaryButton>
          <PrimaryButton onPress={handleApproveSession}>
            <PrimaryButtonText>연결</PrimaryButtonText>
          </PrimaryButton>
        </ButtonRow>
      </ProposalCard>
    );
  };

  return (
    <Container>
      <StatusBar barStyle="light-content" />
      <ScrollView>
        <Content>
          <Header>
            <BackButton onPress={() => navigation.goBack()}>
              <BackButtonText>←</BackButtonText>
            </BackButton>
            <HeaderTitle>WalletConnect</HeaderTitle>
            <Placeholder />
          </Header>

          {/* 연결 입력 */}
          <ConnectSection>
            <Label>WalletConnect URI</Label>
            <InputRow>
              <URIInput
                value={wcUri}
                onChangeText={setWcUri}
                placeholder="wc:..."
                placeholderTextColor="#71717A"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <ConnectButton onPress={handleConnect} disabled={isConnecting}>
                {isConnecting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <ConnectButtonText>연결</ConnectButtonText>
                )}
              </ConnectButton>
            </InputRow>
            <HintText>
              dApp에서 WalletConnect로 연결 시 표시되는 URI를 붙여넣으세요.
            </HintText>
          </ConnectSection>

          {/* 대기 중인 제안 */}
          {renderPendingProposal()}

          {/* 활성 세션 */}
          <SectionTitle>연결된 dApps</SectionTitle>
          {sessions.length === 0 ? (
            <EmptyState>
              <EmptyIcon>🔌</EmptyIcon>
              <EmptyText>연결된 dApp이 없습니다</EmptyText>
            </EmptyState>
          ) : (
            sessions.map(session => (
              <SessionCard key={session.topic}>
                <SessionInfo>
                  <SessionName>{session.name}</SessionName>
                  <SessionUrl>{session.url}</SessionUrl>
                  <SessionChains>
                    체인: {session.chains.join(', ')}
                  </SessionChains>
                </SessionInfo>
                <DisconnectButton
                  onPress={() => handleDisconnect(session.topic)}
                >
                  <DisconnectText>해제</DisconnectText>
                </DisconnectButton>
              </SessionCard>
            ))
          )}

          {/* 도움말 */}
          <HelpSection>
            <HelpTitle>💡 WalletConnect 사용법</HelpTitle>
            <HelpText>
              1. dApp 웹사이트에서 "WalletConnect"를 선택{'\n'}
              2. 표시되는 QR 코드 대신 "Copy to clipboard" 선택{'\n'}
              3. 복사한 URI를 위 입력창에 붙여넣기{'\n'}
              4. "연결" 버튼을 눌러 연결 완료
            </HelpText>
          </HelpSection>
        </Content>
      </ScrollView>

      {/* 서명 요청 모달 */}
      <SignRequestModal
        visible={!!signRequest}
        request={signRequest}
        dAppName={currentRequestDApp?.name}
        dAppUrl={currentRequestDApp?.url}
        networkName={activeNetwork?.name}
        onApprove={handleApproveSignRequest}
        onReject={handleRejectSignRequest}
      />
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

const ConnectSection = styled.View`
  margin-bottom: ${({ theme }) => theme.spacing.xl}px;
`;

const Label = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const InputRow = styled.View`
  flex-direction: row;
  gap: ${({ theme }) => theme.spacing.sm}px;
`;

const URIInput = styled(TextInput)`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  border-width: 1px;
  border-color: ${({ theme }) => theme.colors.border};
`;

const ConnectButton = styled.TouchableOpacity<{ disabled?: boolean }>`
  background-color: ${({ theme, disabled }) =>
    disabled ? theme.colors.border : theme.colors.primary};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px
    ${({ theme }) => theme.spacing.lg}px;
  justify-content: center;
`;

const ConnectButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.button.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.button.fontWeight};
`;

const HintText = styled.Text`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
`;

const ProposalCard = styled.View`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.lg}px;
  padding: ${({ theme }) => theme.spacing.lg}px;
  margin-bottom: ${({ theme }) => theme.spacing.xl}px;
  border-width: 2px;
  border-color: ${({ theme }) => theme.colors.primary};
`;

const ProposalHeader = styled.View`
  flex-direction: row;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const ProposalIcon = styled.Text`
  font-size: 24px;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const ProposalTitle = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.h3.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.h3.fontWeight};
`;

const DAppInfo = styled.View`
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const DAppName = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  font-weight: 600;
`;

const DAppUrl = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
`;

const PermissionSection = styled.View`
  background-color: ${({ theme }) => theme.colors.background};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const PermissionTitle = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const PermissionItem = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  line-height: 20px;
`;

const ButtonRow = styled.View`
  flex-direction: row;
  gap: ${({ theme }) => theme.spacing.md}px;
`;

const PrimaryButton = styled.TouchableOpacity`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.primary};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  align-items: center;
`;

const PrimaryButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.button.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.button.fontWeight};
`;

const SecondaryButton = styled.TouchableOpacity`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  align-items: center;
  border-width: 1px;
  border-color: ${({ theme }) => theme.colors.border};
`;

const SecondaryButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.button.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.button.fontWeight};
`;

const SectionTitle = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.h3.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.h3.fontWeight};
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const EmptyState = styled.View`
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
`;

const SessionName = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  font-weight: 600;
`;

const SessionUrl = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
`;

const SessionChains = styled.Text`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
`;

const DisconnectButton = styled.TouchableOpacity`
  background-color: ${({ theme }) => theme.colors.error};
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  padding: ${({ theme }) => theme.spacing.xs}px
    ${({ theme }) => theme.spacing.sm}px;
`;

const DisconnectText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
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
