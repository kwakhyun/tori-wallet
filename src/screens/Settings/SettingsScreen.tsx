/**
 * 설정 화면 (네트워크 전환, 지갑 관리)
 */

import React, { useCallback, useState, useEffect, useRef } from 'react';
import styled, { ThemeProvider } from 'styled-components/native';
import { useTheme } from '@/hooks/useTheme';
import {
  SafeAreaView,
  StatusBar,
  Alert,
  ScrollView,
  Modal,
  Switch,
  Linking,
  Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useWalletStore } from '@/store/walletStore';
import { useThemeStore, themeModeOptions } from '@/store/themeStore';
import { walletService } from '@/services/walletService';
import { walletResetService } from '@/services/walletResetService';
import { createLogger } from '@/utils/logger';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import type { ThemeMode } from '@/styles/theme';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const logger = createLogger('Settings');

// 앱 정보 상수
const APP_VERSION = '1.0.0';
const SUPPORT_EMAIL = 'khyun9685@gmail.com';
// GitHub Pages에 호스팅하거나, 자체 도메인 사용 시 변경
// 예: https://toriwallet.app/privacy 또는 https://kwakhyun.github.io/tori-wallet/privacy
const PRIVACY_POLICY_URL =
  'https://github.com/kwakhyun/tori-wallet/blob/main/docs/PRIVACY_POLICY.md';
const TERMS_OF_SERVICE_URL =
  'https://github.com/kwakhyun/tori-wallet/blob/main/docs/TERMS_OF_SERVICE.md';

