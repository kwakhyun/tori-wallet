/**
 * PIN 설정 및 지갑 생성 완료 화면
 */

import React, { useState, useCallback, useRef } from 'react';
import styled from 'styled-components/native';
import {
  SafeAreaView,
  StatusBar,
  Alert,
  ActivityIndicator,
  Vibration,
} from 'react-native';
import {
  useRoute,
  CommonActions,
  useNavigation,
} from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '@/navigation/AuthNavigator';
import { walletService } from '@/services/walletService';
import { useWalletStore } from '@/store/walletStore';

type SetPinRouteProp = RouteProp<AuthStackParamList, 'SetPin'>;
type NavigationProp = NativeStackNavigationProp<AuthStackParamList, 'SetPin'>;

type Step = 'create' | 'confirm';

function SetPinScreen(): React.JSX.Element {
  const route = useRoute<SetPinRouteProp>();
  const navigation = useNavigation<NavigationProp>();
  const { mnemonic, walletAddress } = route.params;

  const [step, setStep] = useState<Step>('create');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const firstPin = useRef('');

  const { addWallet, setHasWallet, unlock } = useWalletStore();

  const handleComplete = useCallback(
    async (confirmedPin: string, firstPinValue: string) => {
      if (firstPinValue !== confirmedPin) {
        Alert.alert('오류', 'PIN이 일치하지 않습니다. 다시 시도해주세요.');
        setStep('create');
        setPin('');
        setConfirmPin('');
        firstPin.current = '';
        return;
      }

      setIsLoading(true);
      try {
        await walletService.storeMnemonic(mnemonic, confirmedPin);

        await walletService.storeAccounts([
          {
            address: walletAddress,
            derivationPath: "m/44'/60'/0'/0/0",
            name: 'Account 1',
          },
        ]);

        addWallet({
          address: walletAddress,
          name: 'Account 1',
          isHD: true,
          derivationPath: "m/44'/60'/0'/0/0",
        });

        unlock();
        setHasWallet(true);

        navigation.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [{ name: 'Welcome' }],
          }),
        );
      } catch (error) {
        console.error('Failed to create wallet:', error);
        Alert.alert('오류', '지갑 생성에 실패했습니다. 다시 시도해주세요.');
        setStep('create');
        setPin('');
        setConfirmPin('');
        firstPin.current = '';
      } finally {
        setIsLoading(false);
      }
    },
    [mnemonic, walletAddress, addWallet, unlock, setHasWallet, navigation],
  );

  const handleNumberPress = useCallback(
    (num: string) => {
      Vibration.vibrate(10);
      if (step === 'create') {
        if (pin.length < 6) {
          const newPin = pin + num;
          setPin(newPin);
          if (newPin.length === 6) {
            firstPin.current = newPin;
            setTimeout(() => {
              setStep('confirm');
              setPin('');
            }, 200);
          }
        }
      } else {
        if (confirmPin.length < 6) {
          const newConfirmPin = confirmPin + num;
          setConfirmPin(newConfirmPin);
          if (newConfirmPin.length === 6) {
            handleComplete(newConfirmPin, firstPin.current);
          }
        }
      }
    },
    [step, pin, confirmPin, handleComplete],
  );

  const handleDelete = useCallback(() => {
    Vibration.vibrate(10);
    if (step === 'create') {
      setPin(prev => prev.slice(0, -1));
    } else {
      setConfirmPin(prev => prev.slice(0, -1));
    }
  }, [step]);

  const currentPin = step === 'create' ? pin : confirmPin;

  return (
    <Container>
      <StatusBar barStyle="light-content" />
      <Content>
        <Header>
          <BackButton onPress={() => navigation.goBack()} disabled={isLoading}>
            <BackButtonText>←</BackButtonText>
          </BackButton>
        </Header>

        <Title>{step === 'create' ? 'PIN 설정' : 'PIN 확인'}</Title>
        <Description>
          {step === 'create'
            ? '6자리 PIN을 입력해주세요.\n이 PIN은 지갑에 접근할 때 사용됩니다.'
            : 'PIN을 다시 한번 입력해주세요.'}
        </Description>

        <PinContainer>
          {[...Array(6)].map((_, i) => (
            <PinDot key={i} $filled={i < currentPin.length} />
          ))}
        </PinContainer>

        {isLoading ? (
          <LoadingContainer>
            <ActivityIndicator size="large" color="#6366F1" />
            <LoadingText>지갑을 생성하는 중...</LoadingText>
          </LoadingContainer>
        ) : (
          <KeypadContainer>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, 'del'].map((item, index) => (
              <KeypadButton
                key={index}
                onPress={() => {
                  if (item === 'del') {
                    handleDelete();
                  } else if (item !== '') {
                    handleNumberPress(String(item));
                  }
                }}
                disabled={item === ''}
              >
                <KeypadButtonText>
                  {item === 'del' ? '⌫' : item}
                </KeypadButtonText>
              </KeypadButton>
            ))}
          </KeypadContainer>
        )}

        <AddressPreview>
          <AddressLabel>지갑 주소</AddressLabel>
          <AddressText numberOfLines={1} ellipsizeMode="middle">
            {walletAddress}
          </AddressText>
        </AddressPreview>
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
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const BackButton = styled.TouchableOpacity`
  padding: ${({ theme }) => theme.spacing.sm}px;
`;

const BackButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 24px;
`;

const Title = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.h1.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.h1.fontWeight};
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
  text-align: center;
`;

const Description = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  line-height: 24px;
  text-align: center;
  margin-bottom: ${({ theme }) => theme.spacing.xl}px;
`;

const PinContainer = styled.View`
  flex-direction: row;
  justify-content: center;
  gap: 16px;
  margin-bottom: ${({ theme }) => theme.spacing.xxl}px;
`;

const PinDot = styled.View<{ $filled: boolean }>`
  width: 16px;
  height: 16px;
  border-radius: 8px;
  background-color: ${({ theme, $filled }) =>
    $filled ? theme.colors.primary : theme.colors.border};
`;

const LoadingContainer = styled.View`
  flex: 1;
  justify-content: center;
  align-items: center;
`;

const LoadingText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  margin-top: ${({ theme }) => theme.spacing.md}px;
`;

const KeypadContainer = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: center;
  max-width: 300px;
  align-self: center;
`;

const KeypadButton = styled.TouchableOpacity<{ disabled?: boolean }>`
  width: 80px;
  height: 80px;
  justify-content: center;
  align-items: center;
  margin: 4px;
  opacity: ${({ disabled }) => (disabled ? 0 : 1)};
`;

const KeypadButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 28px;
  font-weight: 500;
`;

const AddressPreview = styled.View`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-top: auto;
`;

const AddressLabel = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
`;

const AddressText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  font-family: monospace;
`;

export default SetPinScreen;
