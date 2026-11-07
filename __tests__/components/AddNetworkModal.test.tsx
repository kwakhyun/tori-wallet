/**
 * 커스텀 네트워크 추가 모달 테스트
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from 'styled-components/native';
import { darkTheme } from '../../src/styles/theme';
import { AddNetworkModal } from '../../src/components/network/AddNetworkModal';
import { chainClient } from '../../src/services/chainClient';
import { customNetworkRegistry } from '../../src/services/customNetworks';
import { useWalletStore } from '../../src/store/walletStore';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), canGoBack: () => true }),
}));

const initial = useWalletStore.getState();

function fillForm(overrides: Record<string, string> = {}) {
  const values = {
    'add-network-name': 'BNB Smart Chain',
    'add-network-rpc': 'https://bsc-dataseed.binance.org',
    'add-network-chain-id': '56',
    'add-network-symbol': 'BNB',
    ...overrides,
  };
  Object.entries(values).forEach(([testID, value]) =>
    fireEvent.changeText(screen.getByTestId(testID), value),
  );
}

describe('AddNetworkModal', () => {
  let verifySpy: jest.SpyInstance;

  beforeEach(() => {
    useWalletStore.setState(initial);
    verifySpy = jest.spyOn(chainClient, 'verifyRpcChainId');
  });

  afterEach(() => {
    verifySpy.mockRestore();
    customNetworkRegistry.set([]);
  });

  const renderModal = (onAdded = jest.fn()) => {
    render(
      <ThemeProvider theme={darkTheme}>
        <AddNetworkModal visible onClose={jest.fn()} onAdded={onAdded} />
      </ThemeProvider>,
    );
    return onAdded;
  };

  it('adds the network after the RPC confirms the chain ID', async () => {
    verifySpy.mockResolvedValue({ ok: true });
    const onAdded = renderModal();
    fillForm();

    await act(async () => {
      fireEvent.press(screen.getByTestId('add-network-submit'));
    });

    expect(verifySpy).toHaveBeenCalledWith(
      'https://bsc-dataseed.binance.org',
      56,
    );
    const added = useWalletStore
      .getState()
      .networks.find(network => network.chainId === 56);
    expect(added).toMatchObject({ symbol: 'BNB', isCustom: true });
    expect(onAdded).toHaveBeenCalledWith(
      expect.objectContaining({ chainId: 56 }),
    );
  });

  it('rejects an RPC that reports a different chain ID', async () => {
    verifySpy.mockResolvedValue({
      ok: false,
      reason: 'mismatch',
      actualChainId: 1,
    });
    const onAdded = renderModal();
    fillForm();

    await act(async () => {
      fireEvent.press(screen.getByTestId('add-network-submit'));
    });

    expect(screen.getByText(/RPC가 알려준 체인 ID는 1입니다/)).toBeTruthy();
    expect(
      useWalletStore
        .getState()
        .networks.some(network => network.chainId === 56),
    ).toBe(false);
    expect(onAdded).not.toHaveBeenCalled();
  });

  it('rejects built-in chain IDs and http RPC URLs before calling the RPC', async () => {
    renderModal();
    fillForm({
      'add-network-chain-id': '1',
      'add-network-rpc': 'http://insecure.example',
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('add-network-submit'));
    });

    expect(
      screen.getByText('이미 기본으로 제공되는 네트워크입니다.'),
    ).toBeTruthy();
    expect(screen.getByText(/https:\/\/로 시작하는/)).toBeTruthy();
    expect(verifySpy).not.toHaveBeenCalled();
  });
});
