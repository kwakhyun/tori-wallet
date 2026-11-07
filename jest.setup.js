/**
 * Jest 설정
 * 테스트 환경 설정
 */

jest.setTimeout(60000);

// 실제 React Native 런타임처럼 동기 네이티브 호출이 가능한 환경으로 표시한다.
// 보안 난수 모듈은 이 값이 없는 구형 Chrome 원격 디버거에서 fail-closed 한다.
global.nativeCallSyncHook = jest.fn();

// MSW를 위한 폴리필 (Node 18 이상에서 필요)
import { performance } from 'perf_hooks';
import { TextEncoder, TextDecoder } from 'util';
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
global.performance = performance;

// fetch polyfill for MSW (Jest 환경)
import { fetch, Headers, Request, Response } from 'undici';
global.fetch = fetch;
global.Headers = Headers;
global.Request = Request;
global.Response = Response;

// Mock react-native-keychain
jest.mock('react-native-keychain', () => ({
  setGenericPassword: jest.fn(() => Promise.resolve(true)),
  getGenericPassword: jest.fn(() => Promise.resolve(false)),
  resetGenericPassword: jest.fn(() => Promise.resolve(true)),
  getSupportedBiometryType: jest.fn(() => Promise.resolve('FaceID')),
  ACCESS_CONTROL: {
    BIOMETRY_ANY: 'BIOMETRY_ANY',
    BIOMETRY_ANY_OR_DEVICE_PASSCODE: 'BIOMETRY_ANY_OR_DEVICE_PASSCODE',
  },
  AUTHENTICATION_TYPE: {
    DEVICE_PASSCODE_OR_BIOMETRICS: 'DEVICE_PASSCODE_OR_BIOMETRICS',
  },
}));

// Mock react-native-config
jest.mock('react-native-config', () => ({
  WALLETCONNECT_PROJECT_ID: 'test_project_id',
  SWAP_API_BASE_URL: '',
}));

jest.mock('react-native-bootsplash', () => ({
  __esModule: true,
  default: {
    hide: jest.fn(() => Promise.resolve()),
    isVisible: jest.fn(() => true),
  },
}));

// Mock react-native-encrypted-storage
jest.mock('react-native-encrypted-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
}));

// Mock @react-native-async-storage/async-storage
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
  getAllKeys: jest.fn(() => Promise.resolve([])),
  multiGet: jest.fn(() => Promise.resolve([])),
  multiSet: jest.fn(() => Promise.resolve()),
}));

// Mock react-native-get-random-values
jest.mock('react-native-get-random-values', () => ({}));

// Mock Realm
jest.mock('realm', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    write: jest.fn(callback => callback()),
    objects: jest.fn(() => ({
      filtered: jest.fn(() => []),
      sorted: jest.fn(() => []),
    })),
    create: jest.fn(),
    delete: jest.fn(),
    deleteAll: jest.fn(),
    objectForPrimaryKey: jest.fn(),
    close: jest.fn(),
    isClosed: false,
  })),
  open: jest.fn(() =>
    Promise.resolve({
      write: jest.fn(callback => callback()),
      objects: jest.fn(() => ({
        filtered: jest.fn(() => []),
        sorted: jest.fn(() => []),
      })),
      create: jest.fn(),
      delete: jest.fn(),
      deleteAll: jest.fn(),
      objectForPrimaryKey: jest.fn(),
      close: jest.fn(),
      isClosed: false,
      compact: jest.fn(() => true),
    }),
  ),
}));

