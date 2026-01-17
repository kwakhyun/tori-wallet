/**
 * 로고 컴포넌트 테스트
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { ToriLogo, ToriIcon, ToriText } from '../../src/components/common/Logo';

describe('ToriLogo', () => {
  it('should render icon variant by default', () => {
    const { toJSON } = render(<ToriLogo />);
    expect(toJSON()).not.toBeNull();
  });

  it('should render with custom size', () => {
    const { toJSON } = render(<ToriLogo size={50} />);
    expect(toJSON()).not.toBeNull();
  });

  it('should render icon variant', () => {
    const { toJSON } = render(<ToriLogo variant="icon" />);
    expect(toJSON()).not.toBeNull();
  });

  it('should render text variant', () => {
    const { toJSON } = render(<ToriLogo variant="text" />);
    expect(toJSON()).not.toBeNull();
  });

  it('should render full variant', () => {
    const { toJSON } = render(<ToriLogo variant="full" />);
    expect(toJSON()).not.toBeNull();
  });

  it('should render with light theme', () => {
    const { toJSON } = render(<ToriLogo theme="light" />);
    expect(toJSON()).not.toBeNull();
  });

  it('should render with dark theme', () => {
    const { toJSON } = render(<ToriLogo theme="dark" />);
    expect(toJSON()).not.toBeNull();
  });
});

describe('ToriIcon', () => {
  it('should render correctly', () => {
    const { toJSON } = render(<ToriIcon />);
    expect(toJSON()).not.toBeNull();
  });

  it('should render with custom size', () => {
    const { toJSON } = render(<ToriIcon size={80} />);
    expect(toJSON()).not.toBeNull();
  });
});

describe('ToriText', () => {
  it('should render correctly', () => {
    const { toJSON } = render(<ToriText />);
    expect(toJSON()).not.toBeNull();
  });

  it('should render with custom size', () => {
    const { toJSON } = render(<ToriText size={60} />);
    expect(toJSON()).not.toBeNull();
  });

  it('should render with light theme', () => {
    const { toJSON } = render(<ToriText theme="light" />);
    expect(toJSON()).not.toBeNull();
  });

  it('should render with dark theme', () => {
    const { toJSON } = render(<ToriText theme="dark" />);
    expect(toJSON()).not.toBeNull();
  });
});
