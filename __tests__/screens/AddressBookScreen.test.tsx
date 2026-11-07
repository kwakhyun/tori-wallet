/**
 * AddressBookScreen 테스트
 */

import React from 'react';
import { Clipboard } from 'react-native';
import { act, fireEvent, render, screen } from '../test-utils';
import AddressBookScreen from '../../src/screens/Settings/AddressBookScreen';
import {
  useAddressBook,
  useAddressSearch,
  useFavoriteAddresses,
} from '../../src/realm/hooks';
import { useSecurityStore } from '../../src/store/securityStore';

const mockGoBack = jest.fn();
const mockPopTo = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: mockGoBack,
    popTo: mockPopTo,
    canGoBack: () => true,
  }),
  useRoute: () => ({ params: {} }),
}));

const ALICE = {
  id: 'alice',
  address: '0x1111111111111111111111111111111111111111',
  name: 'Alice',
  chainId: 1,
  isFavorite: true,
  notes: '친구',
  createdAt: new Date(),
  updatedAt: new Date(),
};
const BOB = {
  id: 'bob',
  address: '0x2222222222222222222222222222222222222222',
  name: 'Bob',
  chainId: 1,
  isFavorite: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const NEW_ADDRESS = '0x3333333333333333333333333333333333333333';

const mockUpdateAddress = jest.fn(async () => ({}));
const mockAddAddress = jest.fn(async () => ({}));
const mockToggleFavorite = jest.fn(async () => true);

function mockBook(entries = [ALICE, BOB]) {
  (useAddressBook as jest.Mock).mockReturnValue({
    addresses: entries,
    isLoading: false,
    addAddress: mockAddAddress,
    updateAddress: mockUpdateAddress,
    deleteAddress: jest.fn(async () => true),
    toggleFavorite: mockToggleFavorite,
    refetch: jest.fn(),
  });
  (useFavoriteAddresses as jest.Mock).mockReturnValue({
    favorites: entries.filter(entry => entry.isFavorite),
    isLoading: false,
  });
  (useAddressSearch as jest.Mock).mockReturnValue({
    results: [],
    isSearching: false,
  });
}

describe('AddressBookScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBook();
    useSecurityStore.setState({ recentAddresses: [], addressBook: [] });
  });

  it('renders a header with back and add buttons', () => {
    render(<AddressBookScreen />);
    expect(screen.getByRole('header', { name: '주소록' })).toBeTruthy();
    fireEvent.press(screen.getByTestId('address-book-header-back'));
    expect(mockGoBack).toHaveBeenCalled();
    expect(screen.getByLabelText('주소 추가')).toBeTruthy();
  });

  it('saves the edited address, not only the name', async () => {
    render(<AddressBookScreen />);
    fireEvent.press(screen.getByTestId('address-entry-bob'));
    fireEvent.changeText(
      screen.getByTestId('address-form-address'),
      NEW_ADDRESS,
    );
    fireEvent.changeText(screen.getByTestId('address-form-name'), 'Bobby');

    await act(async () => {
      fireEvent.press(screen.getByTestId('address-form-save'));
    });

    expect(mockUpdateAddress).toHaveBeenCalledWith('bob', {
      name: 'Bobby',
      address: NEW_ADDRESS,
      notes: '',
    });
  });

  it('rejects an edit that duplicates another entry or is invalid', async () => {
    render(<AddressBookScreen />);
    fireEvent.press(screen.getByTestId('address-entry-bob'));

    fireEvent.changeText(
      screen.getByTestId('address-form-address'),
      ALICE.address,
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('address-form-save'));
    });
    expect(
      screen.getByText(/이미 "Alice"\(으\)로 저장된 주소입니다/),
    ).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('address-form-address'), '0x123');
    await act(async () => {
      fireEvent.press(screen.getByTestId('address-form-save'));
    });
    expect(screen.getByText(/올바른 이더리움 주소/)).toBeTruthy();
    expect(mockUpdateAddress).not.toHaveBeenCalled();
  });

  it('adds an address from the clipboard', async () => {
    jest.spyOn(Clipboard, 'getString').mockResolvedValue(NEW_ADDRESS);
    render(<AddressBookScreen />);
    fireEvent.press(screen.getByTestId('address-book-add'));
    fireEvent.changeText(screen.getByTestId('address-form-name'), 'Carol');
    await act(async () => {
      fireEvent.press(screen.getByTestId('address-form-paste'));
    });
    expect(screen.getByTestId('address-form-address').props.value).toBe(
      NEW_ADDRESS,
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('address-form-save'));
    });
    expect(mockAddAddress).toHaveBeenCalledWith(
      expect.objectContaining({ address: NEW_ADDRESS, name: 'Carol' }),
    );
  });

  it('toggles favorites and shows the favorites tab', async () => {
    render(<AddressBookScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('address-favorite-bob'));
    });
    expect(mockToggleFavorite).toHaveBeenCalledWith('bob');

    fireEvent.press(screen.getByTestId('address-book-tab-favorites'));
    expect(screen.getByTestId('address-entry-alice')).toBeTruthy();
    expect(screen.queryByTestId('address-entry-bob')).toBeNull();
  });

  it('filters entries with search', () => {
    (useAddressSearch as jest.Mock).mockImplementation((query: string) => ({
      results: query ? [BOB] : [],
      isSearching: false,
    }));
    render(<AddressBookScreen />);
    fireEvent.changeText(screen.getByTestId('address-book-search'), 'bo');
    expect(useAddressSearch).toHaveBeenLastCalledWith('bo');
    expect(screen.getByTestId('address-entry-bob')).toBeTruthy();
    expect(screen.queryByTestId('address-entry-alice')).toBeNull();
  });

  describe('as a picker', () => {
    it('passes no name for unsaved recent addresses and the saved name otherwise', () => {
      const onSelect = jest.fn();
      useSecurityStore.setState({
        recentAddresses: [
          { address: NEW_ADDRESS as `0x${string}`, lastUsed: Date.now() },
          { address: ALICE.address as `0x${string}`, lastUsed: Date.now() - 1 },
        ],
      });
      render(<AddressBookScreen selectionMode onSelectAddress={onSelect} />);

      fireEvent.press(screen.getByTestId('address-book-tab-recent'));
      fireEvent.press(screen.getByTestId(`recent-entry-${NEW_ADDRESS}`));
      expect(onSelect).toHaveBeenLastCalledWith(NEW_ADDRESS, undefined);
      expect(screen.queryByText('최근 주소')).toBeNull();

      fireEvent.press(screen.getByTestId(`recent-entry-${ALICE.address}`));
      expect(onSelect).toHaveBeenLastCalledWith(ALICE.address, 'Alice');
    });

    it('selects a saved entry with its name and hides management actions', () => {
      const onSelect = jest.fn();
      render(<AddressBookScreen selectionMode onSelectAddress={onSelect} />);
      expect(screen.queryByTestId('address-book-add')).toBeNull();
      expect(screen.queryByTestId('address-delete-bob')).toBeNull();
      fireEvent.press(screen.getByTestId('address-entry-bob'));
      expect(onSelect).toHaveBeenCalledWith(BOB.address, 'Bob');
    });

    it('shows a close button when embedded with onClose', () => {
      const onClose = jest.fn();
      render(
        <AddressBookScreen
          selectionMode
          onSelectAddress={jest.fn()}
          onClose={onClose}
        />,
      );
      fireEvent.press(screen.getByLabelText('닫기'));
      expect(onClose).toHaveBeenCalled();
      expect(mockGoBack).not.toHaveBeenCalled();
    });

    it('never navigates back out of the host screen when embedded without onClose', () => {
      render(<AddressBookScreen selectionMode onSelectAddress={jest.fn()} />);
      expect(screen.queryByLabelText('뒤로 가기')).toBeNull();
    });
  });
});
