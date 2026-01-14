/**
 * Tori Wallet - Web3 Mobile Wallet
 * Main Application Entry Point
 */

import React, { useEffect, useState } from 'react';
import {
  Appearance,
  StatusBar,
  View,
  ActivityIndicator,
  Text,
  StyleSheet,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from 'styled-components/native';

import RootNavigator from '@/navigation/RootNavigator';
import { useThemeStore } from '@/store/themeStore';
import { ErrorBoundary } from '@/components';
import { initializeRealm, userPreferencesService } from '@/realm';

// React Query Client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 2,
    },
  },
});

// 앱 초기화 훅
function useAppInitialization() {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const initialize = async () => {
      try {
        // Realm 데이터베이스 초기화
        await initializeRealm();

        // 사용자 설정 로드
        await userPreferencesService.loadAll();

        setIsReady(true);
      } catch (err) {
        console.error('App initialization failed:', err);
        setError(
          err instanceof Error ? err : new Error('Initialization failed'),
        );
        // 에러가 발생해도 앱은 실행
        setIsReady(true);
      }
    };

    initialize();
  }, []);

  return { isReady, error };
}

// 테마가 적용된 앱 콘텐츠
function AppContent(): React.JSX.Element {
  const { activeTheme, isDarkMode, updateSystemTheme } = useThemeStore();

  // 시스템 테마 변경 감지
  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      updateSystemTheme(colorScheme);
    });

    return () => {
      subscription.remove();
    };
  }, [updateSystemTheme]);

  return (
    <ThemeProvider theme={activeTheme}>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={activeTheme.colors.background}
      />
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
              regular: {
                fontFamily: 'System',
                fontWeight: '400',
              },
              medium: {
                fontFamily: 'System',
                fontWeight: '500',
              },
              bold: {
                fontFamily: 'System',
                fontWeight: '700',
              },
              heavy: {
                fontFamily: 'System',
                fontWeight: '800',
              },
            },
          }}
        >
          <RootNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

// 로딩 화면 스타일
const loadingStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0D0D0D',
  },
  text: {
    color: '#FFFFFF',
    marginTop: 16,
  },
});

// 로딩 화면
function LoadingScreen(): React.JSX.Element {
  return (
    <View style={loadingStyles.container}>
      <ActivityIndicator size="large" color="#7B61FF" />
      <Text style={loadingStyles.text}>Loading...</Text>
    </View>
  );
}

function App(): React.JSX.Element {
  const { isReady } = useAppInitialization();

  if (!isReady) {
    return <LoadingScreen />;
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AppContent />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
