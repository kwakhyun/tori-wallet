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
      <Stack.Screen name="BackupMnemonic" component={BackupMnemonicScreen} />
      <Stack.Screen name="VerifyMnemonic" component={VerifyMnemonicScreen} />
      <Stack.Screen name="SetPin" component={SetPinScreen} />
    </Stack.Navigator>
  );
}