function SettingsScreen(): React.JSX.Element {
  const navigation = useNavigation<NavigationProp>();
  const { theme, isDarkMode } = useTheme();
  const {
    wallets,
    activeWalletIndex,
    networks,
    activeNetworkChainId,
    setActiveNetwork,
    lock,
  } = useWalletStore();

  // 테마 상태
  const { themeMode, setThemeMode, activeTheme } = useThemeStore();

  const activeWallet = wallets[activeWalletIndex];
  const activeNetwork = networks.find(n => n.chainId === activeNetworkChainId);

  const [showNetworkModal, setShowNetworkModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showMnemonicModal, setShowMnemonicModal] = useState(false);
  const [showPinChangeModal, setShowPinChangeModal] = useState(false);
  const [showBiometricPinModal, setShowBiometricPinModal] = useState(false);
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinStep, setPinStep] = useState<'verify' | 'new' | 'confirm'>(
    'verify',
  );
  const [isLoading, setIsLoading] = useState(false);
  const [displayProgress, setDisplayProgress] = useState(0);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);

  // 애니메이션 값
  const animatedProgress = useRef(new Animated.Value(0)).current;

  // 애니메이션 값 변화 리스너 (텍스트 동기화)
  useEffect(() => {
    const listenerId = animatedProgress.addListener(({ value }) => {
      setDisplayProgress(Math.round(value));
    });
    return () => {
      animatedProgress.removeListener(listenerId);
    };
  }, [animatedProgress]);

  // 구간별 진행률 표시 (부드러운 애니메이션)
  const setProgress = useCallback(
    (value: number) => {
      Animated.timing(animatedProgress, {
        toValue: value,
        duration: 300,
        useNativeDriver: false,
      }).start();
    },
    [animatedProgress],
  );

  // 생체인증 지원 여부 및 설정 확인
  useEffect(() => {
    const checkBiometric = async () => {
      const supported = await walletService.isBiometricSupported();
      setBiometricSupported(supported);

      setBiometricEnabled(await walletService.isBiometricEnabled());
    };
    checkBiometric();
  }, []);

  const handleSelectNetwork = useCallback(
    (chainId: number) => {
      const selectedNetwork = networks.find(n => n.chainId === chainId);

      // 테스트넷에서 메인넷으로 전환할 때 경고
      if (activeNetwork?.isTestnet && !selectedNetwork?.isTestnet) {
        Alert.alert(
          '⚠️ 메인넷 전환',
          `${selectedNetwork?.name}은(는) 실제 자산이 사용되는 네트워크입니다.\n\n거래 시 실제 암호화폐가 소모되며, 잘못된 전송은 복구할 수 없습니다.\n\n계속하시겠습니까?`,
          [
            { text: '취소', style: 'cancel' },
            {
              text: '전환',
              onPress: () => {
                setActiveNetwork(chainId);
                setShowNetworkModal(false);
              },
            },
          ],
        );
      } else {
        setActiveNetwork(chainId);
        setShowNetworkModal(false);
      }
    },
    [setActiveNetwork, activeNetwork, networks],
  );

  // 테마 선택 핸들러
  const handleSelectTheme = useCallback(
    (mode: ThemeMode) => {
      setThemeMode(mode);
      setShowThemeModal(false);
    },
    [setThemeMode],
  );

  // 현재 테마 모드 레이블 가져오기
  const getThemeModeLabel = useCallback(() => {
    const option = themeModeOptions.find(opt => opt.value === themeMode);
    return option?.label || '시스템 설정';
  }, [themeMode]);

  // 테마 아이콘 가져오기
  const getThemeIcon = useCallback(() => {
    if (themeMode === 'system') return '📱';
    if (themeMode === 'light') return '☀️';
    return '🌙';
  }, [themeMode]);

  // 복구 구문 보기
  const handleViewMnemonic = useCallback(() => {
    Alert.alert(
      '⚠️ 주의',
      '복구 구문은 지갑의 모든 자산에 접근할 수 있는 열쇠입니다.\n\n절대로 다른 사람에게 보여주지 마세요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '확인',
          onPress: () => {
            setPinInput('');
            setMnemonic(null);
            setShowMnemonicModal(true);
          },
        },
      ],
    );
  }, []);

  const handleVerifyPinForMnemonic = useCallback(async () => {
    if (pinInput.length !== 6) {
      Alert.alert('오류', 'PIN은 6자리입니다.');
      return;
    }

    setIsLoading(true);
    setProgress(10);

    // 진행률 업데이트 간 딜레이
    await new Promise(resolve => setTimeout(resolve, 200));
    setProgress(30);
    await new Promise(resolve => setTimeout(resolve, 200));
    setProgress(50);

    try {
      const retrievedMnemonic = await walletService.retrieveMnemonicWithPin(
        pinInput,
      );

      await new Promise(resolve => setTimeout(resolve, 150));
      setProgress(70);
      await new Promise(resolve => setTimeout(resolve, 150));
      setProgress(85);

      if (
        retrievedMnemonic &&
        walletService.validateMnemonic(retrievedMnemonic)
      ) {
        await new Promise(resolve => setTimeout(resolve, 100));
        setProgress(100);
        setMnemonic(retrievedMnemonic);
      } else {
        setProgress(0);
        Alert.alert('오류', 'PIN이 올바르지 않습니다.');
      }
    } catch {
      setProgress(0);
      Alert.alert('오류', 'PIN 확인에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [pinInput, setProgress]);

  // PIN 변경
  const handleChangePin = useCallback(() => {
    setPinInput('');
    setNewPin('');
    setConfirmPin('');
    setPinStep('verify');
    setShowPinChangeModal(true);
  }, []);

  const handlePinChangeStep = useCallback(async () => {
    if (pinStep === 'verify') {
      if (pinInput.length !== 6) {
        Alert.alert('오류', 'PIN은 6자리입니다.');
        return;
      }

      setIsLoading(true);
      setProgress(10);

      // 진행률 업데이트 간 딜레이
      await new Promise(resolve => setTimeout(resolve, 200));
      setProgress(30);
      await new Promise(resolve => setTimeout(resolve, 200));
      setProgress(50);

      try {
        const retrievedMnemonic = await walletService.retrieveMnemonicWithPin(
          pinInput,
        );

        await new Promise(resolve => setTimeout(resolve, 150));
        setProgress(70);
        await new Promise(resolve => setTimeout(resolve, 150));
        setProgress(85);

        if (
          retrievedMnemonic &&
          walletService.validateMnemonic(retrievedMnemonic)
        ) {
          await new Promise(resolve => setTimeout(resolve, 100));
          setProgress(100);
          setMnemonic(retrievedMnemonic);
          setPinStep('new');
          setPinInput('');
        } else {
          setProgress(0);
          Alert.alert('오류', '현재 PIN이 올바르지 않습니다.');
        }
      } catch {
        setProgress(0);
        Alert.alert('오류', 'PIN 확인에 실패했습니다.');
      } finally {
        setIsLoading(false);
      }
    } else if (pinStep === 'new') {
      if (newPin.length !== 6) {
        Alert.alert('오류', 'PIN은 6자리입니다.');
        return;
      }
      setPinStep('confirm');
    } else if (pinStep === 'confirm') {
      if (confirmPin !== newPin) {
        Alert.alert('오류', 'PIN이 일치하지 않습니다.');
        return;
      }

      if (!mnemonic) {
        Alert.alert('오류', '니모닉을 찾을 수 없습니다.');
        return;
      }

      setIsLoading(true);
      setProgress(10);

      // 진행률 업데이트 간 딜레이
      await new Promise(resolve => setTimeout(resolve, 200));
      setProgress(30);
      await new Promise(resolve => setTimeout(resolve, 200));
      setProgress(50);

      try {
        await walletService.storeMnemonic(mnemonic, newPin);

        await new Promise(resolve => setTimeout(resolve, 150));
        setProgress(70);
        await new Promise(resolve => setTimeout(resolve, 150));
        setProgress(85);
        await new Promise(resolve => setTimeout(resolve, 100));
        setProgress(100);
        Alert.alert('완료', 'PIN이 변경되었습니다.');
        setShowPinChangeModal(false);
      } catch {
        setProgress(0);
        Alert.alert('오류', 'PIN 변경에 실패했습니다.');
      } finally {
        setIsLoading(false);
        setMnemonic(null);
      }
    }
  }, [pinStep, pinInput, newPin, confirmPin, mnemonic, setProgress]);

  // 생체인증 토글
  const handleToggleBiometric = useCallback(
    async (value: boolean) => {
      if (value && !biometricSupported) {
        Alert.alert('알림', '이 기기에서는 생체인증을 사용할 수 없습니다.');
        return;
      }

      if (value) {
        // 생체인증 활성화 전 PIN 확인 모달 표시
        setPinInput('');
        setShowBiometricPinModal(true);
      } else {
        await walletService.disableBiometric();
        setBiometricEnabled(false);
        Alert.alert('완료', '생체인증이 비활성화되었습니다.');
      }
    },
    [biometricSupported],
  );

  // 생체인증 활성화를 위한 PIN 확인
  const handleVerifyPinForBiometric = useCallback(async () => {
    if (pinInput.length !== 6) {
      Alert.alert('오류', 'PIN은 6자리입니다.');
      return;
    }

    setIsLoading(true);
    setProgress(10);

    // 진행률 업데이트 간 딜레이
    await new Promise(resolve => setTimeout(resolve, 200));
    setProgress(30);
    await new Promise(resolve => setTimeout(resolve, 200));
    setProgress(50);

    try {
      const retrievedMnemonic = await walletService.retrieveMnemonicWithPin(
        pinInput,
      );

      await new Promise(resolve => setTimeout(resolve, 150));
      setProgress(70);
      await new Promise(resolve => setTimeout(resolve, 150));
      setProgress(85);

      if (
        retrievedMnemonic &&
        walletService.validateMnemonic(retrievedMnemonic)
      ) {
        await new Promise(resolve => setTimeout(resolve, 100));
        setProgress(100);
        await walletService.enableBiometric(retrievedMnemonic);
        setBiometricEnabled(true);
        setShowBiometricPinModal(false);
        Alert.alert('완료', '생체인증이 활성화되었습니다.');
      } else {
        setProgress(0);
        Alert.alert('오류', 'PIN이 올바르지 않습니다.');
      }
    } catch {
      setProgress(0);
      Alert.alert('오류', '생체인증 활성화에 실패했습니다.');
    } finally {
      setIsLoading(false);
      setPinInput('');
    }
  }, [pinInput, setProgress]);

  const closeBiometricPinModal = () => {
    setShowBiometricPinModal(false);
    setPinInput('');
  };

  const handleResetWallet = useCallback(() => {
    Alert.alert(
      '지갑 초기화',
      '모든 데이터가 삭제됩니다. 복구 구문을 백업하셨나요?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '초기화',
          style: 'destructive',
          onPress: async () => {
            try {
              await walletResetService.reset();
            } catch (error) {
              logger.error('Failed to reset wallet:', error);
              Alert.alert('오류', '초기화에 실패했습니다.');
            }
          },
        },
      ],
    );
  }, []);

  // 로그아웃 (지갑 데이터 유지, 잠금 상태로 전환)
  const handleLogout = useCallback(() => {
    Alert.alert(
      '로그아웃',
      '앱이 잠금 상태로 전환됩니다.\n다시 사용하려면 PIN을 입력해야 합니다.\n\n지갑 데이터는 그대로 유지됩니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '로그아웃',
          onPress: () => {
            lock();
            logger.info('User logged out - wallet locked');
          },
        },
      ],
    );
  }, [lock]);

  // 다른 지갑 가져오기 (현재 지갑 삭제 후 새로 가져오기)
  const handleSwitchWallet = useCallback(() => {
    Alert.alert(
      '지갑 전환',
      '현재 지갑을 삭제하고 다른 지갑을 가져옵니다.\n\n⚠️ 현재 지갑의 복구 구문을 백업하셨는지 확인하세요!\n\n이 작업은 되돌릴 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '복구 구문 확인',
          onPress: handleViewMnemonic,
        },
        {
          text: '지갑 전환',
          style: 'destructive',
          onPress: async () => {
            try {
              await walletResetService.reset();
              logger.info('Wallet cleared - ready for new import');
            } catch (error) {
              logger.error('Failed to switch wallet:', error);
              Alert.alert('오류', '지갑 전환에 실패했습니다.');
            }
          },
        },
      ],
    );
  }, [handleViewMnemonic]);

  const truncateAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 10)}...${address.slice(-8)}`;
  };

  const closeMnemonicModal = () => {
    setShowMnemonicModal(false);
    setMnemonic(null);
    setPinInput('');
  };

  const closePinChangeModal = () => {
    setShowPinChangeModal(false);
    setMnemonic(null);
    setPinInput('');
    setNewPin('');
    setConfirmPin('');
    setPinStep('verify');
  };

  // 문의하기 (이메일)
  const handleContactSupport = useCallback(() => {
    const subject = encodeURIComponent('[Tori Wallet] 문의');
    const body = encodeURIComponent(
      `\n\n---\n앱 버전: ${APP_VERSION}\n기기 정보: ${
        require('react-native').Platform.OS
      }`,
    );
    const mailtoUrl = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;

    Linking.openURL(mailtoUrl).catch(() => {
      Alert.alert(
        '이메일 앱 없음',
        `이메일 앱을 열 수 없습니다.\n\n문의 이메일: ${SUPPORT_EMAIL}`,
        [{ text: '확인' }],
      );
    });
  }, []);

  // 개인정보 처리방침
  const handleOpenPrivacyPolicy = useCallback(() => {
    Linking.openURL(PRIVACY_POLICY_URL).catch(() => {
      Alert.alert('오류', '링크를 열 수 없습니다.');
    });
  }, []);

  // 이용약관
  const handleOpenTermsOfService = useCallback(() => {
    Linking.openURL(TERMS_OF_SERVICE_URL).catch(() => {
      Alert.alert('오류', '링크를 열 수 없습니다.');
    });
  }, []);

  return (
    <Container>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScrollView>
        <Content>
          <Title>설정</Title>

          {/* 현재 지갑 정보 */}
          {activeWallet && (
            <Section>
              <SectionTitle>현재 지갑</SectionTitle>
              <InfoCard>
                <InfoLabel>주소</InfoLabel>
                <InfoValue selectable>
                  {truncateAddress(activeWallet.address)}
                </InfoValue>
              </InfoCard>
            </Section>
          )}

          {/* 네트워크 설정 */}
          <Section>
            <SectionTitle>네트워크</SectionTitle>
            <SettingItem onPress={() => setShowNetworkModal(true)}>
              <SettingLeft>
                <NetworkDot $isTestnet={activeNetwork?.isTestnet} />
                <SettingText>{activeNetwork?.name || 'Unknown'}</SettingText>
              </SettingLeft>
              <ArrowText>변경 ›</ArrowText>
            </SettingItem>
          </Section>

          {/* 테마/외관 설정 */}
          <Section>
            <SectionTitle>외관</SectionTitle>
            <SettingItem onPress={() => setShowThemeModal(true)}>
              <SettingLeft>
                <SettingIcon>{getThemeIcon()}</SettingIcon>
                <SettingTextContainer>
                  <SettingText>테마</SettingText>
                  <SettingSubText>{getThemeModeLabel()}</SettingSubText>
                </SettingTextContainer>
              </SettingLeft>
              <ArrowText>변경 ›</ArrowText>
            </SettingItem>
          </Section>

          {/* 보안 설정 */}
          <Section>
            <SectionTitle>보안</SectionTitle>
            <SettingItem
              onPress={() => navigation.navigate('SecuritySettings')}
            >
              <SettingText>🔐 보안 설정</SettingText>
              <ArrowText>›</ArrowText>
            </SettingItem>
            <SettingItem onPress={handleViewMnemonic}>
              <SettingText>복구 구문 보기</SettingText>
              <ArrowText>›</ArrowText>
            </SettingItem>
            <SettingItem onPress={handleChangePin}>
              <SettingText>PIN 변경</SettingText>
              <ArrowText>›</ArrowText>
            </SettingItem>
            <SettingItemRow>
              <SettingText>생체 인증</SettingText>
              <Switch
                value={biometricEnabled}
                onValueChange={handleToggleBiometric}
                disabled={!biometricSupported}
                trackColor={{
                  false: theme.colors.border,
                  true: theme.colors.primary,
                }}
                thumbColor={
                  biometricEnabled
                    ? theme.colors.textPrimary
                    : theme.colors.textSecondary
                }
              />
            </SettingItemRow>
            {!biometricSupported && (
              <DisabledHint>
                이 기기에서 생체인증을 사용할 수 없습니다
              </DisabledHint>
            )}
          </Section>

          {/* 앱 정보 */}
          <Section>
            <SectionTitle>정보</SectionTitle>
            <SettingItem>
              <SettingText>버전</SettingText>
              <ArrowText>1.0.0</ArrowText>
            </SettingItem>
            <SettingItem>
              <SettingText>개발자 모드</SettingText>
              <ArrowText>활성화 ›</ArrowText>
            </SettingItem>
          </Section>

          {/* 지갑 관리 */}
          <Section>
            <SectionTitle>지갑 관리</SectionTitle>
            <SettingItem onPress={handleLogout}>
              <SettingLeft>
                <SettingIcon>🔒</SettingIcon>
                <SettingTextContainer>
                  <SettingText>잠금</SettingText>
                  <SettingSubText>앱을 잠금 상태로 전환</SettingSubText>
                </SettingTextContainer>
              </SettingLeft>
              <ArrowText>›</ArrowText>
            </SettingItem>
            <SettingItem onPress={handleSwitchWallet}>
              <SettingLeft>
                <SettingIcon>🔄</SettingIcon>
                <SettingTextContainer>
                  <SettingText>지갑 전환</SettingText>
                  <SettingSubText>다른 복구 구문으로 지갑 교체</SettingSubText>
                </SettingTextContainer>
              </SettingLeft>
              <ArrowText>›</ArrowText>
            </SettingItem>
          </Section>

          {/* 앱 정보 */}
          <Section>
            <SectionTitle>앱 정보</SectionTitle>
            <SettingItem onPress={handleContactSupport}>
              <SettingLeft>
                <SettingIcon>📧</SettingIcon>
                <SettingTextContainer>
                  <SettingText>문의하기</SettingText>
                  <SettingSubText>{SUPPORT_EMAIL}</SettingSubText>
                </SettingTextContainer>
              </SettingLeft>
              <ArrowText>›</ArrowText>
            </SettingItem>
            <SettingItem onPress={handleOpenPrivacyPolicy}>
              <SettingLeft>
                <SettingIcon>🔐</SettingIcon>
                <SettingTextContainer>
                  <SettingText>개인정보 처리방침</SettingText>
                </SettingTextContainer>
              </SettingLeft>
              <ArrowText>›</ArrowText>
            </SettingItem>
            <SettingItem onPress={handleOpenTermsOfService}>
              <SettingLeft>
                <SettingIcon>📋</SettingIcon>
                <SettingTextContainer>
                  <SettingText>이용약관</SettingText>
                </SettingTextContainer>
              </SettingLeft>
              <ArrowText>›</ArrowText>
            </SettingItem>
            <SettingItem>
              <SettingLeft>
                <SettingIcon>ℹ️</SettingIcon>
                <SettingTextContainer>
                  <SettingText>앱 버전</SettingText>
                </SettingTextContainer>
              </SettingLeft>
              <ArrowText>{APP_VERSION}</ArrowText>
            </SettingItem>
          </Section>

          {/* 위험 영역 */}
          <Section>
            <SectionTitle>위험</SectionTitle>
            <DangerButton onPress={handleResetWallet}>
              <DangerButtonText>🗑️ 지갑 완전 삭제</DangerButtonText>
            </DangerButton>
            <DangerHint>모든 데이터가 영구적으로 삭제됩니다</DangerHint>
          </Section>
        </Content>
      </ScrollView>

      {/* 네트워크 선택 모달 */}
      <Modal
        visible={showNetworkModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowNetworkModal(false)}
      >
        <ThemeProvider theme={activeTheme}>
          <ModalContainer>
            <ModalHeader>
              <ModalTitle>네트워크 선택</ModalTitle>
              <CloseButton onPress={() => setShowNetworkModal(false)}>
                <CloseButtonText>✕</CloseButtonText>
              </CloseButton>
            </ModalHeader>
            <ModalContent>
              {/* 메인넷 섹션 */}
              <NetworkSectionTitle>메인넷 (실제 자산)</NetworkSectionTitle>
              {networks
                .filter(n => !n.isTestnet)
                .map(network => (
                  <NetworkItem
                    key={network.chainId}
                    onPress={() => handleSelectNetwork(network.chainId)}
                    $isActive={network.chainId === activeNetworkChainId}
                  >
                    <NetworkInfo>
                      <NetworkDot $isTestnet={network.isTestnet} />
                      <NetworkItemInfo>
                        <NetworkItemName>{network.name}</NetworkItemName>
                        <NetworkItemSymbol>{network.symbol}</NetworkItemSymbol>
                      </NetworkItemInfo>
                    </NetworkInfo>
                    {network.chainId === activeNetworkChainId && (
                      <CheckMark>✓</CheckMark>
                    )}
                  </NetworkItem>
                ))}

              {/* 테스트넷 섹션 */}
              <NetworkSectionTitle>테스트넷 (무료 테스트)</NetworkSectionTitle>
              {networks
                .filter(n => n.isTestnet)
                .map(network => (
                  <NetworkItem
                    key={network.chainId}
                    onPress={() => handleSelectNetwork(network.chainId)}
                    $isActive={network.chainId === activeNetworkChainId}
                  >
                    <NetworkInfo>
                      <NetworkDot $isTestnet={network.isTestnet} />
                      <NetworkItemInfo>
                        <NetworkItemName>{network.name}</NetworkItemName>
                        <NetworkItemSymbol>{network.symbol}</NetworkItemSymbol>
                      </NetworkItemInfo>
                    </NetworkInfo>
                    {network.chainId === activeNetworkChainId && (
                      <CheckMark>✓</CheckMark>
                    )}
                  </NetworkItem>
                ))}
            </ModalContent>
          </ModalContainer>
        </ThemeProvider>
      </Modal>

      {/* 테마 선택 모달 */}
      <Modal
        visible={showThemeModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowThemeModal(false)}
      >
        <ThemeProvider theme={activeTheme}>
          <ModalContainer>
            <ModalHeader>
              <ModalTitle>테마 선택</ModalTitle>
              <CloseButton onPress={() => setShowThemeModal(false)}>
                <CloseButtonText>✕</CloseButtonText>
              </CloseButton>
            </ModalHeader>
            <ModalContent>
              {themeModeOptions.map(option => (
                <ThemeItem
                  key={option.value}
                  onPress={() => handleSelectTheme(option.value)}
                  $isActive={themeMode === option.value}
                >
                  <ThemeItemLeft>
                    <ThemeIcon>
                      {option.value === 'system'
                        ? '📱'
                        : option.value === 'light'
                        ? '☀️'
                        : '🌙'}
                    </ThemeIcon>
                    <ThemeItemInfo>
                      <ThemeItemName>{option.label}</ThemeItemName>
                      <ThemeItemDescription>
                        {option.value === 'system'
                          ? '기기 설정에 따라 자동 변경'
                          : option.value === 'light'
                          ? '밝은 배경의 라이트 모드'
                          : '어두운 배경의 다크 모드'}
                      </ThemeItemDescription>
                    </ThemeItemInfo>
                  </ThemeItemLeft>
                  {themeMode === option.value && <CheckMark>✓</CheckMark>}
                </ThemeItem>
              ))}
            </ModalContent>
          </ModalContainer>
        </ThemeProvider>
      </Modal>

      {/* 복구 구문 보기 모달 */}
      <Modal
        visible={showMnemonicModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeMnemonicModal}
      >
        <ThemeProvider theme={activeTheme}>
          <ModalContainer>
            <ModalHeader>
              <ModalTitle>복구 구문</ModalTitle>
              <CloseButton onPress={closeMnemonicModal}>
                <CloseButtonText>✕</CloseButtonText>
              </CloseButton>
            </ModalHeader>
            <ModalContent>
              {!mnemonic ? (
                <PinSection>
                  <PinDescription>
                    복구 구문을 보려면 PIN을 입력하세요.
                  </PinDescription>
                  <PinInput
                    value={pinInput}
                    onChangeText={setPinInput}
                    placeholder="6자리 PIN"
                    placeholderTextColor={theme.colors.textMuted}
                    keyboardType="number-pad"
                    maxLength={6}
                    secureTextEntry
                  />
                  {isLoading ? (
                    <LoadingProgressContainer>
                      <LoadingPercentText>
                        {displayProgress}%
                      </LoadingPercentText>
                      <LoadingBarContainer>
                        <AnimatedLoadingBarFill
                          style={{
                            width: animatedProgress.interpolate({
                              inputRange: [0, 100],
                              outputRange: ['0%', '100%'],
                            }),
                          }}
                        />
                      </LoadingBarContainer>
                      <LoadingStatusText>확인 중...</LoadingStatusText>
                    </LoadingProgressContainer>
                  ) : (
                    <PrimaryButton
                      onPress={handleVerifyPinForMnemonic}
                      disabled={isLoading}
                    >
                      <PrimaryButtonText>확인</PrimaryButtonText>
                    </PrimaryButton>
                  )}
                </PinSection>
              ) : (
                <MnemonicSection>
                  <WarningBox>
                    <WarningIcon>⚠️</WarningIcon>
                    <WarningText>
                      절대로 이 구문을 다른 사람에게 보여주지 마세요!{'\n'}
                      스크린샷도 찍지 마세요!
                    </WarningText>
                  </WarningBox>
                  <MnemonicGrid>
                    {mnemonic.split(' ').map((word, index) => (
                      <MnemonicWord key={index}>
                        <MnemonicIndex>{index + 1}</MnemonicIndex>
                        <MnemonicText>{word}</MnemonicText>
                      </MnemonicWord>
                    ))}
                  </MnemonicGrid>
                </MnemonicSection>
              )}
            </ModalContent>
          </ModalContainer>
        </ThemeProvider>
      </Modal>

      {/* PIN 변경 모달 */}
      <Modal
        visible={showPinChangeModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closePinChangeModal}
      >
        <ThemeProvider theme={activeTheme}>
          <ModalContainer>
            <ModalHeader>
              <ModalTitle>PIN 변경</ModalTitle>
              <CloseButton onPress={closePinChangeModal}>
                <CloseButtonText>✕</CloseButtonText>
              </CloseButton>
            </ModalHeader>
            <ModalContent>
              <PinSection>
                {pinStep === 'verify' && (
                  <>
                    <PinDescription>현재 PIN을 입력하세요.</PinDescription>
                    <PinInput
                      value={pinInput}
                      onChangeText={setPinInput}
                      placeholder="현재 PIN (6자리)"
                      placeholderTextColor={theme.colors.textMuted}
                      keyboardType="number-pad"
                      maxLength={6}
                      secureTextEntry
                    />
                  </>
                )}
                {pinStep === 'new' && (
                  <>
                    <PinDescription>새로운 PIN을 입력하세요.</PinDescription>
                    <PinInput
                      value={newPin}
                      onChangeText={setNewPin}
                      placeholder="새 PIN (6자리)"
                      placeholderTextColor={theme.colors.textMuted}
                      keyboardType="number-pad"
                      maxLength={6}
                      secureTextEntry
                    />
                  </>
                )}
                {pinStep === 'confirm' && (
                  <>
                    <PinDescription>새 PIN을 다시 입력하세요.</PinDescription>
                    <PinInput
                      value={confirmPin}
                      onChangeText={setConfirmPin}
                      placeholder="PIN 확인 (6자리)"
                      placeholderTextColor={theme.colors.textMuted}
                      keyboardType="number-pad"
                      maxLength={6}
                      secureTextEntry
                    />
                  </>
                )}
                <PinStepIndicator>
                  <StepDot $active={pinStep === 'verify'} />
                  <StepDot $active={pinStep === 'new'} />
                  <StepDot $active={pinStep === 'confirm'} />
                </PinStepIndicator>
                {isLoading ? (
                  <LoadingProgressContainer>
                    <LoadingPercentText>{displayProgress}%</LoadingPercentText>
                    <LoadingBarContainer>
                      <AnimatedLoadingBarFill
                        style={{
                          width: animatedProgress.interpolate({
                            inputRange: [0, 100],
                            outputRange: ['0%', '100%'],
                          }),
                        }}
                      />
                    </LoadingBarContainer>
                    <LoadingStatusText>처리 중...</LoadingStatusText>
                  </LoadingProgressContainer>
                ) : (
                  <PrimaryButton
                    onPress={handlePinChangeStep}
                    disabled={isLoading}
                  >
                    <PrimaryButtonText>
                      {pinStep === 'confirm' ? '완료' : '다음'}
                    </PrimaryButtonText>
                  </PrimaryButton>
                )}
              </PinSection>
            </ModalContent>
          </ModalContainer>
        </ThemeProvider>
      </Modal>

      {/* 생체인증 PIN 확인 모달 */}
      <Modal
        visible={showBiometricPinModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeBiometricPinModal}
      >
        <ThemeProvider theme={activeTheme}>
          <ModalContainer>
            <ModalHeader>
              <ModalTitle>생체인증 활성화</ModalTitle>
              <CloseButton onPress={closeBiometricPinModal}>
                <CloseButtonText>✕</CloseButtonText>
              </CloseButton>
            </ModalHeader>
            <ModalContent>
              <PinSection>
                <PinDescription>
                  생체인증을 활성화하려면 PIN을 입력하세요.
                </PinDescription>
                <PinInput
                  value={pinInput}
                  onChangeText={setPinInput}
                  placeholder="6자리 PIN"
                  placeholderTextColor={theme.colors.textMuted}
                  keyboardType="number-pad"
                  maxLength={6}
                  secureTextEntry
                />
                {isLoading ? (
                  <LoadingProgressContainer>
                    <LoadingPercentText>{displayProgress}%</LoadingPercentText>
                    <LoadingBarContainer>
                      <AnimatedLoadingBarFill
                        style={{
                          width: animatedProgress.interpolate({
                            inputRange: [0, 100],
                            outputRange: ['0%', '100%'],
                          }),
                        }}
                      />
                    </LoadingBarContainer>
                    <LoadingStatusText>확인 중...</LoadingStatusText>
                  </LoadingProgressContainer>
                ) : (
                  <PrimaryButton
                    onPress={handleVerifyPinForBiometric}
                    disabled={isLoading}
                  >
                    <PrimaryButtonText>확인</PrimaryButtonText>
                  </PrimaryButton>
                )}
              </PinSection>
            </ModalContent>
          </ModalContainer>
        </ThemeProvider>
      </Modal>
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

const Title = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.h2.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.h2.fontWeight};
  margin-bottom: ${({ theme }) => theme.spacing.xl}px;
`;

