/**
 * Tori Wallet - useDebounce Hook Tests
 * 디바운스 훅 테스트
 */

import { renderHook, act } from '@testing-library/react-native';
import { useDebounce } from '../../src/hooks/useDebounce';

interface DebounceProps<T> {
  value: T;
  delay: number;
}

describe('useDebounce', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should return initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('initial', 500));
    expect(result.current).toBe('initial');
  });

  it('should debounce value changes', () => {
    const { result, rerender } = renderHook<string, DebounceProps<string>>(
      props => useDebounce(props.value, props.delay),
      { initialProps: { value: 'initial', delay: 500 } },
    );

    expect(result.current).toBe('initial');

    // 값 변경
    rerender({ value: 'changed', delay: 500 });

    // 아직 디바운스 중이므로 이전 값 유지
    expect(result.current).toBe('initial');

    // 타이머 진행
    act(() => {
      jest.advanceTimersByTime(500);
    });

    // 디바운스 후 새 값 반영
    expect(result.current).toBe('changed');
  });

  it('should reset timer on rapid value changes', () => {
    const { result, rerender } = renderHook<string, DebounceProps<string>>(
      props => useDebounce(props.value, props.delay),
      { initialProps: { value: 'initial', delay: 500 } },
    );

    // 빠른 연속 변경
    rerender({ value: 'change1', delay: 500 });
    act(() => {
      jest.advanceTimersByTime(200);
    });

    rerender({ value: 'change2', delay: 500 });
    act(() => {
      jest.advanceTimersByTime(200);
    });

    rerender({ value: 'change3', delay: 500 });

    // 아직 디바운스 중
    expect(result.current).toBe('initial');

    // 전체 딜레이 경과
    act(() => {
      jest.advanceTimersByTime(500);
    });

    // 마지막 값만 반영
    expect(result.current).toBe('change3');
  });

  it('should work with number values', () => {
    const { result, rerender } = renderHook<number, DebounceProps<number>>(
      props => useDebounce(props.value, props.delay),
      { initialProps: { value: 0, delay: 300 } },
    );

    expect(result.current).toBe(0);

    rerender({ value: 100, delay: 300 });

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(result.current).toBe(100);
  });

  it('should work with object values', () => {
    const initialObj = { name: 'test' };
    const newObj = { name: 'updated' };

    const { result, rerender } = renderHook<
      { name: string },
      DebounceProps<{ name: string }>
    >(props => useDebounce(props.value, props.delay), {
      initialProps: { value: initialObj, delay: 200 },
    });

    expect(result.current).toBe(initialObj);

    rerender({ value: newObj, delay: 200 });

    act(() => {
      jest.advanceTimersByTime(200);
    });

    expect(result.current).toBe(newObj);
  });

  it('should handle delay changes', () => {
    const { result, rerender } = renderHook<string, DebounceProps<string>>(
      props => useDebounce(props.value, props.delay),
      { initialProps: { value: 'initial', delay: 500 } },
    );

    rerender({ value: 'changed', delay: 100 });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(result.current).toBe('changed');
  });

  it('should handle zero delay', () => {
    const { result, rerender } = renderHook<string, DebounceProps<string>>(
      props => useDebounce(props.value, props.delay),
      { initialProps: { value: 'initial', delay: 0 } },
    );

    rerender({ value: 'changed', delay: 0 });

    act(() => {
      jest.advanceTimersByTime(0);
    });

    expect(result.current).toBe('changed');
  });
});
