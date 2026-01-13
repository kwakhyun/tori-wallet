/**
 * Tori Wallet - Main App
 */

import '@/utils/polyfills'; // 반드시 첫 번째로 import
import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { ThemeProvider } from 'styled-components/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import RootNavigator from '@/navigation/RootNavigator';
import { darkTheme } from '@/styles/theme';
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

function App(): React.JSX.Element {
  const theme = darkTheme; // 현재는 dark 테마만 사용

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <SafeAreaProvider>
          <NavigationContainer>
            <StatusBar barStyle="light-content" />
            <AppStateManager>
              <RootNavigator />
            </AppStateManager>
          </NavigationContainer>
        </SafeAreaProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
