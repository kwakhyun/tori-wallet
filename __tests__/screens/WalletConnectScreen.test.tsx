/**
 * WalletConnect 화면: 페어링(입력/붙여넣기/QR/라우트 URI), 설정 누락 상태, 세션 목록 동기화
 * (서명 요청 처리는 WalletConnectHost 테스트에서 검증한다.)
 */

import React from 'react';
import { Alert, Clipboard } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from 'styled-components/native';
import { darkTheme } from '../../src/styles/theme';

const mockAddress = '0x1234567890123456789012345678901234567890';
const VALID_URI = `wc:${'a'.repeat(
  64,
)}@2?relay-protocol=irn&symKey=${'b'.repeat(64)}`;
let mockRouteParams: any = {};
let mockSessions: any[] = [];
let mockStatus = 'ready';
let mockSessionsListener: ((event: any) => void) | null = null;
let mockScannerProps: any;
const mockShowToast = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), canGoBack: () => true }),
  useRoute: () => ({ params: mockRouteParams }),
}));
jest.mock('../../src/hooks/useTheme', () => ({
  useTheme: () => ({ isDarkMode: true }),
}));
jest.mock('../../src/store/walletStore', () => ({
  useWalletStore: (selector: any) =>
    selector({
      wallets: [{ address: mockAddress, name: '메인 계정' }],
      networks: [
        { chainId: 1, name: 'Ethereum Mainnet' },
        { chainId: 137, name: 'Polygon' },
      ],
    }),
}));
jest.mock('../../src/store/toastStore', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));
jest.mock('../../src/components/common/QRScanner', () => ({
  QRScanner: (props: any) => {
    mockScannerProps = props;
    return null;
  },
}));
jest.mock('../../src/services/wcService', () => {
  const actual = jest.requireActual('../../src/services/wcService');
  return {
    ...actual,
    wcService: {
      initialize: jest.fn().mockResolvedValue(undefined),
      getStatus: () => mockStatus,
      isConfigured: () => mockStatus !== 'not_configured',
      onStatusChange: jest.fn(() => jest.fn()),
      onSessionsChanged: jest.fn((listener: any) => {
        mockSessionsListener = listener;
        return jest.fn();
      }),
      getActiveSessions: () => mockSessions,
      pairWithUri: jest.fn().mockResolvedValue(undefined),
      disconnectSession: jest.fn().mockResolvedValue(undefined),
      rejectRequest: jest.fn(),
    },
  };
});

import WalletConnectScreen from '../../src/screens/WalletConnect/WalletConnectScreen';
import { wcService } from '../../src/services/wcService';

const mount = () =>
  render(
    <ThemeProvider theme={darkTheme}>
      <WalletConnectScreen />
    </ThemeProvider>,
  );

const flush = async () => {
  for (let i = 0; i < 3; i += 1)
    await new Promise(resolve => setImmediate(resolve));
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRouteParams = {};
  mockStatus = 'ready';
  mockSessionsListener = null;
  mockSessions = [
    {
      topic: 'session',
      name: 'Uniswap',
      url: 'https://app.uniswap.org',
      chains: ['eip155:1', 'eip155:137'],
      accounts: [`eip155:1:${mockAddress}`, `eip155:137:${mockAddress}`],
      expiry: 9999999999,
    },
  ];
});

describe('WalletConnectScreen', () => {
  it('uses the shared header and shows chain names and the connected account', async () => {
    const view = mount();
    await act(flush);
    expect(view.getByText('WalletConnect')).toBeTruthy();
    expect(view.getByLabelText('뒤로 가기')).toBeTruthy();
    expect(view.getByText('네트워크: Ethereum Mainnet, Polygon')).toBeTruthy();
    expect(view.getByText('계정: 메인 계정 · 0x1234…7890')).toBeTruthy();
    expect(view.queryByText(/eip155:1/)).toBeNull();
  });

  it('refreshes the session list when a dApp disconnects', async () => {
    const view = mount();
    await act(flush);
    expect(view.getByText('Uniswap')).toBeTruthy();
    mockSessions = [];
    act(() =>
      mockSessionsListener?.({ reason: 'deleted_by_peer', topic: 'session' }),
    );
    expect(view.queryByText('Uniswap')).toBeNull();
    expect(view.getByText('연결된 dApp이 없습니다')).toBeTruthy();
  });

  it('asks for confirmation before disconnecting', async () => {
    const alert = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);
    const view = mount();
    await act(flush);
    fireEvent.press(view.getByLabelText('Uniswap 연결 해제'));
    expect(wcService.disconnectSession).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2] as any[];
    await act(async () => {
      await buttons.find(button => button.style === 'destructive').onPress();
    });
    expect(wcService.disconnectSession).toHaveBeenCalledWith('session');
    expect(mockShowToast).toHaveBeenCalledWith(
      'Uniswap 연결을 해제했습니다.',
      'success',
    );
    alert.mockRestore();
  });

  it('shows the not-configured state and disables pairing', async () => {
    mockStatus = 'not_configured';
    const view = mount();
    await act(flush);
    expect(
      view.getByText(
        'WalletConnect가 설정되지 않았습니다 (개발 빌드: WALLETCONNECT_PROJECT_ID 필요)',
      ),
    ).toBeTruthy();
    fireEvent.press(view.getByTestId('wc-connect-button'));
    fireEvent.press(view.getByTestId('wc-scan-button'));
    expect(wcService.pairWithUri).not.toHaveBeenCalled();
    expect(mockScannerProps.visible).toBe(false);
    expect(
      view.getByTestId('wc-connect-button').props.accessibilityState,
    ).toMatchObject({
      disabled: true,
    });
  });

  it('shows a clear inline error for v1 or malformed URIs', async () => {
    const view = mount();
    await act(flush);
    fireEvent.changeText(
      view.getByTestId('wc-uri-input'),
      'wc:abc@1?bridge=x&key=y',
    );
    await act(async () => {
      fireEvent.press(view.getByTestId('wc-connect-button'));
    });
    expect(view.getByTestId('wc-uri-error').props.children).toContain('v1');
    expect(wcService.pairWithUri).not.toHaveBeenCalled();
  });

  it('pairs from the clipboard and from a scanned QR code', async () => {
    (Clipboard.getString as jest.Mock).mockResolvedValueOnce(VALID_URI);
    const view = mount();
    await act(flush);
    await act(async () => {
      fireEvent.press(view.getByTestId('wc-paste-button'));
      await flush();
    });
    expect(wcService.pairWithUri).toHaveBeenCalledWith(VALID_URI);

    fireEvent.press(view.getByTestId('wc-scan-button'));
    expect(mockScannerProps.visible).toBe(true);
    expect(mockScannerProps.mode).toBe('walletconnect');
    const scanned = `wc:${'c'.repeat(
      64,
    )}@2?relay-protocol=irn&symKey=${'d'.repeat(64)}`;
    await act(async () => {
      mockScannerProps.onScan({
        kind: 'walletconnect',
        uri: scanned,
        raw: scanned,
      });
      await flush();
    });
    expect(wcService.pairWithUri).toHaveBeenLastCalledWith(scanned);
  });

  it('auto-pairs a URI passed through route params', async () => {
    mockRouteParams = { uri: VALID_URI };
    mount();
    await act(flush);
    expect(wcService.pairWithUri).toHaveBeenCalledTimes(1);
    expect(wcService.pairWithUri).toHaveBeenCalledWith(VALID_URI);
  });

  it('does not reject anything when the screen unmounts', async () => {
    const view = mount();
    await act(flush);
    view.unmount();
    expect(wcService.rejectRequest).not.toHaveBeenCalled();
  });
});
