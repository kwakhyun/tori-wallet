/**
 * 메인 앱 컴포넌트
 */

import '@/utils/polyfills'; // 반드시 첫 번째로 import
import React, { useEffect, useState } from 'react';
import { Appearance, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { ThemeProvider } from 'styled-components/native';
import { QueryClientProvider } from '@tanstack/react-query';
import BootSplash from 'react-native-bootsplash';

import RootNavigator from '@/navigation/RootNavigator';
import { useThemeStore } from '@/store/themeStore';
import { useAppState } from '@/hooks/useAppState';
import {
  createQueryClient,
  setupAppFocusListener,
  setupNetworkListener,
} from '@/config/queryClient';

const queryClient = createQueryClient();

// 앱 상태 관리 컴포넌트
function AppStateManager({ children }: { children: React.ReactNode }) {
  const { trackUserActivity } = useAppState();
  return (
    <View style={styles.appRoot} onTouchStart={trackUserActivity}>
      {children}
    </View>
  );
}

// 테마가 적용된 앱 콘텐츠
function ThemedApp(): React.JSX.Element {
  // 강제 리렌더링을 위한 state
  const [, forceUpdate] = useState(0);

  // store 변경 시 강제 리렌더링
  useEffect(() => {
    const unsubscribe = useThemeStore.subscribe(() => {
      forceUpdate(n => n + 1);
    });
    return unsubscribe;
  }, []);

  // 시스템 테마 변경 감지
  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      useThemeStore.getState().updateSystemTheme(colorScheme);
    });
    return () => subscription.remove();
  }, []);

  const { activeTheme, isDarkMode } = useThemeStore.getState();

  return (
    <ThemeProvider theme={activeTheme}>
      <SafeAreaProvider>
        <NavigationContainer
          onReady={() => {
            BootSplash.hide({ fade: true });
          }}
          theme={{
            dark: isDarkMode,
            colors: {
              primary: activeTheme.colors.primary,
              background: activeTheme.colors.background,
              card: activeTheme.colors.surface,
              text: activeTheme.colors.textPrimary,
              border: activeTheme.colors.border,
              notification: activeTheme.colors.primary,
            },
            fonts: {
              regular: { fontFamily: 'System', fontWeight: '400' },
              medium: { fontFamily: 'System', fontWeight: '500' },
              bold: { fontFamily: 'System', fontWeight: '700' },
              heavy: { fontFamily: 'System', fontWeight: '800' },
            },
          }}
        >
          <StatusBar
            barStyle={isDarkMode ? 'light-content' : 'dark-content'}
            backgroundColor={activeTheme.colors.background}
          />
          <AppStateManager>
            <RootNavigator />
          </AppStateManager>
        </NavigationContainer>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

function App(): React.JSX.Element {
  useEffect(() => {
    const unsubscribeNetwork = setupNetworkListener();
    const unsubscribeFocus = setupAppFocusListener();
    return () => {
      unsubscribeNetwork();
      unsubscribeFocus();
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemedApp />
    </QueryClientProvider>
  );
}

export default App;

const styles = StyleSheet.create({
  appRoot: { flex: 1 },
});
