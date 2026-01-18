module.exports = {
  preset: 'react-native',
  setupFiles: ['<rootDir>/jest.setupFiles.js'],
  setupFilesAfterEnv: [
    '@testing-library/jest-native/extend-expect',
    './jest.setup.js',
  ],
  fakeTimers: {
    enableGlobally: false,
  },
  testTimeout: 15000,
  maxWorkers: 2,
  forceExit: true,
  moduleNameMapper: {
    // NativeAnimatedHelper mock - RN 0.83+ 경로 변경 대응
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
    '<rootDir>/__tests__/integration/',
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
      branches: 38,
      functions: 48,
      lines: 53,
      statements: 53,
    },
    // 핵심 비즈니스 로직은 높은 커버리지 유지
    './src/services/**/*.ts': {
      branches: 55,
      functions: 80,
      lines: 75,
      statements: 75,
    },
    './src/store/**/*.ts': {
      branches: 55,
      functions: 80,
      lines: 75,
      statements: 75,
    },
  },
};
