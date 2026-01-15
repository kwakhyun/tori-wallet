/**
 * Tori Wallet - Test Utilities
 * 테스트를 위한 유틸리티 함수들
 */

import React, { ReactElement } from 'react';
import {
  render,
  RenderOptions,
  waitFor,
  screen,
  cleanup,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'styled-components/native';
import { lightTheme, darkTheme } from '../src/styles/theme';

// CI 환경에서 cleanup 타임아웃 방지를 위한 afterEach 설정
afterEach(() => {
  // cleanup을 동기적으로 실행
  cleanup();
});

// NavigationContainer 모킹 (타임아웃 방지)
const MockNavigationContainer = ({
  children,
}: {
  children: React.ReactNode;
}) => <>{children}</>;

// 테스트용 QueryClient
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

interface AllTheProvidersProps {
  children: React.ReactNode;
  theme?: 'light' | 'dark';
}

// 모든 프로바이더를 포함하는 래퍼
const AllTheProviders = ({
  children,
  theme: themeMode = 'dark',
}: AllTheProvidersProps) => {
  const queryClient = createTestQueryClient();
  const currentTheme = themeMode === 'light' ? lightTheme : darkTheme;

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={currentTheme}>
        <MockNavigationContainer>{children}</MockNavigationContainer>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

// 커스텀 render 함수
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  theme?: 'light' | 'dark';
}

const customRender = (ui: ReactElement, options?: CustomRenderOptions) => {
  const { theme: themeMode, ...renderOptions } = options || {};

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <AllTheProviders theme={themeMode}>{children}</AllTheProviders>
  );

  return render(ui, { wrapper: Wrapper, ...renderOptions });
};

// re-export everything
export * from '@testing-library/react-native';

// override render method
export { customRender as render };

// 테스트용 지갑 주소
export const TEST_WALLET_ADDRESS = '0x1234567890123456789012345678901234567890';

// 테스트용 니모닉
export const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// wait utility
export const wait = (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms));

// 비동기 테스트 헬퍼 - 요소가 나타날 때까지 대기
export const waitForElement = async (testID: string) => {
  return waitFor(() => screen.getByTestId(testID));
};

// 비동기 테스트 헬퍼 - 요소가 사라질 때까지 대기
export const waitForElementToBeRemoved = async (testID: string) => {
  return waitFor(() => {
    expect(screen.queryByTestId(testID)).toBeNull();
  });
};

// 스냅샷 테스트 헬퍼
export const expectMatchingSnapshot = (component: ReactElement) => {
  const { toJSON } = customRender(component);
  expect(toJSON()).toMatchSnapshot();
};

// 접근성 테스트 헬퍼
export const expectAccessible = (testID: string) => {
  const element = screen.getByTestId(testID);
  expect(element).toBeTruthy();
  // 기본적인 접근성 속성 확인
  expect(element.props.accessible !== false).toBeTruthy();
};

// Mock navigation object
export const createMockNavigation = () => ({
  navigate: jest.fn(),
  goBack: jest.fn(),
  reset: jest.fn(),
  setOptions: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
  removeListener: jest.fn(),
  getParent: jest.fn(() => null),
  getState: jest.fn(() => ({
    routes: [],
    index: 0,
  })),
  dispatch: jest.fn(),
  canGoBack: jest.fn(() => true),
  isFocused: jest.fn(() => true),
  setParams: jest.fn(),
});

// Mock route object
export const createMockRoute = <T extends Record<string, unknown>>(
  params?: T,
) => ({
  key: 'test-route',
  name: 'TestScreen' as const,
  params: params || {},
});

// 테스트용 토큰 데이터
export const TEST_TOKENS = [
  {
    address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    balance: '1000.00',
  },
  {
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    balance: '500.00',
  },
];

// 테스트용 트랜잭션 데이터
export const TEST_TRANSACTIONS = [
  {
    hash: '0x1234567890abcdef',
    from: TEST_WALLET_ADDRESS,
    to: '0xRecipient',
    value: '1000000000000000000',
    timestamp: Date.now() - 3600000,
    status: 'success' as const,
    type: 'send' as const,
  },
  {
    hash: '0xabcdef1234567890',
    from: '0xSender',
    to: TEST_WALLET_ADDRESS,
    value: '500000000000000000',
    timestamp: Date.now() - 7200000,
    status: 'success' as const,
    type: 'receive' as const,
  },
];
