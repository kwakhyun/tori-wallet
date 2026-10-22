/**
 * ETH 전송 화면
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import styled from 'styled-components/native';
import { useShallow } from 'zustand/react/shallow';
import { useTheme } from '@/hooks/useTheme';
import {
  SafeAreaView,
  StatusBar,
  ScrollView,
  Alert,
  ActivityIndicator,
  Keyboard,
  Clipboard,
  Modal,
  Platform,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { useWalletStore } from '@/store/walletStore';
import { useSecurityStore } from '@/store/securityStore';
import { useAddressName } from '@/realm/hooks';
import { useBalance } from '@/hooks/useBalance';
import { txService } from '@/services/txService';
import { signingService } from '@/services/signingService';
import { transferService, TransferPlan } from '@/services/transferService';
import { transactionTracker } from '@/services/transactionTracker';
import { transactionCacheService } from '@/realm/services';
import { QRScanner } from '@/components/common';
import PinConfirmModal from '@/components/common/PinConfirmModal';
import AddressBookScreen from '@/screens/Settings/AddressBookScreen';

type NavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'SendTransaction'
>;

function SendTransactionScreen(): React.JSX.Element {
  const { isDarkMode } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProp<RootStackParamList, 'SendTransaction'>>();
  const tokenAddress = route.params?.tokenAddress;

  const { wallets, activeWalletIndex, activeNetworkChainId, networks } =
    useWalletStore(
      useShallow(state => ({
        wallets: state.wallets,
        activeWalletIndex: state.activeWalletIndex,
        activeNetworkChainId: state.activeNetworkChainId,
        networks: state.networks,
      })),
    );
  const { requiresTransactionPin, addRecentAddress } = useSecurityStore(
    useShallow(state => ({
      requiresTransactionPin: state.requiresTransactionPin,
      addRecentAddress: state.addRecentAddress,
    })),
  );
  const activeWallet = wallets[activeWalletIndex];
  const activeAddress = activeWallet?.address;
  const activeNetwork = networks.find(n => n.chainId === activeNetworkChainId);

  const { data: balance, refetch: refetchBalance } = useBalance(
    activeWallet?.address,
    activeNetworkChainId,
  );

  const { data: tokenBalance, refetch: refetchToken } = useQuery({
    queryKey: [
      'transferToken',
      activeWallet?.address,
      tokenAddress,
      activeNetworkChainId,
    ],
    queryFn: () =>
      transferService.readToken(
        activeWallet.address as `0x${string}`,
        tokenAddress as `0x${string}`,
        activeNetworkChainId,
      ),
    enabled: !!activeWallet && !!tokenAddress,
  });
  const assetBalance = tokenAddress ? tokenBalance : balance;
  const assetSymbol = tokenAddress
    ? tokenBalance?.symbol || '토큰'
    : activeNetwork?.symbol || 'ETH';
  const [plan, setPlan] = useState<TransferPlan | null>(null);
  const sending = useRef(false);
  const mounted = useRef(true);
  const currentAccount = useRef(activeWallet?.address);
  currentAccount.current = activeWallet?.address;
  const currentChain = useRef(activeNetworkChainId);
  currentChain.current = activeNetworkChainId;
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const [toAddress, setToAddress] = useState('');
  const [toAddressName, setToAddressName] = useState<string | null>(null);

  // Realm에서 주소록 이름 조회
  const { name: realmAddressName } = useAddressName(
    txService.validateAddress(toAddress) ? toAddress : undefined,
  );
  const [amount, setAmount] = useState('');
  const [estimatedGas, setEstimatedGas] = useState<string | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isCalculatingMax, setIsCalculatingMax] = useState(false);
  const [step, setStep] = useState<'input' | 'confirm' | 'success'>('input');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [showPinConfirmModal, setShowPinConfirmModal] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showAddressBook, setShowAddressBook] = useState(false);
  const [insufficientFundsError, setInsufficientFundsError] = useState<
    string | null
  >(null);

  // Realm에서 주소록 이름이 바뀌면 UI 업데이트
  useEffect(() => {
    if (realmAddressName) {
      setToAddressName(realmAddressName);
    } else if (toAddress && txService.validateAddress(toAddress)) {
      setToAddressName(null);
    }
  }, [realmAddressName, toAddress]);

  // 주소록에서 주소 선택
  const handleSelectAddressFromBook = useCallback(
    (address: `0x${string}`, name: string) => {
      setToAddress(address);
      setToAddressName(name);
      setShowAddressBook(false);
    },
    [],
  );

  // 클립보드에서 주소 붙여넣기
  const handlePasteAddress = useCallback(async () => {
    try {
      const clipboardContent = await Clipboard.getString();
      if (clipboardContent && txService.validateAddress(clipboardContent)) {
        setToAddress(clipboardContent);
      } else if (clipboardContent) {
        Alert.alert('오류', '클립보드에 유효한 지갑 주소가 없습니다.');
      }
    } catch {
      Alert.alert('오류', '클립보드를 읽을 수 없습니다.');
    }
  }, []);

  // QR 코드 스캔 결과 처리
  const handleQRScan = useCallback((address: string) => {
    if (txService.validateAddress(address)) {
      setToAddress(address);
    } else {
      Alert.alert('오류', '유효하지 않은 지갑 주소입니다.');
    }
  }, []);

  const prepareTransfer = useCallback(() => {
    if (!activeAddress) throw new Error('활성 계정을 찾을 수 없습니다.');
    return transferService.prepare({
      from: activeAddress as `0x${string}`,
      to: toAddress as `0x${string}`,
      amount,
      chainId: activeNetworkChainId,
      tokenAddress: tokenAddress as `0x${string}` | undefined,
    });
  }, [activeAddress, toAddress, amount, activeNetworkChainId, tokenAddress]);

  useEffect(() => {
    let cancelled = false;
    setEstimatedGas(null);
    setInsufficientFundsError(null);
    if (step !== 'input' || !amount || !txService.validateAddress(toAddress)) {
      setIsEstimating(false);
      return;
    }
    setIsEstimating(true);
    const timer = setTimeout(() => {
      prepareTransfer()
        .then(next => {
          if (!cancelled) setEstimatedGas(next.fee);
        })
        .catch(error => {
          if (!cancelled)
            setInsufficientFundsError(
              error instanceof Error
                ? error.message
                : '전송을 확인할 수 없습니다.',
            );
        })
        .finally(() => {
          if (!cancelled) setIsEstimating(false);
        });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [prepareTransfer, step, amount, toAddress]);

  const handleContinue = useCallback(async () => {
    Keyboard.dismiss();
    setIsEstimating(true);
    try {
      const next = await prepareTransfer();
      if (!mounted.current) return;
      setPlan(next);
      setEstimatedGas(next.fee);
      setStep('confirm');
    } catch (error) {
      Alert.alert(
        '오류',
        error instanceof Error ? error.message : '전송을 확인할 수 없습니다.',
      );
    } finally {
      if (mounted.current) setIsEstimating(false);
    }
  }, [prepareTransfer]);

  const handleSendTransaction = useCallback(async () => {
    if (!plan || sending.current) return;
    const snapshot = plan;
    const isAuthorized = () =>
      mounted.current &&
      currentAccount.current === snapshot.from &&
      currentChain.current === snapshot.chainId &&
      Date.now() < snapshot.expiresAt;
    if (!isAuthorized()) {
      Alert.alert(
        '다시 확인해주세요',
        '전송 정보가 만료되었거나 계정이 변경되었습니다.',
      );
      setStep('input');
      return;
    }
    sending.current = true;
    setIsSending(true);
    try {
      const hash = await signingService.sendTransaction(
        snapshot.transaction,
        snapshot.chainId,
        isAuthorized,
      );
      if (mounted.current) {
        setTxHash(hash);
        setStep('success');
      }
      addRecentAddress(snapshot.to);
      try {
        await transactionCacheService.createLocalTransaction({
          hash,
          chainId: snapshot.chainId,
          from: snapshot.from,
          to: snapshot.to,
          value: snapshot.tokenAddress ? '0' : snapshot.amount,
          valueWei: snapshot.transaction.value || '0',
          gasPrice: snapshot.transaction.gasPrice || '0',
          gasLimit: snapshot.transaction.gas,
          type: 'send',
          tokenSymbol: snapshot.symbol || activeNetwork?.symbol,
          tokenAmount: snapshot.amount,
          tokenAddress: snapshot.tokenAddress,
        });
        transactionTracker.reconcile();
      } catch (error) {
        console.warn('Failed to cache pending transaction:', error);
      }
      refetchBalance();
      if (snapshot.tokenAddress) refetchToken();
    } catch (error) {
      if (mounted.current)
        Alert.alert(
          '전송 실패',
          error instanceof Error ? error.message : '전송에 실패했습니다.',
        );
    } finally {
      sending.current = false;
      if (mounted.current) setIsSending(false);
    }
  }, [
    plan,
    activeNetwork?.symbol,
    addRecentAddress,
    refetchBalance,
    refetchToken,
  ]);

  const handleConfirm = useCallback(() => {
    if (requiresTransactionPin()) setShowPinConfirmModal(true);
    else handleSendTransaction();
  }, [requiresTransactionPin, handleSendTransaction]);

  const handlePinConfirmed = useCallback(() => {
    setShowPinConfirmModal(false);
    handleSendTransaction();
  }, [handleSendTransaction]);

  const handleMaxAmount = useCallback(async () => {
    if (tokenAddress) {
      if (tokenBalance) setAmount(tokenBalance.formatted);
      return;
    }
    if (!activeWallet || !txService.validateAddress(toAddress)) {
      Alert.alert('주소 확인', '받는 주소를 먼저 입력해주세요.');
      return;
    }
    setIsCalculatingMax(true);
    try {
      const result = await txService.calculateMaxSendable(
        activeWallet.address as `0x${string}`,
        toAddress as `0x${string}`,
        activeNetworkChainId,
      );
      setAmount(result.maxAmount);
    } catch {
      Alert.alert(
        '오류',
        '최대 금액을 계산하지 못했습니다. 네트워크를 확인해주세요.',
      );
    } finally {
      if (mounted.current) setIsCalculatingMax(false);
    }
  }, [
    tokenAddress,
    tokenBalance,
    activeWallet,
    toAddress,
    activeNetworkChainId,
  ]);

  // 금액 변경 시 에러 클리어
  const handleAmountChange = useCallback((text: string) => {
    setAmount(text);
    setInsufficientFundsError(null);
  }, []);

  const renderInputStep = () => (
    <>
      <FormSection>
        <LabelRow>
          <Label>받는 주소</Label>
          <AddressButtonRow>
            <AddressActionButton
              onPress={() => setShowAddressBook(true)}
              testID="send-address-book-button"
            >
              <AddressActionText>📋 주소록</AddressActionText>
            </AddressActionButton>
            <AddressActionButton
              onPress={handlePasteAddress}
              testID="send-paste-button"
            >
              <AddressActionText>붙여넣기</AddressActionText>
            </AddressActionButton>
            <AddressActionButton
              onPress={() => setShowQRScanner(true)}
              testID="send-qr-button"
            >
              <QRIcon>📷</QRIcon>
              <AddressActionText>QR</AddressActionText>
            </AddressActionButton>
          </AddressButtonRow>
        </LabelRow>
        <Input
          value={toAddress}
          onChangeText={setToAddress}
          placeholder="0x..."
          placeholderTextColor="#71717A"
          autoCapitalize="none"
          autoCorrect={false}
          testID="send-address-input"
        />
        {toAddressName && (
          <AddressNameBadge testID="send-address-name-badge">
            <AddressNameText>📋 {toAddressName}</AddressNameText>
          </AddressNameBadge>
        )}
      </FormSection>

      <FormSection>
        <LabelRow>
          <Label>금액 ({assetSymbol})</Label>
          <MaxButton
            onPress={handleMaxAmount}
            disabled={isCalculatingMax}
            testID="send-max-button"
          >
            <MaxButtonText>
              {isCalculatingMax ? '계산중...' : '최대'}
            </MaxButtonText>
          </MaxButton>
        </LabelRow>
        <Input
          value={amount}
          onChangeText={handleAmountChange}
          placeholder="0.0"
          placeholderTextColor="#71717A"
          keyboardType="decimal-pad"
          testID="send-amount-input"
        />
        <BalanceText testID="send-balance-text">
          잔액: {assetBalance?.formatted || '0'} {assetSymbol}
        </BalanceText>
      </FormSection>

      {isEstimating && (
        <GasEstimate>
          <ActivityIndicator size="small" color="#6366F1" />
          <GasText>가스 추정 중...</GasText>
        </GasEstimate>
      )}

      {isCalculatingMax && (
        <GasEstimate>
          <ActivityIndicator size="small" color="#6366F1" />
          <GasText>최대 금액 계산 중...</GasText>
        </GasEstimate>
      )}

      {estimatedGas && !isEstimating && !insufficientFundsError && (
        <GasEstimate>
          <GasLabel>예상 수수료</GasLabel>
          <GasText>
            ~{parseFloat(estimatedGas).toFixed(6)}{' '}
            {activeNetwork?.symbol || 'ETH'}
          </GasText>
        </GasEstimate>
      )}

      {insufficientFundsError && (
        <ErrorBox>
          <ErrorIcon>⚠️</ErrorIcon>
          <ErrorContent>
            <ErrorTitle>전송 확인 실패</ErrorTitle>
            <ErrorMessage>{insufficientFundsError}</ErrorMessage>
            <ErrorHint>
              주소, 수량, 잔액과 네트워크 상태를 확인해주세요.
            </ErrorHint>
          </ErrorContent>
        </ErrorBox>
      )}

      <Spacer />

      <PrimaryButton
        testID="send-continue-button"
        onPress={handleContinue}
        disabled={
          !toAddress || !amount || !!insufficientFundsError || isEstimating
        }
      >
        <PrimaryButtonText>다음</PrimaryButtonText>
      </PrimaryButton>
    </>
  );

  const planNetwork = networks.find(
    network => network.chainId === plan?.chainId,
  );
  const confirmedSymbol = plan?.symbol || planNetwork?.symbol || assetSymbol;
  const renderConfirmStep = () => (
    <>
      {/* 메인넷 경고 */}
      {!activeNetwork?.isTestnet && (
        <MainnetWarningBox>
          <WarningIcon>🔴</WarningIcon>
          <WarningText>
            메인넷 전송입니다. 실제 {confirmedSymbol}가 전송됩니다.
          </WarningText>
        </MainnetWarningBox>
      )}

      <ConfirmCard>
        <ConfirmRow>
          <ConfirmLabel>보내는 금액</ConfirmLabel>
          <ConfirmValue>
            {plan?.amount || amount} {confirmedSymbol}
          </ConfirmValue>
        </ConfirmRow>
        <ConfirmRow>
          <ConfirmLabel>받는 주소</ConfirmLabel>
          <ConfirmAddress>{plan?.to || toAddress}</ConfirmAddress>
        </ConfirmRow>
        {plan?.tokenAddress && (
          <ConfirmRow>
            <ConfirmLabel>토큰 계약</ConfirmLabel>
            <ConfirmAddress>{plan.tokenAddress}</ConfirmAddress>
          </ConfirmRow>
        )}
        <ConfirmRow>
          <ConfirmLabel>네트워크</ConfirmLabel>
          <ConfirmValue>
            {planNetwork?.name || activeNetwork?.name}
          </ConfirmValue>
        </ConfirmRow>
        <ConfirmRow>
          <ConfirmLabel>
            {[10, 8453, 42161].includes(plan?.chainId || 0)
              ? '최대 실행 수수료 (L1 비용 별도)'
              : '최대 수수료'}
          </ConfirmLabel>
          <ConfirmValue>
            {plan?.fee || estimatedGas || '0'} {planNetwork?.symbol || 'ETH'}
          </ConfirmValue>
        </ConfirmRow>
      </ConfirmCard>

      <WarningBox>
        <WarningIcon>⚠️</WarningIcon>
        <WarningText>
          전송 후에는 취소할 수 없습니다. 주소와 금액을 다시 확인해주세요.
        </WarningText>
      </WarningBox>

      <Spacer />

      <ButtonRow>
        <SecondaryButton onPress={() => setStep('input')} disabled={isSending}>
          <SecondaryButtonText>취소</SecondaryButtonText>
        </SecondaryButton>
        <FlexButton
          testID="send-confirm-button"
          onPress={handleConfirm}
          disabled={isSending}
        >
          {isSending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <PrimaryButtonText>전송</PrimaryButtonText>
          )}
        </FlexButton>
      </ButtonRow>
    </>
  );

  const renderSuccessStep = () => (
    <SuccessContainer>
      <SuccessIcon>✅</SuccessIcon>
      <SuccessTitle>전송 제출 완료</SuccessTitle>
      <SuccessDescription>
        트랜잭션이 네트워크에 전송되었습니다.{'\n'}
        확인까지 몇 분 정도 소요될 수 있습니다.
      </SuccessDescription>

      {txHash && (
        <TxHashContainer>
          <TxHashLabel>트랜잭션 해시</TxHashLabel>
          <TxHashValue numberOfLines={1} ellipsizeMode="middle">
            {txHash}
          </TxHashValue>
        </TxHashContainer>
      )}

      <PrimaryButton onPress={() => navigation.goBack()}>
        <PrimaryButtonText>홈으로</PrimaryButtonText>
      </PrimaryButton>
    </SuccessContainer>
  );

  return (
    <Container testID="send-transaction-screen">
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <StyledScrollView testID="send-scroll">
        <Content>
          <Header>
            <BackButton
              onPress={() => navigation.goBack()}
              testID="send-back-button"
            >
              <BackButtonText>←</BackButtonText>
            </BackButton>
            <HeaderTitle testID="send-header-title">전송</HeaderTitle>
            <Placeholder />
          </Header>

          {step === 'input' && renderInputStep()}
          {step === 'confirm' && renderConfirmStep()}
          {step === 'success' && renderSuccessStep()}
        </Content>
      </StyledScrollView>

      {/* PIN 확인 모달 (보안 설정에 따라) */}
      <PinConfirmModal
        visible={showPinConfirmModal}
        onConfirm={handlePinConfirmed}
        onCancel={() => setShowPinConfirmModal(false)}
        title="트랜잭션 확인"
        message="송금을 진행하려면 PIN을 입력하세요."
      />

      {/* 주소록 모달 */}
      <Modal
        visible={showAddressBook}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddressBook(false)}
      >
        <AddressBookScreen
          selectionMode
          onSelectAddress={handleSelectAddressFromBook}
        />
      </Modal>

      <QRScanner
        visible={showQRScanner}
        onClose={() => setShowQRScanner(false)}
        onScan={handleQRScan}
        title="지갑 주소 스캔"
      />
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
`;

const StyledScrollView = styled(ScrollView).attrs({
  contentContainerStyle: { flexGrow: 1 },
  automaticallyAdjustKeyboardInsets: Platform.OS === 'ios',
  keyboardDismissMode: Platform.OS === 'ios' ? 'on-drag' : undefined,
  keyboardShouldPersistTaps: Platform.OS === 'ios' ? 'handled' : undefined,
})``;

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

const FormSection = styled.View`
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const Label = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const LabelRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const AddressButtonRow = styled.View`
  flex-direction: row;
  gap: ${({ theme }) => theme.spacing.sm}px;
`;