// Mock Realm services
jest.mock('./src/realm/services', () => ({
  addressBookService: {
    getAll: jest.fn(() => Promise.resolve([])),
    getFavorites: jest.fn(() => Promise.resolve([])),
    search: jest.fn(() => Promise.resolve([])),
    getByAddress: jest.fn(() => Promise.resolve(null)),
    create: jest.fn(() => Promise.resolve({})),
    update: jest.fn(() => Promise.resolve(null)),
    delete: jest.fn(() => Promise.resolve(true)),
    toggleFavorite: jest.fn(() => Promise.resolve(true)),
  },
  tokenListService: {
    getVisibleTokens: jest.fn(() => Promise.resolve([])),
    getHiddenTokens: jest.fn(() => Promise.resolve([])),
    getCustomTokens: jest.fn(() => Promise.resolve([])),
    hideToken: jest.fn(() => Promise.resolve(true)),
    showToken: jest.fn(() => Promise.resolve(true)),
    markAsSpam: jest.fn(() => Promise.resolve(true)),
  },
  transactionCacheService: {
    getByAddress: jest.fn(() => Promise.resolve([])),
    getPendingTransactions: jest.fn(() => Promise.resolve([])),
    getByHash: jest.fn(() => Promise.resolve(null)),
    getRecent: jest.fn(() => Promise.resolve([])),
    createLocalTransaction: jest.fn(() => Promise.resolve({})),
    syncTransactions: jest.fn(() => Promise.resolve(0)),
  },
  syncStatusService: {
    getSyncStatus: jest.fn(() => Promise.resolve(null)),
    needsSync: jest.fn(() => Promise.resolve(true)),
    startSync: jest.fn(() => Promise.resolve()),
    completeSync: jest.fn(() => Promise.resolve()),
    syncError: jest.fn(() => Promise.resolve()),
  },
  wcLogService: {
    getActiveSessions: jest.fn(() => Promise.resolve([])),
    getSessionHistory: jest.fn(() => Promise.resolve([])),
    markExpiredSessions: jest.fn(() => Promise.resolve(0)),
    logSessionConnected: jest.fn(() => Promise.resolve({})),
    logSessionDisconnected: jest.fn(() => Promise.resolve(true)),
    logRequest: jest.fn(() => Promise.resolve({})),
  },
  userPreferencesService: {
    getOrDefault: jest.fn(() => Promise.resolve('USD')),
    get: jest.fn(() => Promise.resolve('USD')),
    set: jest.fn(() => Promise.resolve()),
    loadAll: jest.fn(() => Promise.resolve()),
  },
  PREFERENCE_KEYS: {
    CURRENCY: 'display.currency',
    THEME: 'display.theme',
    HIDE_BALANCE: 'display.hideBalance',
  },
}));

// Mock Realm hooks
jest.mock('./src/realm/hooks', () => ({
  useAddressBook: jest.fn(() => ({
    addresses: [],
    isLoading: false,
    addAddress: jest.fn(),
    updateAddress: jest.fn(),
    deleteAddress: jest.fn(),
    toggleFavorite: jest.fn(),
    refetch: jest.fn(),
  })),
  useFavoriteAddresses: jest.fn(() => ({
    favorites: [],
    isLoading: false,
  })),
  useAddressSearch: jest.fn(() => ({
    results: [],
    isSearching: false,
  })),
  useAddressName: jest.fn(() => ({
    name: null,
    isLoading: false,
  })),
  useTransactions: jest.fn(() => ({
    transactions: [],
    isLoading: false,
    refetch: jest.fn(),
  })),
  useWCActiveSessions: jest.fn(() => ({
    sessions: [],
    isLoading: false,
    count: 0,
    refetch: jest.fn(),
    logSessionConnected: jest.fn(),
    logSessionDisconnected: jest.fn(),
  })),
  useWCRequestLog: jest.fn(() => ({
    requests: [],
    isLoading: false,
    logRequest: jest.fn(),
  })),
  PREFERENCE_KEYS: {
    CURRENCY: 'display.currency',
    THEME: 'display.theme',
    HIDE_BALANCE: 'display.hideBalance',
  },
}));

// Mock Realm database initialization
jest.mock('./src/realm', () => ({
  initializeRealm: jest.fn(() => Promise.resolve()),
  closeRealm: jest.fn(),
  realmDB: {
    initialize: jest.fn(() => Promise.resolve()),
    getRealm: jest.fn(() => Promise.resolve({})),
    isInitialized: jest.fn(() => true),
    close: jest.fn(),
  },
  userPreferencesService: {
    loadAll: jest.fn(() => Promise.resolve()),
  },
}));