const Section = styled.View`
  margin-bottom: ${({ theme }) => theme.spacing.xl}px;
`;

const SectionTitle = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
  text-transform: uppercase;
`;

const InfoCard = styled.View`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
`;

const InfoLabel = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
`;

const InfoValue = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  font-family: monospace;
`;

const SettingItem = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const SettingLeft = styled.View`
  flex-direction: row;
  align-items: center;
`;

const NetworkDot = styled.View<{ $isTestnet?: boolean }>`
  width: 10px;
  height: 10px;
  border-radius: 5px;
  background-color: ${({ theme, $isTestnet }) =>
    $isTestnet ? theme.colors.warning : theme.colors.success};
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const SettingText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
`;

const SettingTextContainer = styled.View`
  flex-direction: column;
`;

const SettingSubText = styled.Text`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 12px;
  margin-top: 2px;
`;

const SettingIcon = styled.Text`
  font-size: 20px;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const ArrowText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
`;

const DangerButton = styled.TouchableOpacity`
  background-color: ${({ theme }) => theme.colors.error};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  align-items: center;
`;

const DangerButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.button.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.button.fontWeight};
`;

const DangerHint = styled.Text`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 12px;
  text-align: center;
  margin-top: ${({ theme }) => theme.spacing.sm}px;
`;

