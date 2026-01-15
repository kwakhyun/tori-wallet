module.exports = {
  preset: 'react-native',
  // NativeAnimatedHelper mock을 가장 먼저 설정 (preset 로드 전)
  setupFiles: ['<rootDir>/jest.setupFiles.js'],
  // setupFilesAfterEnv에서 설정 파일 로드 (moduleNameMapper 적용 후 실행)
  setupFilesAfterEnv: [
    '@testing-library/jest-native/extend-expect',
    './jest.setup.js',
  ],
  fakeTimers: {
    enableGlobally: false,
  },
  // CI 환경에서 안정성을 위한 설정
  testTimeout: 60000,
  maxWorkers: process.env.CI ? 2 : '50%',
  moduleNameMapper: {
    // NativeAnimatedHelper mock (CI 환경 호환) - RN 0.83+ 경로 변경 대응
    '^react-native/Libraries/Animated/NativeAnimatedHelper$':
      '<rootDir>/__mocks__/NativeAnimatedHelper.js',
    '^react-native/src/private/animated/NativeAnimatedHelper$':
      '<rootDir>/__mocks__/NativeAnimatedHelper.js',
    // Path aliases
    '^@app/(.*)$': '<rootDir>/src/app/$1',
    '^@navigation/(.*)$': '<rootDir>/src/navigation/$1',
    '^@screens/(.*)$': '<rootDir>/src/screens/$1',
    '^@store/(.*)$': '<rootDir>/src/store/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@styles/(.*)$': '<rootDir>/src/styles/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
    '^@hooks/(.*)$': '<rootDir>/src/hooks/$1',
  },
  testMatch: [
    '**/__tests__/**/*.test.{ts,tsx}',
    '**/__tests__/**/*.spec.{ts,tsx}',
  ],
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/e2e/',
    '<rootDir>/__tests__/integration/apiMocking.test.ts',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|react-native-.*|@react-native-community|@walletconnect|msw|@mswjs|@open-draft|outvariant|strict-event-emitter|until-async|headers-polyfill)/)',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/*.spec.{ts,tsx}',
    '!src/**/__tests__/**',
    '!src/**/index.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 47,
      functions: 56,
      lines: 63,
      statements: 63,
    },
  },
};