const AddressActionButton = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.xs}px
    ${({ theme }) => theme.spacing.sm}px;
  background-color: ${({ theme }) => theme.colors.primaryLight};
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
`;

const AddressActionText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
`;

const QRIcon = styled.Text`
  font-size: 12px;
  margin-right: 4px;
`;

const MaxButton = styled.TouchableOpacity`
  padding: ${({ theme }) => theme.spacing.xs}px
    ${({ theme }) => theme.spacing.sm}px;
  background-color: ${({ theme }) => theme.colors.primaryLight};
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
`;

const MaxButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
`;

const Input = styled.TextInput`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  border-width: 1px;
  border-color: ${({ theme }) => theme.colors.border};
`;

const BalanceText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
`;

const GasEstimate = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.md}px;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const GasLabel = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
`;

const GasText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
`;

const Spacer = styled.View`
  flex: 1;
`;

const PrimaryButton = styled.TouchableOpacity<{ disabled?: boolean }>`
  background-color: ${({ theme, disabled }) =>
    disabled ? theme.colors.border : theme.colors.primary};
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
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  align-items: center;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const SecondaryButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.button.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.button.fontWeight};
`;

const ButtonRow = styled.View`
  flex-direction: row;
`;

const FlexButton = styled.TouchableOpacity<{ disabled?: boolean }>`
  flex: 1;
  background-color: ${({ theme, disabled }) =>
    disabled ? theme.colors.border : theme.colors.primary};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  align-items: center;
`;

