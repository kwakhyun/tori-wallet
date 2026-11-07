/**
 * 인증 네비게이터
 */

import React, { useSyncExternalStore } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import WelcomeScreen from '@/screens/Auth/WelcomeScreen';
import CreateWalletScreen from '@/screens/Auth/CreateWalletScreen';
import ImportWalletScreen from '@/screens/Auth/ImportWalletScreen';
import BackupMnemonicScreen from '@/screens/Auth/BackupMnemonicScreen';
import VerifyMnemonicScreen from '@/screens/Auth/VerifyMnemonicScreen';
import SetPinScreen from '@/screens/Auth/SetPinScreen';
import { onboardingVault } from '@/services/onboardingVault';

export type AuthStackParamList = {
  Welcome: undefined;
  CreateWallet: undefined;
  ImportWallet: undefined;
  BackupMnemonic: undefined;
  VerifyMnemonic: undefined;
  SetPin: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthNavigator(): React.JSX.Element {
  const clearVersion = useSyncExternalStore(
    onboardingVault.subscribe,
    onboardingVault.getClearVersion,
    onboardingVault.getClearVersion,
  );

  return (
    <Stack.Navigator
      key={clearVersion}
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="CreateWallet" component={CreateWalletScreen} />
      <Stack.Screen name="ImportWallet" component={ImportWalletScreen} />
      {/* 복구 구문 폐기 확인과 PIN 확인 단계 되돌리기는 화면이 직접 처리하므로
          iOS 스와이프 뒤로 가기로 우회하지 못하게 한다. */}
      <Stack.Screen
        name="BackupMnemonic"
        component={BackupMnemonicScreen}
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen name="VerifyMnemonic" component={VerifyMnemonicScreen} />
      <Stack.Screen
        name="SetPin"
        component={SetPinScreen}
        options={{ gestureEnabled: false }}
      />
    </Stack.Navigator>
  );
}
