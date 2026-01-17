/**
 * ETH 전송 화면
 */

import React, { useState, useCallback, useEffect } from 'react';
import styled from 'styled-components/native';
import {
  SafeAreaView,
  StatusBar,
  ScrollView,
  Alert,
  ActivityIndicator,
  Keyboard,
  Clipboard,
  Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { useWalletStore } from '@/store/walletStore';
import { useSecurityStore } from '@/store/securityStore';
import { useAddressName } from '@/realm/hooks';
import { useBalance } from '@/hooks/useBalance';
import { txService } from '@/services/txService';
import { walletService } from '@/services/walletService';
import { chainClient } from '@/services/chainClient';
import { QRScanner } from '@/components/common';
import PinConfirmModal from '@/components/common/PinConfirmModal';
import AddressBookScreen from '@/screens/Settings/AddressBookScreen';
import { parseEther, formatEther, type Chain } from 'viem';

type NavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'SendTransaction'
>;

function SendTransactionScreen(): React.JSX.Element {
  const navigation = useNavigation<NavigationProp>();
  // route params can be used for pre-filling token address if needed

  const { wallets, activeWalletIndex, activeNetworkChainId, networks } =
    useWalletStore();
  const { requirePinForTransaction, addRecentAddress } = useSecurityStore();
  const activeWallet = wallets[activeWalletIndex];
  const activeNetwork = networks.find(n => n.chainId === activeNetworkChainId);

  const { data: balance, refetch: refetchBalance } = useBalance(
    activeWallet?.address,
    activeNetworkChainId,
  );

  const [toAddress, setToAddress] = useState('');
  const [toAddressName, setToAddressName] = useState<string | null>(null);

  // Realm에서 주소록 이름 조회
  const { name: realmAddressName } = useAddressName(
    txService.validateAddress(toAddress) ? toAddress : undefined,
  );
  const [amount, setAmount] = useState('');
  const [estimatedGas, setEstimatedGas] = useState<string | null>(null);
  const [_estimatedGasWei, setEstimatedGasWei] = useState<bigint | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isCalculatingMax, setIsCalculatingMax] = useState(false);
  const [step, setStep] = useState<'input' | 'confirm' | 'success'>('input');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);
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

  // 가스 추정
  const estimateGas = useCallback(async () => {
    if (!toAddress || !amount || !activeWallet) return;

    if (!txService.validateAddress(toAddress)) {
      setEstimatedGas(null);
      setEstimatedGasWei(null);
      setInsufficientFundsError(null);
      return;
    }

    if (!txService.validateAmount(amount)) {
      setEstimatedGas(null);
      setEstimatedGasWei(null);
      setInsufficientFundsError(null);
      return;
    }

    setIsEstimating(true);
    setInsufficientFundsError(null);

    try {
      const estimate = await txService.estimateTransaction({
        from: activeWallet.address as `0x${string}`,
        to: toAddress as `0x${string}`,
        value: amount,
        chainId: activeNetworkChainId,
      });
      setEstimatedGas(estimate.estimatedFee);
      setEstimatedGasWei(estimate.estimatedFeeWei);

      // 잔액 부족 체크 (전송액 + 가스비)
      if (balance?.wei) {
        const valueWei = parseEther(amount);
        const totalRequired = valueWei + estimate.estimatedFeeWei;

        if (totalRequired > balance.wei) {
          const shortfall = totalRequired - balance.wei;
          const shortfallEth = parseFloat(formatEther(shortfall)).toFixed(6);
          setInsufficientFundsError(
            `잔액이 ${shortfallEth} ${
              activeNetwork?.symbol || 'ETH'
            } 부족합니다. 금액을 줄이거나 "최대" 버튼을 사용하세요.`,
          );
        }
      }
    } catch (error) {
      console.error('Gas estimation failed:', error);
      setEstimatedGas(null);
      setEstimatedGasWei(null);

      // 가스 추정 실패도 잔액 부족일 수 있음
      if (error instanceof Error && error.message.includes('insufficient')) {
        setInsufficientFundsError('가스 추정 실패: 잔액이 부족합니다.');
      }
    } finally {
      setIsEstimating(false);
    }
  }, [
    toAddress,
    amount,
    activeWallet,
    activeNetworkChainId,
    balance,
    activeNetwork,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      estimateGas();
    }, 500);
    return () => clearTimeout(timer);
  }, [toAddress, amount, estimateGas]);

  const handleContinue = useCallback(async () => {
    Keyboard.dismiss();

    if (!txService.validateAddress(toAddress)) {
      Alert.alert('오류', '유효하지 않은 주소입니다.');
      return;
    }

    if (!txService.validateAmount(amount)) {
      Alert.alert('오류', '유효하지 않은 금액입니다.');
      return;
    }

    if (balance?.wei) {
      const validation = await txService.validateTransaction(
        {
          from: activeWallet.address as `0x${string}`,
          to: toAddress as `0x${string}`,
          value: amount,
          chainId: activeNetworkChainId,
        },
        balance.wei,
      );

      if (!validation.valid) {
        Alert.alert(
          '오류',
          validation.error || '트랜잭션 검증에 실패했습니다.',
        );
        return;
      }
    }

    setStep('confirm');
  }, [toAddress, amount, balance, activeWallet, activeNetworkChainId]);

  const handleConfirm = useCallback(() => {
    if (requirePinForTransaction) {
      setShowPinConfirmModal(true);
    } else {
      // PIN 확인이 비활성화된 경우 기존 PIN 모달 사용
      setShowPinModal(true);
    }
  }, [requirePinForTransaction]);

  // PIN 확인 후 트랜잭션 실행
  const handlePinConfirmed = useCallback(() => {
    setShowPinConfirmModal(false);
    setShowPinModal(true); // 니모닉 복호화를 위한 PIN 입력
  }, []);

  const handleSendTransaction = useCallback(
    async (pin: string) => {
      setShowPinModal(false);
      setIsSending(true);

      try {
        // PIN으로 니모닉 복호화
        const mnemonic = await walletService.retrieveMnemonicWithPin(pin);
        if (!mnemonic) {
          Alert.alert('오류', 'PIN이 올바르지 않습니다.');
          setIsSending(false);
          return;
        }

        // 계정 복원
        const account = walletService.deriveAccount(mnemonic, 0);

        // 트랜잭션 생성 및 서명
        const client = chainClient.getClient(activeNetworkChainId);
        const valueWei = parseEther(amount);

        // nonce 조회
        const nonce = await client.getTransactionCount({
          address: account.address,
        });

        // 가스 추정
        const gasLimit = await client.estimateGas({
          account: account.address,
          to: toAddress as `0x${string}`,
          value: valueWei,
        });

        const gasPrice = await client.getGasPrice();

        // 트랜잭션 서명 및 전송
        const viemModule = await import('viem');
        const { createWalletClient, http } = viemModule;
        const { sepolia, mainnet, polygon, arbitrum, optimism, base } =
          await import('viem/chains');

        const chainMap: Record<number, Chain> = {
          1: mainnet,
          137: polygon,
          42161: arbitrum,
          10: optimism,
          8453: base,
          11155111: sepolia,
        };

        // 안정적인 Public RPC URLs
        const rpcUrls: Record<number, string> = {
          1: 'https://eth.llamarpc.com',
          137: 'https://polygon-rpc.com',
          42161: 'https://arb1.arbitrum.io/rpc',
          10: 'https://mainnet.optimism.io',
          8453: 'https://mainnet.base.org',
          11155111: 'https://ethereum-sepolia-rpc.publicnode.com',
        };

        const chain = chainMap[activeNetworkChainId] || sepolia;
        const rpcUrl = rpcUrls[activeNetworkChainId] || rpcUrls[11155111];

        const walletClient = createWalletClient({
          account,
          chain,
          transport: http(rpcUrl),
        });

        const hash = await walletClient.sendTransaction({
          chain,
          to: toAddress as `0x${string}`,
          value: valueWei,
          gas: gasLimit,
          gasPrice,
          nonce,
        });

        setTxHash(hash);
        setStep('success');

        // 최근 주소에 추가
        addRecentAddress(toAddress as `0x${string}`);

        refetchBalance();
      } catch (error) {
        console.error('Transaction failed:', error);

        const errorMessage = error instanceof Error ? error.message : '';

        // 잔액 부족 에러 감지
        if (
          errorMessage.includes('insufficient') ||
          errorMessage.includes('exceeds the balance') ||
          errorMessage.includes('gas')
        ) {
          Alert.alert(
            '잔액 부족',
            '전송할 금액과 가스비를 합한 금액이 잔액을 초과합니다.\n\n💡 "최대" 버튼을 사용하여 가스비를 제외한 최대 금액을 자동으로 설정하세요.',
            [{ text: '확인', onPress: () => setStep('input') }],
          );
        } else {
          Alert.alert(
            '전송 실패',
            errorMessage || '트랜잭션 전송에 실패했습니다. 다시 시도해주세요.',
          );
        }
      } finally {
        setIsSending(false);
      }
    },
    [activeNetworkChainId, amount, toAddress, refetchBalance, addRecentAddress],
  );

  const handleMaxAmount = useCallback(async () => {
    if (!balance?.formatted || !activeWallet || !toAddress) {
      // 주소가 없으면 기본 가스비 추정
      if (balance?.formatted) {
        const maxAmount = Math.max(parseFloat(balance.formatted) - 0.001, 0);
        setAmount(maxAmount > 0 ? maxAmount.toString() : '0');
        if (maxAmount <= 0) {
          setInsufficientFundsError('잔액이 가스비를 충당하기에도 부족합니다.');
        }
      }
      return;
    }

    setIsCalculatingMax(true);
    setInsufficientFundsError(null);

    try {
      const { maxAmount, fee } = await txService.calculateMaxSendable(
        activeWallet.address as `0x${string}`,
        toAddress as `0x${string}`,
        activeNetworkChainId,
      );

      const maxNum = parseFloat(maxAmount);
      if (maxNum <= 0) {
        setAmount('0');
        setInsufficientFundsError(
          `잔액이 가스비(약 ${parseFloat(fee).toFixed(6)} ${
            activeNetwork?.symbol || 'ETH'
          })를 충당하기에 부족합니다.`,
        );
      } else {
        // 소수점 6자리로 제한
        setAmount(maxNum.toFixed(6));
      }
    } catch (error) {
      console.error('Max amount calculation failed:', error);
      // 폴백: 고정 가스비 예상
      const maxAmount = Math.max(parseFloat(balance.formatted) - 0.001, 0);
      setAmount(maxAmount > 0 ? maxAmount.toString() : '0');
    } finally {
      setIsCalculatingMax(false);
    }
  }, [balance, activeWallet, toAddress, activeNetworkChainId, activeNetwork]);

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
          <Label>금액 ({activeNetwork?.symbol || 'ETH'})</Label>
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
          잔액: {balance?.formatted || '0'} {activeNetwork?.symbol || 'ETH'}
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
            <ErrorTitle>잔액 부족</ErrorTitle>
            <ErrorMessage>{insufficientFundsError}</ErrorMessage>
            <ErrorHint>
              💡 "최대" 버튼을 눌러 가스비를 제외한 최대 금액을 자동 설정하세요.
            </ErrorHint>
          </ErrorContent>
        </ErrorBox>
      )}

      <Spacer />

      <PrimaryButton
        onPress={handleContinue}
        disabled={
          !toAddress || !amount || !!insufficientFundsError || isEstimating
        }
      >
        <PrimaryButtonText>다음</PrimaryButtonText>
      </PrimaryButton>
    </>
  );

  const renderConfirmStep = () => (
    <>
      {/* 메인넷 경고 */}
      {!activeNetwork?.isTestnet && (
        <MainnetWarningBox>
          <WarningIcon>🔴</WarningIcon>
          <WarningText>
            메인넷 전송입니다. 실제 {activeNetwork?.symbol || 'ETH'}가
            전송됩니다.
          </WarningText>
        </MainnetWarningBox>
      )}

      <ConfirmCard>
        <ConfirmRow>
          <ConfirmLabel>보내는 금액</ConfirmLabel>
          <ConfirmValue>
            {amount} {activeNetwork?.symbol || 'ETH'}
          </ConfirmValue>
        </ConfirmRow>
        <ConfirmRow>
          <ConfirmLabel>받는 주소</ConfirmLabel>
          <ConfirmAddress numberOfLines={1} ellipsizeMode="middle">
            {toAddress}
          </ConfirmAddress>
        </ConfirmRow>
        <ConfirmRow>
          <ConfirmLabel>네트워크</ConfirmLabel>
          <ConfirmValue>{activeNetwork?.name}</ConfirmValue>
        </ConfirmRow>
        <ConfirmRow>
          <ConfirmLabel>예상 수수료</ConfirmLabel>
          <ConfirmValue>
            ~{estimatedGas ? parseFloat(estimatedGas).toFixed(6) : '0'}{' '}
            {activeNetwork?.symbol || 'ETH'}
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
        <SecondaryButton onPress={() => setStep('input')}>
          <SecondaryButtonText>취소</SecondaryButtonText>
        </SecondaryButton>
        <FlexButton onPress={handleConfirm} disabled={isSending}>
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
      <SuccessTitle>전송 완료!</SuccessTitle>
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

  const renderPinModal = () => (
    <ModalOverlay>
      <ModalContent>
        <ModalTitle>PIN 입력</ModalTitle>
        <ModalDescription>
          트랜잭션을 승인하려면 PIN을 입력하세요
        </ModalDescription>
        <PinInput
          value={pinInput}
          onChangeText={setPinInput}
          placeholder="6자리 PIN"
          placeholderTextColor="#71717A"
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
        />
        <ButtonRow>
          <SecondaryButton
            onPress={() => {
              setShowPinModal(false);
              setPinInput('');
            }}
          >
            <SecondaryButtonText>취소</SecondaryButtonText>
          </SecondaryButton>
          <FlexButton
            onPress={() => {
              handleSendTransaction(pinInput);
              setPinInput('');
            }}
            disabled={pinInput.length !== 6}
          >
            <PrimaryButtonText>확인</PrimaryButtonText>
          </FlexButton>
        </ButtonRow>
      </ModalContent>
    </ModalOverlay>
  );

  return (
    <Container testID="send-transaction-screen">
      <StatusBar barStyle="light-content" />
      <StyledScrollView>
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

      {showPinModal && renderPinModal()}

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

const ModalOverlay = styled.View`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.7);
  justify-content: center;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.lg}px;
`;

const ModalContent = styled.View`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.lg}px;
  padding: ${({ theme }) => theme.spacing.xl}px;
  width: 100%;
`;

const ModalTitle = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.h3.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.h3.fontWeight};
  text-align: center;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const ModalDescription = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  text-align: center;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const PinInput = styled.TextInput`
  background-color: ${({ theme }) => theme.colors.background};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 24px;
  text-align: center;
  letter-spacing: 8px;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
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
