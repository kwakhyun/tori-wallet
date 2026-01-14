/**
 * Tori Wallet - Root Navigator
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import MainTabNavigator from './MainTabNavigator';
import { AuthNavigator } from './AuthNavigator';
import { useWalletStore } from '@/store/walletStore';
import SendTransactionScreen from '@/screens/Send/SendTransactionScreen';
import ReceiveTokenScreen from '@/screens/Receive/ReceiveTokenScreen';
import WalletConnectScreen from '@/screens/WalletConnect/WalletConnectScreen';
import SwapScreen from '@/screens/Swap/SwapScreen';
import SwapHistoryScreen from '@/screens/Swap/SwapHistoryScreen';
import TokenDetailScreen from '@/screens/TokenDetail/TokenDetailScreen';
import CoinDetailScreen from '@/screens/CoinDetail/CoinDetailScreen';
import UnlockScreen from '@/screens/Auth/UnlockScreen';
import SecuritySettingsScreen from '@/screens/Settings/SecuritySettingsScreen';
import AddressBookScreen from '@/screens/Settings/AddressBookScreen';

export type RootStackParamList = {
  Auth: undefined;
  Unlock: undefined;
  Main: undefined;
  SendTransaction: { tokenAddress?: string };
  ReceiveToken: undefined;
  TokenDetail: {
    symbol: string;
    name: string;
    balance: string;
    value: string;
    contractAddress?: string;
  };
  CoinDetail: {
    coinId: string;
    coinName: string;
    coinSymbol: string;
    coinImage: string;
  };
  TransactionDetail: { txHash: string };
  Settings: undefined;
  SecuritySettings: undefined;
  AddressBook: undefined;
  WalletConnect: { uri?: string };
  DAppBrowser: { url: string };
  Swap: undefined;
  SwapHistory: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function RootNavigator(): React.JSX.Element {
  const { hasWallet, isLocked } = useWalletStore();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      {!hasWallet ? (
        // 지갑이 없는 경우: 온보딩 플로우
        <Stack.Screen name="Auth" component={AuthNavigator} />
      ) : isLocked ? (
        // 지갑이 있지만 잠금 상태: 잠금 해제 화면
        <Stack.Screen name="Unlock" component={UnlockScreen} />
      ) : (
        // 지갑이 있고 잠금 해제된 상태: 메인 앱
        <>
          <Stack.Screen name="Main" component={MainTabNavigator} />
          <Stack.Screen
            name="SendTransaction"
            component={SendTransactionScreen}
          />
          <Stack.Screen name="ReceiveToken" component={ReceiveTokenScreen} />
          <Stack.Screen name="WalletConnect" component={WalletConnectScreen} />
          <Stack.Screen name="Swap" component={SwapScreen} />
          <Stack.Screen name="SwapHistory" component={SwapHistoryScreen} />
          <Stack.Screen name="TokenDetail" component={TokenDetailScreen} />
          <Stack.Screen name="CoinDetail" component={CoinDetailScreen} />
          <Stack.Screen
            name="SecuritySettings"
            component={SecuritySettingsScreen}
          />
          <Stack.Screen name="AddressBook" component={AddressBookScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default RootNavigator;
