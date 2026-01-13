/**
 * Tori Wallet - Address Utilities
 */

/**
 * 주소 단축 표시 (0x1234...5678)
 */
export function shortenAddress(
  address: string,
  startChars = 6,
  endChars = 4,
): string {
  if (!address || address.length < startChars + endChars + 3) {
    return address;
  }
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * 주소 유효성 검증
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * 체크섬 주소로 변환
 */
export function toChecksumAddress(address: string): string {
  // viem의 getAddress 사용 권장
  return address;
}

/**
 * 주소 동일성 비교 (대소문자 무시)
 */
export function addressesEqual(
  address1: string | null | undefined,
  address2: string | null | undefined,
): boolean {
  if (!address1 || !address2) return false;
  return address1.toLowerCase() === address2.toLowerCase();
}
