/**
 * 스켈레톤 컴포넌트 테스트
 */

import React from 'react';
import { render } from '../test-utils';
import { Skeleton } from '../../src/components/common/Skeleton';

describe('Skeleton', () => {
  it('should render correctly', () => {
    const { toJSON } = render(<Skeleton />);
    expect(toJSON()).not.toBeNull();
  });

  it('should render with custom width', () => {
    const { toJSON } = render(<Skeleton width={200} />);
    expect(toJSON()).not.toBeNull();
  });

  it('should render with percentage width', () => {
    const { toJSON } = render(<Skeleton width="50%" />);
    expect(toJSON()).not.toBeNull();
  });

  it('should render with custom height', () => {
    const { toJSON } = render(<Skeleton height={40} />);
    expect(toJSON()).not.toBeNull();
  });

  it('should render with custom borderRadius', () => {
    const { toJSON } = render(<Skeleton borderRadius={16} />);
    expect(toJSON()).not.toBeNull();
  });

  it('should render with margins', () => {
    const { toJSON } = render(
      <Skeleton marginTop={10} marginBottom={10} marginLeft={5} />,
    );
    expect(toJSON()).not.toBeNull();
  });

  it('should render with alignSelf center', () => {
    const { toJSON } = render(<Skeleton alignSelf="center" />);
    expect(toJSON()).not.toBeNull();
  });

  it('should render with alignSelf flex-start', () => {
    const { toJSON } = render(<Skeleton alignSelf="flex-start" />);
    expect(toJSON()).not.toBeNull();
  });

  it('should render with alignSelf flex-end', () => {
    const { toJSON } = render(<Skeleton alignSelf="flex-end" />);
    expect(toJSON()).not.toBeNull();
  });
});
