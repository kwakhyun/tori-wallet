/**
 * Mock for react-native/Libraries/Animated/NativeAnimatedHelper
 */

module.exports = {
  shouldUseNativeDriver: jest.fn(() => false),
  generateNewNodeTag: jest.fn(() => 1),
  generateNewAnimationId: jest.fn(() => 1),
  assertNativeAnimatedModule: jest.fn(),
  API: {},
};
