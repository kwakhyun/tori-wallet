/**
 * 버튼 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from 'styled-components/native';
import { theme } from '../../src/styles/theme';
import { Button } from '../../src/components/common/Button';

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('Button Component', () => {
  it('should render with title', () => {
    renderWithTheme(<Button title="Test Button" />);
    expect(screen.getByText('Test Button')).toBeTruthy();
  });

  it('should handle onPress', () => {
    const onPressMock = jest.fn();
    renderWithTheme(<Button title="Click Me" onPress={onPressMock} />);

    fireEvent.press(screen.getByText('Click Me'));
    expect(onPressMock).toHaveBeenCalledTimes(1);
  });

  it('should render with testID', () => {
    renderWithTheme(<Button title="Test" testID="test-button" />);
    expect(screen.getByTestId('test-button')).toBeTruthy();
  });

  it('should be accessible', () => {
    renderWithTheme(<Button title="Accessible Button" />);
    const button = screen.getByRole('button');
    expect(button).toBeTruthy();
  });

  it('should show loading indicator when loading', () => {
    renderWithTheme(<Button title="Loading" loading={true} />);
    // 로딩 중에는 텍스트가 표시되지 않음
    expect(screen.queryByText('Loading')).toBeNull();
  });

  it('should not call onPress when disabled', () => {
    const onPressMock = jest.fn();
    renderWithTheme(
      <Button title="Disabled" onPress={onPressMock} disabled={true} />,
    );

    fireEvent.press(screen.getByText('Disabled'));
    expect(onPressMock).not.toHaveBeenCalled();
  });

  it('should not call onPress when loading', () => {
    const onPressMock = jest.fn();
    renderWithTheme(
      <Button title="Loading" onPress={onPressMock} loading={true} />,
    );

    // 로딩 중에는 버튼이 disabled 상태
    const button = screen.getByRole('button');
    fireEvent.press(button);
    expect(onPressMock).not.toHaveBeenCalled();
  });

  it('should render primary variant by default', () => {
    renderWithTheme(<Button title="Primary" />);
    expect(screen.getByText('Primary')).toBeTruthy();
  });

  it('should render secondary variant', () => {
    renderWithTheme(<Button title="Secondary" variant="secondary" />);
    expect(screen.getByText('Secondary')).toBeTruthy();
  });

  it('should render outline variant', () => {
    renderWithTheme(<Button title="Outline" variant="outline" />);
    expect(screen.getByText('Outline')).toBeTruthy();
  });

  it('should render text variant', () => {
    renderWithTheme(<Button title="Text" variant="text" />);
    expect(screen.getByText('Text')).toBeTruthy();
  });

  it('should render small size', () => {
    renderWithTheme(<Button title="Small" size="small" />);
    expect(screen.getByText('Small')).toBeTruthy();
  });

  it('should render medium size by default', () => {
    renderWithTheme(<Button title="Medium" />);
    expect(screen.getByText('Medium')).toBeTruthy();
  });

  it('should render large size', () => {
    renderWithTheme(<Button title="Large" size="large" />);
    expect(screen.getByText('Large')).toBeTruthy();
  });

  it('should render full width', () => {
    renderWithTheme(<Button title="Full Width" fullWidth={true} />);
    expect(screen.getByText('Full Width')).toBeTruthy();
  });

  it('should have correct accessibility state when disabled', () => {
    renderWithTheme(<Button title="Disabled" disabled={true} />);
    const button = screen.getByRole('button');
    expect(button.props.accessibilityState.disabled).toBe(true);
  });
});
