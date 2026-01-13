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
    },
  ],
};