const ConfirmCard = styled.View`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.lg}px;
  padding: ${({ theme }) => theme.spacing.lg}px;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const ConfirmRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.sm}px 0;
  border-bottom-width: 1px;
  border-bottom-color: ${({ theme }) => theme.colors.border};
`;

const ConfirmLabel = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
`;

const ConfirmValue = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  font-weight: 600;
`;

const ConfirmAddress = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  flex: 1;
  text-align: right;
  margin-left: ${({ theme }) => theme.spacing.md}px;
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
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  flex: 1;
`;

const SuccessContainer = styled.View`
  flex: 1;
  justify-content: center;
  align-items: center;
`;

const SuccessIcon = styled.Text`
  font-size: 64px;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const SuccessTitle = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.h2.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.h2.fontWeight};
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const SuccessDescription = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  text-align: center;
  margin-bottom: ${({ theme }) => theme.spacing.xl}px;
`;

const TxHashContainer = styled.View`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.xl}px;
  width: 100%;
`;

const TxHashLabel = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
`;

const TxHashValue = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  font-family: monospace;
`;

const ErrorBox = styled.View`
  flex-direction: row;
  background-color: ${({ theme }) => theme.colors.error}15;
  border: 1px solid ${({ theme }) => theme.colors.error}40;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-top: ${({ theme }) => theme.spacing.md}px;
`;

const ErrorIcon = styled.Text`
  font-size: 24px;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const ErrorContent = styled.View`
  flex: 1;
`;

const ErrorTitle = styled.Text`
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  font-weight: 600;
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
`;

const ErrorMessage = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  line-height: 20px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const ErrorHint = styled.Text`
  color: ${({ theme }) => theme.colors.primary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  line-height: 18px;
`;

const MainnetWarningBox = styled.View`
  flex-direction: row;
  background-color: rgba(239, 68, 68, 0.15);
  border: 1px solid ${({ theme }) => theme.colors.error};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
  align-items: center;
`;

const AddressNameBadge = styled.View`
  background-color: ${({ theme }) => theme.colors.primaryLight};
  padding: ${({ theme }) => theme.spacing.xs}px
    ${({ theme }) => theme.spacing.sm}px;
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
  align-self: flex-start;
`;

const AddressNameText = styled.Text`
  color: ${({ theme }) => theme.colors.primary};
  font-size: 12px;
  font-weight: 600;
`;

export default SendTransactionScreen;
