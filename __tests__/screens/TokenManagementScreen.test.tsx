/**
 * TokenManagementScreen 테스트
 * - 기본/사용자 토큰 표시 여부 토글
 * - 컨트랙트 주소로 사용자 토큰 추가 (검증 → 체인 조회 → 확인 → 저장)
 * - 사용자 토큰 삭제
 */

import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor, act } from '../test-utils';

jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: jest.fn(),
      goBack: jest.fn(),
      canGoBack: () => true,
    }),
  };
});

jest.mock('../../src/store/walletStore', () => ({
  useWalletStore: () => ({
    networks: [{ chainId: 1, name: 'Ethereum', symbol: 'ETH' }],
    activeNetworkChainId: 1,
  }),
}));

const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const LINK = '0x514910771AF9Ca656af840dff83E8264EcF986CA';
const CUSTOM = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984';

const mockGetTokenMetadata = jest.fn();
jest.mock('../../src/services/tokenService', () => ({
  tokenService: {
    getDefaultTokens: () => [
      { symbol: 'ETH', name: 'Ethereum', address: 'native', decimals: 18 },
      {
        symbol: 'USDT',
        name: 'Tether USD',
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        decimals: 6,
        coingeckoId: 'tether',
      },
    ],
    getTokenMetadata: (...args: unknown[]) => mockGetTokenMetadata(...args),
  },
}));

const mockAddCustomToken = jest.fn();
const mockRemoveCustomToken = jest.fn();
const mockSetHidden = jest.fn();
let mockCustomTokens: unknown[] = [];
let mockHidden = new Set<string>();

jest.mock('../../src/realm/hooks/useTokenList', () => ({
  useCustomTokens: () => ({
    tokens: mockCustomTokens,
    isLoading: false,
    addCustomToken: mockAddCustomToken,
    removeCustomToken: mockRemoveCustomToken,
  }),
  useTokenVisibility: () => ({
    hiddenAddresses: mockHidden,
    isLoading: false,
    setHidden: mockSetHidden,
  }),
}));

import TokenManagementScreen, {
  FAKE_TOKEN_WARNING,
} from '../../src/screens/Assets/TokenManagementScreen';

/** Alert.alert의 특정 버튼을 누른다 */
function pressAlertButton(text: string) {
  const call = (Alert.alert as jest.Mock).mock.calls.at(-1);
  const buttons = call[2] as { text: string; onPress?: () => unknown }[];
  return buttons.find(b => b.text === text)?.onPress?.();
}

