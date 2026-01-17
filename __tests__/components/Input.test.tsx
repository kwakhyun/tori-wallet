/**
 * 인풋 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from 'styled-components/native';
import { theme } from '../../src/styles/theme';
import { Input } from '../../src/components/common/Input';

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('Input Component', () => {
  it('should render with placeholder', () => {
    renderWithTheme(<Input placeholder="Enter text" />);
    expect(screen.getByPlaceholderText('Enter text')).toBeTruthy();
  });

  it('should render with label', () => {
    renderWithTheme(<Input label="Username" placeholder="Enter username" />);
    expect(screen.getByText('Username')).toBeTruthy();
  });

  it('should render with testID', () => {
    renderWithTheme(<Input testID="test-input" placeholder="Test" />);
    expect(screen.getByTestId('test-input')).toBeTruthy();
  });

  it('should handle text change', () => {
    const onChangeTextMock = jest.fn();
    renderWithTheme(
      <Input placeholder="Type here" onChangeText={onChangeTextMock} />,
    );

    fireEvent.changeText(screen.getByPlaceholderText('Type here'), 'Hello');
    expect(onChangeTextMock).toHaveBeenCalledWith('Hello');
  });

  it('should display error message', () => {
    renderWithTheme(
      <Input placeholder="Email" error="Invalid email address" />,
    );
    expect(screen.getByText('Invalid email address')).toBeTruthy();
  });

  it('should display helper text when no error', () => {
    renderWithTheme(
      <Input placeholder="Password" helper="At least 8 characters" />,
    );
    expect(screen.getByText('At least 8 characters')).toBeTruthy();
  });

  it('should not display helper when error is shown', () => {
    renderWithTheme(
      <Input
        placeholder="Password"
        helper="At least 8 characters"
        error="Password is required"
      />,
    );
    expect(screen.queryByText('At least 8 characters')).toBeNull();
    expect(screen.getByText('Password is required')).toBeTruthy();
  });

  it('should handle focus', () => {
    renderWithTheme(<Input placeholder="Focus test" />);
    const input = screen.getByPlaceholderText('Focus test');

    fireEvent(input, 'focus');
    // 포커스 후에도 인풋이 여전히 존재
    expect(screen.getByPlaceholderText('Focus test')).toBeTruthy();
  });

  it('should handle blur', () => {
    renderWithTheme(<Input placeholder="Blur test" />);
    const input = screen.getByPlaceholderText('Blur test');

    fireEvent(input, 'focus');
    fireEvent(input, 'blur');
    expect(screen.getByPlaceholderText('Blur test')).toBeTruthy();
  });

  it('should be accessible with label', () => {
    renderWithTheme(<Input label="Email Address" placeholder="Enter email" />);
    const input = screen.getByPlaceholderText('Enter email');
    expect(input.props.accessibilityLabel).toBe('Email Address');
  });

  it('should use placeholder as accessibility label when no label', () => {
    renderWithTheme(<Input placeholder="Enter your name" />);
    const input = screen.getByPlaceholderText('Enter your name');
    expect(input.props.accessibilityLabel).toBe('Enter your name');
  });

  it('should have accessibility hint from helper', () => {
    renderWithTheme(
      <Input placeholder="Password" helper="Minimum 8 characters" />,
    );
    const input = screen.getByPlaceholderText('Password');
    expect(input.props.accessibilityHint).toBe('Minimum 8 characters');
  });

  it('should handle secureTextEntry for password', () => {
    renderWithTheme(<Input placeholder="Password" secureTextEntry={true} />);
    const input = screen.getByPlaceholderText('Password');
    expect(input.props.secureTextEntry).toBe(true);
  });

  it('should handle multiline input', () => {
    renderWithTheme(<Input placeholder="Description" multiline={true} />);
    const input = screen.getByPlaceholderText('Description');
    expect(input.props.multiline).toBe(true);
  });

  it('should handle editable prop', () => {
    renderWithTheme(<Input placeholder="Read only" editable={false} />);
    const input = screen.getByPlaceholderText('Read only');
    expect(input.props.editable).toBe(false);
  });

  it('should handle keyboard type', () => {
    renderWithTheme(<Input placeholder="Email" keyboardType="email-address" />);
    const input = screen.getByPlaceholderText('Email');
    expect(input.props.keyboardType).toBe('email-address');
  });
});
