/**
 * Tori Wallet - ErrorBoundary Component Tests
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

// ErrorBoundary 모듈 직접 임포트 (테스트용)
import ErrorBoundary from '../../src/components/common/ErrorBoundary';

// 콘솔 에러 억제 (테스트 중 에러 로그 방지)
const originalError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});
afterAll(() => {
  console.error = originalError;
});

// 에러를 발생시키는 컴포넌트
function ErrorComponent(): React.JSX.Element {
  throw new Error('Test error');
}

// 정상 동작 컴포넌트
function NormalComponent(): React.JSX.Element {
  return <Text>Normal Content</Text>;
}

describe('ErrorBoundary', () => {
  it('should render children when there is no error', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <NormalComponent />
      </ErrorBoundary>,
    );

    expect(getByText('Normal Content')).toBeTruthy();
  });

  it('should render error UI when there is an error', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <ErrorComponent />
      </ErrorBoundary>,
    );

    expect(getByText('문제가 발생했습니다')).toBeTruthy();
  });

  it('should render custom fallback when provided and error occurs', () => {
    const CustomFallback = <Text>Custom Error UI</Text>;

    const { getByText } = render(
      <ErrorBoundary fallback={CustomFallback}>
        <ErrorComponent />
      </ErrorBoundary>,
    );

    expect(getByText('Custom Error UI')).toBeTruthy();
  });

  it('should show retry button in error state', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <ErrorComponent />
      </ErrorBoundary>,
    );

    expect(getByText('다시 시도')).toBeTruthy();
  });

  it('should show error hint message', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <ErrorComponent />
      </ErrorBoundary>,
    );

    expect(getByText(/복구 구문을 백업/)).toBeTruthy();
  });
});
