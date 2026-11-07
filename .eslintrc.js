module.exports = {
  root: true,
  extends: '@react-native',
  overrides: [
    {
      // Jest 테스트 파일에 jest 환경 적용
      files: ['**/__tests__/**/*', '**/*.test.*', 'jest.setup.js'],
      env: {
        jest: true,
      },
    },
    {
      // Node.js 스크립트 파일에 node 환경 적용
      files: ['scripts/**/*'],
      env: {
        node: true,
      },
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    {
      // RN Modal은 잠금 인식 AppModal로만 띄운다. 잠긴 동안 숨김, iOS 형제 모달 순차 표시,
      // Android 모달 안 토스트를 AppModal이 처리한다. 예외: AppModal 자신과 Android 잠금
      // 오버레이(RootNavigator).
      files: ['src/**/*.ts', 'src/**/*.tsx'],
      excludedFiles: [
        'src/components/common/AppModal.tsx',
        'src/navigation/RootNavigator.tsx',
      ],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: 'react-native',
                importNames: ['Modal'],
                message:
                  "Use AppModal from '@/components/common/AppModal' (lock-aware, iOS-coordinated).",
              },
            ],
          },
        ],
      },
    },
    {
      files: ['**/*.cjs'],
      env: { node: true, es2022: true },
      parserOptions: { ecmaVersion: 2022, sourceType: 'script' },
    },
  ],
};