const ModalContainer = styled.View`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
`;

const ModalHeader = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.lg}px;
  border-bottom-width: 1px;
  border-bottom-color: ${({ theme }) => theme.colors.border};
`;

const ModalTitle = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.h3.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.h3.fontWeight};
`;

const CloseButton = styled.TouchableOpacity`
  padding: ${({ theme }) => theme.spacing.sm}px;
`;

const CloseButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 20px;
`;

const ModalContent = styled.ScrollView`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.lg}px;
`;

const NetworkSectionTitle = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  font-weight: 600;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
  margin-top: ${({ theme }) => theme.spacing.md}px;
  text-transform: uppercase;
`;

const NetworkItem = styled.TouchableOpacity<{ $isActive: boolean }>`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  background-color: ${({ theme, $isActive }) =>
    $isActive ? theme.colors.primaryLight + '20' : theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
  border-width: 1px;
  border-color: ${({ theme, $isActive }) =>
    $isActive ? theme.colors.primary : 'transparent'};
`;

const NetworkInfo = styled.View`
  flex-direction: row;
  align-items: center;
`;

const NetworkItemInfo = styled.View`
  margin-left: ${({ theme }) => theme.spacing.sm}px;
`;

const NetworkItemName = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
`;

const NetworkItemSymbol = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  margin-top: 2px;
`;

