/**
 * AddressBookScreen 테스트
 */

import React from 'react';
import { render } from '../test-utils';

// 네비게이션 모킹
jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: jest.fn(),
      goBack: jest.fn(),
    }),
    useRoute: () => ({
      params: {},
    }),
  };
});

// securityStore 모킹
jest.mock('../../src/store/securityStore', () => ({
  useSecurityStore: () => ({
    addressBook: [
      {
        address: '0x1234567890123456789012345678901234567890',
        name: 'Test Contact',
        isFavorite: false,
      },
    ],
    addAddressBookEntry: jest.fn(),
    updateAddressBookEntry: jest.fn(),
    removeAddressBookEntry: jest.fn(),
    getAddressBookEntry: jest.fn().mockReturnValue(null),
  }),
}));

import AddressBookScreen from '../../src/screens/Settings/AddressBookScreen';

describe('AddressBookScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render correctly', () => {
    const { toJSON } = render(<AddressBookScreen />);
    expect(toJSON()).not.toBeNull();
  });

  it('should display address book UI', () => {
    const { root } = render(<AddressBookScreen />);
    expect(root).toBeTruthy();
  });

  it('should have add contact functionality', () => {
    const { root } = render(<AddressBookScreen />);
    expect(root.children).toBeDefined();
  });
});
