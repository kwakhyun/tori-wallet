/**
 * 로고 미리보기 화면 테스트
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from 'styled-components/native';
import { theme } from '../../src/styles/theme';
import { LogoPreviewScreen } from '../../src/screens/Dev/LogoPreviewScreen';

// Logo component mocks
jest.mock('../../src/components/common/Logo', () => ({
  ToriLogo: () => null,
  ToriIcon: () => null,
  ToriText: () => null,
  ToriSplashLogo: () => null,
  ToriMiniIcon: () => null,
  ToriCircleIcon: () => null,
}));

const renderWithProviders = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('LogoPreviewScreen', () => {
  it('should render correctly', () => {
    renderWithProviders(<LogoPreviewScreen />);

    expect(screen.getByText('Tori Wallet Logo Preview')).toBeTruthy();
  });

  it('should display ToriIcon section', () => {
    renderWithProviders(<LogoPreviewScreen />);

    expect(screen.getByText('ToriIcon (앱 아이콘)')).toBeTruthy();
  });

  it('should display ToriMiniIcon section', () => {
    renderWithProviders(<LogoPreviewScreen />);

    expect(screen.getByText('ToriMiniIcon (탭바/헤더)')).toBeTruthy();
  });

  it('should display ToriCircleIcon section', () => {
    renderWithProviders(<LogoPreviewScreen />);

    expect(screen.getByText('ToriCircleIcon (프로필)')).toBeTruthy();
  });

  it('should display ToriText section', () => {
    renderWithProviders(<LogoPreviewScreen />);

    expect(screen.getByText('ToriText (헤더)')).toBeTruthy();
  });

  it('should display ToriLogo section', () => {
    renderWithProviders(<LogoPreviewScreen />);

    expect(screen.getByText('ToriLogo (full)')).toBeTruthy();
  });

  it('should be defined as a function component', () => {
    expect(typeof LogoPreviewScreen).toBe('function');
  });
});
