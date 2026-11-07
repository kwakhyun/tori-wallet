/**
 * 에러 경계 컴포넌트 (앱 크래시 방지 및 복구)
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { palette } from '@/styles/theme';
import { captureException, addErrorBreadcrumb } from '@/utils/errorReporter';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    // 에러 리포팅 서비스로 전송
    addErrorBreadcrumb('ErrorBoundary caught error', 'error', {
      componentStack: errorInfo.componentStack?.slice(0, 500),
    });

    captureException(error, {
      screenName: 'ErrorBoundary',
      extra: {
        componentStack: errorInfo.componentStack,
      },
    });

    // 개발 환경에서는 콘솔에도 출력
    if (__DEV__) {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <SafeAreaView
          style={styles.container}
          testID="error-boundary-container"
        >
          <View style={styles.content}>
            <Text style={styles.emoji}>😵</Text>
            <Text style={styles.title} testID="error-boundary-title">
              문제가 발생했습니다
            </Text>
            <Text style={styles.message} testID="error-boundary-message">
              예상치 못한 오류로 화면을 표시하지 못했습니다.{'\n'}
              지갑과 자산은 안전하게 보관되어 있습니다.
            </Text>

            {__DEV__ && this.state.error && (
              <View style={styles.errorBox} testID="error-boundary-details">
                <Text style={styles.errorTitle}>Error Details:</Text>
                <Text style={styles.errorText}>
                  {this.state.error.toString()}
                </Text>
                {this.state.errorInfo && (
                  <Text style={styles.errorStack}>
                    {this.state.errorInfo.componentStack?.slice(0, 500)}
                  </Text>
                )}
              </View>
            )}

            <TouchableOpacity
              style={styles.button}
              onPress={this.handleReset}
              testID="error-boundary-retry-button"
              accessibilityRole="button"
              accessibilityLabel="다시 시도"
            >
              <Text style={styles.buttonText}>다시 시도</Text>
            </TouchableOpacity>

            <Text style={styles.hint}>
              문제가 계속되면 앱을 완전히 종료한 뒤 다시 실행해 주세요.{'\n'}
              복구 구문을 백업했는지 확인하기 전에는 앱을 삭제하지 마세요.{'\n'}
              앱을 삭제하면 이 기기에 저장된 지갑이 함께 삭제됩니다.
            </Text>
          </View>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background.dark,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: palette.white,
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    color: palette.gray[400],
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  errorBox: {
    backgroundColor: palette.background.secondary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    width: '100%',
    maxHeight: 200,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.red[500],
    marginBottom: 8,
  },
  errorText: {
    fontSize: 12,
    color: palette.red[400],
    marginBottom: 8,
  },
  errorStack: {
    fontSize: 10,
    color: palette.gray[500],
  },
  button: {
    backgroundColor: palette.indigo[500],
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 24,
  },
  buttonText: {
    color: palette.white,
    fontSize: 16,
    fontWeight: '600',
  },
  hint: {
    fontSize: 12,
    color: palette.gray[500],
    textAlign: 'center',
    lineHeight: 18,
  },
});

export default ErrorBoundary;