const CheckMark = styled.Text`
  color: ${({ theme }) => theme.colors.primary};
  font-size: 20px;
  font-weight: bold;
`;

const SettingItemRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const DisabledHint = styled.Text`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  margin-top: -${({ theme }) => theme.spacing.xs}px;
  margin-left: ${({ theme }) => theme.spacing.sm}px;
`;

const PinSection = styled.View`
  align-items: center;
  padding: ${({ theme }) => theme.spacing.lg}px;
`;

const PinDescription = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  text-align: center;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const PinInput = styled.TextInput`
  width: 100%;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  font-size: ${({ theme }) => theme.typography.h3.fontSize}px;
  color: ${({ theme }) => theme.colors.textPrimary};
  text-align: center;
  letter-spacing: 8px;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const PrimaryButton = styled.TouchableOpacity<{ disabled?: boolean }>`
  width: 100%;
  background-color: ${({ theme, disabled }) =>
    disabled ? theme.colors.textMuted : theme.colors.primary};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  align-items: center;
`;

const PrimaryButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.button.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.button.fontWeight};
`;

const MnemonicSection = styled.View`
  padding: ${({ theme }) => theme.spacing.md}px;
`;

const WarningBox = styled.View`
  flex-direction: row;
  align-items: center;
  background-color: ${({ theme }) => theme.colors.error}20;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
  border-width: 1px;
  border-color: ${({ theme }) => theme.colors.error};
`;

