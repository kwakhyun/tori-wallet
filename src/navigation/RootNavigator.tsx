/**
 * 루트 네비게이터
 *
 * 앱을 처음 열었을 때(이번 실행에서 아직 잠금 해제 전)는 잠금 화면만 렌더링한다.
 * 한 번 잠금을 해제한 뒤 자동 잠금이 걸리면 메인 스택을 언마운트하지 않고
 * 불투명한 잠금 오버레이를 덮는다. 작성 중이던 송금 폼이나 현재 화면 위치가
 * 잠금 해제 후에도 유지된다. 서명 세션은 잠금 시점에 이미 폐기되므로
 * 오버레이 아래 화면은 서명할 수 없다.
 */

import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useShallow } from 'zustand/react/shallow';
import { useTheme } from 'styled-components/native';

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
import AccountsScreen from '@/screens/Settings/AccountsScreen';
import TokenApprovalsScreen from '@/screens/Settings/TokenApprovalsScreen';
import TokenManagementScreen from '@/screens/Assets/TokenManagementScreen';
import TransactionDetailScreen from '@/screens/TransactionDetail/TransactionDetailScreen';
import WalletConnectHost from '@/components/walletconnect/WalletConnectHost';

export type RootStackParamList = {
  Auth: undefined;
  Unlock: undefined;
  Main: undefined;
  SendTransaction:
    | {
        tokenAddress?: string;
        /** QR/딥링크 등에서 미리 채울 수신 주소 */
        recipient?: string;
        /** 최소 단위(raw) 수량 문자열 */
        amountRaw?: string;
      }
    | undefined;
  ReceiveToken: { tokenAddress?: string } | undefined;
  TokenDetail: {
    symbol: string;
    name: string;
    balance: string;
    /** USD 가치 (모르면 null) */
    usdValue?: number | null;
    /** @deprecated usdValue 사용 */
    value?: string;
    contractAddress?: string;
    decimals?: number;
    coingeckoId?: string;
    logoUrl?: string;
  };
  CoinDetail: {
    coinId: string;
    coinName: string;
    coinSymbol: string;
    coinImage: string;
  };
  TransactionDetail: { txHash: string; chainId?: number };
  SecuritySettings: undefined;
  AddressBook: { mode?: 'manage' | 'select' } | undefined;
  Accounts: undefined;
  TokenApprovals: undefined;
  TokenManagement: undefined;
  WalletConnect: { uri?: string } | undefined;
  Swap: undefined;
  SwapHistory: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function LockOverlay(): React.JSX.Element {
  const theme = useTheme();
  return (
    <Modal
      visible
      transparent={false}
      animationType="none"
      presentationStyle="fullScreen"
      statusBarTranslucent
      // Android 뒤로 가기로 잠금 화면을 닫을 수 없다.
      onRequestClose={() => undefined}
    >
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: theme.colors.background },
        ]}
        testID="lock-overlay"
      >
        <UnlockScreen />
      </View>
    </Modal>
  );
}

function RootNavigator(): React.JSX.Element {
  const { hasWallet, isLocked } = useWalletStore(
    useShallow(state => ({
      hasWallet: state.hasWallet,
      isLocked: state.isLocked,
    })),
  );

  // 이번 실행에서 한 번이라도 잠금 해제했는지
  const [sessionUnlocked, setSessionUnlocked] = useState(false);

  useEffect(() => {
    if (!hasWallet) setSessionUnlocked(false);
    else if (!isLocked) setSessionUnlocked(true);
  }, [hasWallet, isLocked]);

  const showMain = hasWallet && (!isLocked || sessionUnlocked);

  return (
    <>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
        }}
      >
        {!hasWallet ? (
          // 지갑이 없는 경우: 온보딩 플로우
          <Stack.Screen name="Auth" component={AuthNavigator} />
        ) : !showMain ? (
          // 앱 실행 직후 잠금 상태: 잠금 해제 화면
          <Stack.Screen name="Unlock" component={UnlockScreen} />
        ) : (
          // 잠금 해제된 메인 앱 (자동 잠금 시 오버레이로 가림)
          <>
            <Stack.Screen name="Main" component={MainTabNavigator} />
            <Stack.Screen
              name="SendTransaction"
              component={SendTransactionScreen}
            />
            <Stack.Screen name="ReceiveToken" component={ReceiveTokenScreen} />
            <Stack.Screen
              name="WalletConnect"
              component={WalletConnectScreen}
            />
            <Stack.Screen name="Swap" component={SwapScreen} />
            <Stack.Screen name="SwapHistory" component={SwapHistoryScreen} />
            <Stack.Screen name="TokenDetail" component={TokenDetailScreen} />
            <Stack.Screen name="CoinDetail" component={CoinDetailScreen} />
            <Stack.Screen
              name="TransactionDetail"
              component={TransactionDetailScreen}
            />
            <Stack.Screen
              name="SecuritySettings"
              component={SecuritySettingsScreen}
            />
            <Stack.Screen name="AddressBook" component={AddressBookScreen} />
            <Stack.Screen name="Accounts" component={AccountsScreen} />
            <Stack.Screen
              name="TokenApprovals"
              component={TokenApprovalsScreen}
            />
            <Stack.Screen
              name="TokenManagement"
              component={TokenManagementScreen}
            />
          </>
        )}
      </Stack.Navigator>
      {showMain ? <WalletConnectHost /> : null}
      {showMain && isLocked ? <LockOverlay /> : null}
    </>
  );
}

export default RootNavigator;