// Mock react-native-vision-camera
jest.mock('react-native-vision-camera', () => ({
  Camera: jest.fn(() => null),
  useCameraDevice: jest.fn(() => null),
  useCameraPermission: jest.fn(() => ({
    hasPermission: false,
    requestPermission: jest.fn(() => Promise.resolve(true)),
  })),
  useCodeScanner: jest.fn(() => null),
}));

// Mock @react-native-community/netinfo
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(() =>
    Promise.resolve({
      isConnected: true,
      isInternetReachable: true,
    }),
  ),
}));

// Mock @walletconnect packages
jest.mock('@walletconnect/core', () => ({
  Core: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@reown/walletkit', () => ({
  WalletKit: {
    init: jest.fn(() =>
      Promise.resolve({
        on: jest.fn(),
        pair: jest.fn(),
        approveSession: jest.fn(),
        rejectSession: jest.fn(),
        respondSessionRequest: jest.fn(),
        getActiveSessions: jest.fn(() => ({})),
        disconnectSession: jest.fn(),
      }),
    ),
  },
}));

// Mock react-navigation
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    reset: jest.fn(),
  }),
  useRoute: () => ({
    params: {},
  }),
}));

// Silence the warning: Animated: `useNativeDriver` is not supported
// moduleNameMapper에서 처리됨

// Suppress console warnings for deprecation notices
const originalWarn = console.warn;
console.warn = (...args) => {
  // SafeAreaView deprecation warning 억제
  if (
    typeof args[0] === 'string' &&
    (args[0].includes('SafeAreaView has been deprecated') ||
      args[0].includes('Clipboard has been extracted'))
  ) {
    return;
  }
  originalWarn(...args);
};

// Global test timeout
jest.setTimeout(30000);

// react-native-safe-area-context: 공식 jest 목 (Provider 없이도 기본 inset 제공)
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);

// iOS의 RN Modal은 표시/닫힘 애니메이션이 끝나면 onShow/onDismiss를 보낸다.
// 기본 Jest 목은 이 이벤트를 보내지 않으므로, AppModal의 iOS 표시 조정(형제 모달이
// 닫힌 뒤에 다음 모달을 띄움)이 실제처럼 이어지도록 visible 변화에 맞춰 즉시 보낸다.
jest.mock('react-native/Libraries/Modal/Modal', () => {
  const BaseModal = jest.requireActual('react-native/jest/mocks/Modal').default;
  class Modal extends BaseModal {
    componentDidMount() {
      if (super.componentDidMount) super.componentDidMount();
      if (this.props.visible !== false && this.props.onShow) {
        this.props.onShow({ nativeEvent: null });
      }
    }
    componentDidUpdate(prevProps, prevState, snapshot) {
      if (super.componentDidUpdate) {
        super.componentDidUpdate(prevProps, prevState, snapshot);
      }
      const wasVisible = prevProps.visible !== false;
      const isVisible = this.props.visible !== false;
      if (!wasVisible && isVisible && this.props.onShow) {
        this.props.onShow({ nativeEvent: null });
      }
      if (wasVisible && !isVisible && this.props.onDismiss) {
        this.props.onDismiss();
      }
    }
  }
  return { __esModule: true, default: Modal };
});

// 루트 모달 표시 상태(모듈 전역)가 테스트 사이에 남지 않게 한다.
beforeEach(() => {
  require('./src/components/common/modalPresence').resetModalPresence();
});

// 표시 통화 기본값(KRW)으로 화면을 렌더링하면 환율 조회가 실행된다.
// 테스트에서 실제 네트워크 요청이 나가지 않도록 기본적으로 막고,
// fiatService 자체 테스트에서는 mockRestore로 원래 동작을 사용한다.
beforeEach(() => {
  const { fiatService } = require('./src/services/fiatService');
  jest.spyOn(fiatService, 'refresh').mockResolvedValue(undefined);
});
