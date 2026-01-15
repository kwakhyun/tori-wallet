/**
 * Tori Wallet - Main App
 */

import '@/utils/polyfills'; // 반드시 첫 번째로 import
import React, { useEffect, useState } from 'react';
import { Appearance, StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { ThemeProvider } from 'styled-components/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import RootNavigator from '@/navigation/RootNavigator';
import { useThemeStore } from '@/store/themeStore';
import { useAppState } from '@/hooks/useAppState';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30 * 1000,
    },
  },
});

// 앱 상태 관리 컴포넌트
function AppStateManager({ children }: { children: React.ReactNode }) {
  useAppState();
  return <>{children}</>;
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
  return (
    <QueryClientProvider client={queryClient}>
      <ThemedApp />
    </QueryClientProvider>
  );
}

export default App;
