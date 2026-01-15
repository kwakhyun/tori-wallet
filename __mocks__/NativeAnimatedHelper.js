/**
 * Mock for react-native/Libraries/Animated/NativeAnimatedHelper
 * CI 환경에서 모듈을 찾지 못하는 문제 해결
 */

module.exports = {
  shouldUseNativeDriver: jest.fn(() => false),
  generateNewNodeTag: jest.fn(() => 1),
  generateNewAnimationId: jest.fn(() => 1),
  assertNativeAnimatedModule: jest.fn(),
  API: {},
};
