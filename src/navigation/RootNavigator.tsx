/**
 * 루트 네비게이터
 *
 * 앱을 처음 열었을 때(이번 실행에서 아직 잠금 해제 전)는 잠금 화면만 렌더링한다.
 * 한 번 잠금을 해제한 뒤 자동 잠금이 걸리면 메인 스택을 언마운트하지 않고
 * 불투명한 잠금 오버레이를 덮는다. 작성 중이던 송금 폼이나 현재 화면 위치가
 * 잠금 해제 후에도 유지된다. 서명 세션은 잠금 시점에 이미 폐기되므로
 * 오버레이 아래 화면은 서명할 수 없다.
 *
 * 잠금 오버레이
 *  - iOS: react-native-screens FullWindowOverlay로 앱 창에 직접 올린다. RN Modal은 루트
 *    VC가 다른 모달을 표시(또는 닫는 중)하고 있으면 present가 거부되어 나타나지 않지만,
 *    이 오버레이는 표시 중인 모든 VC 위에 놓인다. 잠긴 동안 모든 AppModal은 숨겨지므로
 *    오버레이 위로 새 모달이 올라오지 않는다. Alert와 키보드는 별도 창이라 위에 보인다.
 *  - Android: 전체 화면 RN Modal(Dialog). 다른 AppModal은 모두 숨겨지므로 그 위에 쌓이지
 *    않는다. 하드웨어 뒤로 가기는 잠금 화면(PIN 분실 안내 닫기)에만 전달한다.
 *  - 잠긴 동안 아래 화면은 접근성 트리에서 숨기고 키보드를 내린다.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Modal, Platform, StyleSheet, View } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
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
import {
  UnlockBackHandlerContext,
  type UnlockBackHandler,
} from '@/screens/Auth/unlockBackHandler';
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
    /** 토큰 목록을 읽은 체인. 상세 화면은 이 체인에 고정된다 (tokenDetailParams가 채운다). */
    chainId: number;
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
  const backHandler = useRef<UnlockBackHandler | null>(null);

  const content = (
    <UnlockBackHandlerContext.Provider value={backHandler}>
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: theme.colors.background },
        ]}
        accessibilityViewIsModal
        testID="lock-overlay"
      >
        <UnlockScreen />
      </View>
    </UnlockBackHandlerContext.Provider>
  );

  if (Platform.OS === 'ios') {
    return <FullWindowOverlay>{content}</FullWindowOverlay>;
  }

  return (
    <Modal
      visible
      transparent={false}
      animationType="none"
      presentationStyle="fullScreen"
      statusBarTranslucent
      // 뒤로 가기로 잠금 화면을 닫을 수 없다. PIN 분실 안내가 열려 있으면 PIN 입력으로
      // 돌아가고, 그 밖에는 아무 동작도 하지 않는다 (아래 화면을 pop하지 않는다).
      onRequestClose={() => {
        backHandler.current?.();
      }}
    >
      {content}
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
  const overlayLocked = showMain && isLocked;

  // 잠금 오버레이가 덮이면 아래 화면의 키보드를 내린다.
  useEffect(() => {
    if (overlayLocked) Keyboard.dismiss();
  }, [overlayLocked]);

  return (
    <>
      <View
        style={styles.navigator}
        // 잠긴 동안 오버레이 아래 화면을 화면 낭독기에서 숨긴다.
        accessibilityElementsHidden={overlayLocked}
        importantForAccessibility={
          overlayLocked ? 'no-hide-descendants' : 'auto'
        }
        testID="root-navigator"
      >
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
              <Stack.Screen
                name="ReceiveToken"
                component={ReceiveTokenScreen}
              />
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
      </View>
      {showMain ? <WalletConnectHost /> : null}
      {overlayLocked ? <LockOverlay /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  navigator: { flex: 1 },
});

export default RootNavigator;
