/**
 * 지갑 키 재료를 위한 난수 생성기.
 *
 * react-native-get-random-values는 일반 기기에서는 iOS SecRandomCopyBytes와
 * Android SecureRandom을 사용하지만, 구형 Chrome 원격 디버깅 환경에서는
 * Math.random으로 폴백한다. 키 재료에는 그 폴백을 허용하지 않고 실패한다.
 * 아래 검사는 명백한 고장과 연속 출력 재사용을 잡는 sanity check이며,
 * 난수의 엔트로피를 통계적으로 증명하는 용도는 아니다.
 */

export class SecureRandomError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecureRandomError';
  }
}

export type SecureRandomProvider = (target: Uint8Array) => void;

type ReactNativeGlobal = typeof globalThis & {
  RN$Bridgeless?: boolean;
  nativeCallSyncHook?: unknown;
};

function systemSecureRandomProvider(target: Uint8Array): void {
  const runtime = globalThis as ReactNativeGlobal;
  const isInsecureChromeRemoteDebugger =
    __DEV__ &&
    runtime.RN$Bridgeless !== true &&
    typeof runtime.nativeCallSyncHook === 'undefined';

  if (isInsecureChromeRemoteDebugger) {
    throw new SecureRandomError(
      '보안 난수를 보장할 수 없는 원격 디버깅 환경에서는 지갑을 생성할 수 없습니다.',
    );
  }

  if (typeof globalThis.crypto?.getRandomValues !== 'function') {
    throw new SecureRandomError(
      '운영체제 보안 난수 생성기를 사용할 수 없습니다.',
    );
  }

  globalThis.crypto.getRandomValues(target as Uint8Array<ArrayBuffer>);
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    // eslint-disable-next-line no-bitwise
    difference |= left[index]! ^ right[index]!;
  }
  return difference === 0;
}

function hasRepeatedHalves(bytes: Uint8Array): boolean {
  if (bytes.length < 16 || bytes.length % 2 !== 0) return false;
  const half = bytes.length / 2;
  return bytesEqual(bytes.subarray(0, half), bytes.subarray(half));
}

function hasSingleRepeatedByte(bytes: Uint8Array): boolean {
  if (bytes.length < 16) return false;
  return bytes.every(value => value === bytes[0]);
}

export class SecureRandomGenerator {
  private readonly previousOutputs = new Map<number, Uint8Array>();

  constructor(
    private readonly provider: SecureRandomProvider = systemSecureRandomProvider,
  ) {}

  bytes(size: number): Uint8Array {
    if (!Number.isSafeInteger(size) || size <= 0 || size > 65536) {
      throw new SecureRandomError('잘못된 보안 난수 길이입니다.');
    }

    const output = new Uint8Array(size);
    try {
      this.provider(output);
    } catch (error) {
      output.fill(0);
      if (error instanceof SecureRandomError) throw error;
      throw new SecureRandomError('운영체제 보안 난수 생성에 실패했습니다.');
    }

    const previous = this.previousOutputs.get(size);
    if (
      hasSingleRepeatedByte(output) ||
      hasRepeatedHalves(output) ||
      (previous !== undefined && bytesEqual(output, previous))
    ) {
      output.fill(0);
      throw new SecureRandomError(
        '보안 난수 상태 검사에 실패하여 지갑 생성을 중단했습니다.',
      );
    }

    this.previousOutputs.set(size, output.slice());
    return output;
  }
}

export const secureRandomGenerator = new SecureRandomGenerator();

export function secureRandomBytes(size: number): Uint8Array {
  return secureRandomGenerator.bytes(size);
}
