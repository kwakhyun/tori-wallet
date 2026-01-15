/**
 * Tori Wallet - Jest Setup Files (runs before preset)
 * react-native preset이 로드되기 전에 실행되는 설정
 */

/* eslint-env jest */

// NativeAnimatedHelper mock - RN 0.83+에서 경로가 변경됨
// 이 mock이 먼저 설정되어야 react-native 모듈 로드 시 에러가 발생하지 않음
jest.mock(
  'react-native/Libraries/Animated/NativeAnimatedHelper',
  () => ({
    shouldUseNativeDriver: jest.fn(() => false),
    generateNewNodeTag: jest.fn(() => 1),
    generateNewAnimationId: jest.fn(() => 1),
    assertNativeAnimatedModule: jest.fn(),
    API: {},
  }),
  { virtual: true },
);

jest.mock(
  'react-native/src/private/animated/NativeAnimatedHelper',
  () => ({
    shouldUseNativeDriver: jest.fn(() => false),
    generateNewNodeTag: jest.fn(() => 1),
    generateNewAnimationId: jest.fn(() => 1),
    assertNativeAnimatedModule: jest.fn(),
    transformDataType: jest.fn(val => val),
    nativeEventEmitter: {
      addListener: jest.fn(() => ({ remove: jest.fn() })),
    },
    API: {
      addAnimatedEventToView: jest.fn(),
      removeAnimatedEventFromView: jest.fn(),
      connectAnimatedNodeToView: jest.fn(),
      disconnectAnimatedNodeFromView: jest.fn(),
      restoreDefaultValues: jest.fn(),
      createAnimatedNode: jest.fn(),
      updateAnimatedNodeConfig: jest.fn(),
      getValue: jest.fn(),
      startListeningToAnimatedNodeValue: jest.fn(),
      stopListeningToAnimatedNodeValue: jest.fn(),
      connectAnimatedNodes: jest.fn(),
      disconnectAnimatedNodes: jest.fn(),
      startAnimatingNode: jest.fn(),
      stopAnimation: jest.fn(),
      setAnimatedNodeValue: jest.fn(),
      setAnimatedNodeOffset: jest.fn(),
      flattenAnimatedNodeOffset: jest.fn(),
      extractAnimatedNodeOffset: jest.fn(),
      dropAnimatedNode: jest.fn(),
    },
  }),
  { virtual: true },
);