const WarningIcon = styled.Text`
  font-size: 24px;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const WarningText = styled.Text`
  flex: 1;
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  line-height: 20px;
`;

const MnemonicGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: space-between;
`;

const MnemonicWord = styled.View`
  width: 48%;
  flex-direction: row;
  align-items: center;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  padding: ${({ theme }) => theme.spacing.sm}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const MnemonicIndex = styled.Text`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  width: 24px;
`;

const MnemonicText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  font-family: monospace;
`;

const PinStepIndicator = styled.View`
  flex-direction: row;
  justify-content: center;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const StepDot = styled.View<{ $active: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 4px;
  background-color: ${({ theme, $active }) =>
    $active ? theme.colors.primary : theme.colors.textMuted};
  margin-left: ${({ theme }) => theme.spacing.xs}px;
  margin-right: ${({ theme }) => theme.spacing.xs}px;
`;

const LoadingProgressContainer = styled.View`
  align-items: center;
  padding: ${({ theme }) => theme.spacing.lg}px;
`;

const LoadingPercentText = styled.Text`
  color: ${({ theme }) => theme.colors.primary};
  font-size: 32px;
  font-weight: 700;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const LoadingBarContainer = styled.View`
  width: 100%;
  height: 6px;
  background-color: ${({ theme }) => theme.colors.border};
  border-radius: 3px;
  overflow: hidden;
`;

const LoadingBarFill = styled.View`
  height: 100%;
  background-color: ${({ theme }) => theme.colors.primary};
  border-radius: 3px;
`;

const AnimatedLoadingBarFill = Animated.createAnimatedComponent(LoadingBarFill);

const LoadingStatusText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
  margin-top: ${({ theme }) => theme.spacing.sm}px;
`;

const ThemeItem = styled.TouchableOpacity<{ $isActive: boolean }>`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  background-color: ${({ theme, $isActive }) =>
    $isActive ? theme.colors.primaryLight + '20' : theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
  border-width: 1px;
  border-color: ${({ theme, $isActive }) =>
    $isActive ? theme.colors.primary : 'transparent'};
`;

const ThemeItemLeft = styled.View`
  flex-direction: row;
  align-items: center;
`;

const ThemeIcon = styled.Text`
  font-size: 20px;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const ThemeItemInfo = styled.View`
  margin-left: ${({ theme }) => theme.spacing.sm}px;
`;

const ThemeItemName = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
`;

const ThemeItemDescription = styled.Text`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 12px;
  margin-top: 2px;
`;

export default SettingsScreen;
