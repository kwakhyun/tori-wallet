import {
  SecureRandomError,
  SecureRandomGenerator,
} from '../../src/utils/secureRandom';

function providerFrom(bytes: number[]): (target: Uint8Array) => void {
  return target => {
    target.set(bytes.slice(0, target.length));
  };
}

describe('SecureRandomGenerator', () => {
  it('returns bytes supplied by the secure provider', () => {
    const expected = Array.from({ length: 16 }, (_, index) => index + 1);
    const generator = new SecureRandomGenerator(providerFrom(expected));

    expect(Array.from(generator.bytes(16))).toEqual(expected);
  });

  it.each([
    ['all-zero output', Array(16).fill(0)],
    ['single repeated byte', Array(16).fill(7)],
    ['repeated halves', [1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4, 5, 6, 7, 8]],
  ])('fails closed for %s', (_name, bytes) => {
    const generator = new SecureRandomGenerator(providerFrom(bytes));

    expect(() => generator.bytes(16)).toThrow(SecureRandomError);
  });

  it('fails closed when a full output is reused consecutively', () => {
    const bytes = Array.from({ length: 16 }, (_, index) => index + 1);
    const generator = new SecureRandomGenerator(providerFrom(bytes));

    expect(generator.bytes(16)).toHaveLength(16);
    expect(() => generator.bytes(16)).toThrow(SecureRandomError);
  });

  it('does not replace a provider failure with weaker randomness', () => {
    const generator = new SecureRandomGenerator(() => {
      throw new Error('native RNG unavailable');
    });

    expect(() => generator.bytes(16)).toThrow(
      '운영체제 보안 난수 생성에 실패했습니다.',
    );
  });

  it.each([0, -1, 1.5, 65537])('rejects invalid byte length %s', size => {
    const generator = new SecureRandomGenerator(() => undefined);
    expect(() => generator.bytes(size)).toThrow(SecureRandomError);
  });
});
