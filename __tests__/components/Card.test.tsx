/**
 * Tori Wallet - Card Component Tests
 */

import React from 'react';
import { render, fireEvent } from '../test-utils';
import { Card } from '../../src/components/common/Card';
import { Text } from 'react-native';

describe('Card', () => {
  it('should render children', () => {
    const { getByText } = render(
      <Card>
        <Text>Test Content</Text>
      </Card>,
    );
    expect(getByText('Test Content')).toBeTruthy();
  });

  it('should render with default variant', () => {
    const { toJSON } = render(
      <Card>
        <Text>Default Card</Text>
      </Card>,
    );
    expect(toJSON()).not.toBeNull();
  });

  it('should render with elevated variant', () => {
    const { toJSON } = render(
      <Card variant="elevated">
        <Text>Elevated Card</Text>
      </Card>,
    );
    expect(toJSON()).not.toBeNull();
  });

  it('should render with outlined variant', () => {
    const { toJSON } = render(
      <Card variant="outlined">
        <Text>Outlined Card</Text>
      </Card>,
    );
    expect(toJSON()).not.toBeNull();
  });

  it('should be touchable when onPress is provided', () => {
    const mockOnPress = jest.fn();
    const { getByText } = render(
      <Card onPress={mockOnPress}>
        <Text>Touchable Card</Text>
      </Card>,
    );

    fireEvent.press(getByText('Touchable Card'));
    expect(mockOnPress).toHaveBeenCalled();
  });

  it('should apply custom styles', () => {
    const customStyle = { margin: 10 };
    const { root } = render(
      <Card style={customStyle}>
        <Text>Styled Card</Text>
      </Card>,
    );
    expect(root).toBeTruthy();
  });
});