describe('TokenManagementScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockCustomTokens = [];
    mockHidden = new Set();
    mockSetHidden.mockResolvedValue(true);
    mockAddCustomToken.mockResolvedValue({});
    mockRemoveCustomToken.mockResolvedValue(true);
  });

  it('lists default tokens with visibility toggles (native cannot be hidden)', () => {
    render(<TokenManagementScreen />);
    expect(screen.getByTestId('token-manage-row-native')).toBeTruthy();
    expect(screen.getByTestId(`token-manage-row-${USDT}`)).toBeTruthy();
    expect(
      screen.getByTestId('token-manage-toggle-native').props.disabled,
    ).toBe(true);
    expect(screen.getByTestId(`token-manage-toggle-${USDT}`).props.value).toBe(
      true,
    );
  });

  it('hides a default token through the Realm token list', async () => {
    render(<TokenManagementScreen />);
    await act(async () => {
      fireEvent(
        screen.getByTestId(`token-manage-toggle-${USDT}`),
        'valueChange',
        false,
      );
    });
    expect(mockSetHidden).toHaveBeenCalledWith(
      expect.objectContaining({
        address: USDT,
        chainId: 1,
        symbol: 'USDT',
        decimals: 6,
        isCustom: false,
      }),
      true,
    );
  });

  it('shows hidden tokens as switched off and can show them again', async () => {
    mockHidden = new Set([USDT.toLowerCase()]);
    render(<TokenManagementScreen />);
    const toggle = screen.getByTestId(`token-manage-toggle-${USDT}`);
    expect(toggle.props.value).toBe(false);
    await act(async () => {
      fireEvent(toggle, 'valueChange', true);
    });
    expect(mockSetHidden).toHaveBeenCalledWith(
      expect.objectContaining({ address: USDT }),
      false,
    );
  });

  it('warns that anyone can create tokens with fake names', () => {
    render(<TokenManagementScreen />);
    expect(screen.getByTestId('token-manage-warning')).toHaveTextContent(
      `⚠️ ${FAKE_TOKEN_WARNING}`,
    );
  });

  it('rejects an invalid contract address without any lookup', () => {
    render(<TokenManagementScreen />);
    fireEvent.changeText(screen.getByTestId('token-manage-input'), '0x1234');
    fireEvent.press(screen.getByTestId('token-manage-add'));
    expect(screen.getByTestId('token-manage-error')).toHaveTextContent(
      /올바른 컨트랙트 주소/,
    );
    expect(mockGetTokenMetadata).not.toHaveBeenCalled();
  });

  it('reads token metadata on-chain and adds it after confirmation', async () => {
    mockGetTokenMetadata.mockResolvedValue({
      address: LINK,
      symbol: 'LINK',
      name: 'Chainlink',
      decimals: 18,
    });
    render(<TokenManagementScreen />);
    fireEvent.changeText(screen.getByTestId('token-manage-input'), LINK);
    await act(async () => {
      fireEvent.press(screen.getByTestId('token-manage-add'));
    });

    expect(mockGetTokenMetadata).toHaveBeenCalledWith(LINK, 1);
    const [title, message] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(title).toBe('이 토큰을 추가할까요?');
    expect(message).toContain('Chainlink (LINK)');
    expect(message).toContain(FAKE_TOKEN_WARNING);
    expect(mockAddCustomToken).not.toHaveBeenCalled();

    await act(async () => {
      await pressAlertButton('추가');
    });
    expect(mockAddCustomToken).toHaveBeenCalledWith({
      address: LINK,
      chainId: 1,
      symbol: 'LINK',
      name: 'Chainlink',
      decimals: 18,
    });
  });

  it('does not add when the confirmation is cancelled', async () => {
    mockGetTokenMetadata.mockResolvedValue({
      address: LINK,
      symbol: 'LINK',
      name: 'Chainlink',
      decimals: 18,
    });
    render(<TokenManagementScreen />);
    fireEvent.changeText(screen.getByTestId('token-manage-input'), LINK);
    await act(async () => {
      fireEvent.press(screen.getByTestId('token-manage-add'));
    });
    pressAlertButton('취소');
    expect(mockAddCustomToken).not.toHaveBeenCalled();
  });

  it('shows the lookup error when the address is not an ERC-20 token', async () => {
    mockGetTokenMetadata.mockRejectedValue(
      new Error('이 네트워크에서 ERC-20 토큰 정보를 읽을 수 없습니다.'),
    );
    render(<TokenManagementScreen />);
    fireEvent.changeText(screen.getByTestId('token-manage-input'), LINK);
    await act(async () => {
      fireEvent.press(screen.getByTestId('token-manage-add'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('token-manage-error')).toHaveTextContent(
        /ERC-20 토큰 정보를 읽을 수 없습니다/,
      );
    });
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('refuses to add a token that is already listed', () => {
    render(<TokenManagementScreen />);
    fireEvent.changeText(
      screen.getByTestId('token-manage-input'),
      USDT.toLowerCase(),
    );
    fireEvent.press(screen.getByTestId('token-manage-add'));
    expect(screen.getByTestId('token-manage-error')).toHaveTextContent(
      /이미 목록에 있는 토큰/,
    );
  });

  it('removes a custom token after confirmation', async () => {
    mockCustomTokens = [
      {
        address: CUSTOM.toLowerCase(),
        chainId: 1,
        symbol: 'UNI',
        name: 'Uniswap',
        decimals: 18,
        isCustom: true,
        isHidden: false,
        isSpam: false,
      },
    ];
    render(<TokenManagementScreen />);
    const key = CUSTOM.toLowerCase();
    expect(screen.getByTestId(`token-manage-row-${key}`)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('UNI 삭제'));
    await act(async () => {
      await pressAlertButton('삭제');
    });
    expect(mockRemoveCustomToken).toHaveBeenCalledWith(key, 1);
  });
});
