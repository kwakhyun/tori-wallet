/**
 * 요청 만료까지 남은 시간(초)을 1초마다 갱신한다.
 */

import { useEffect, useState } from 'react';

function remainingSeconds(expiresAt: number | undefined): number | null {
  if (expiresAt === undefined || !Number.isFinite(expiresAt)) return null;
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
}

export function useCountdown(
  expiresAt: number | undefined,
  active: boolean = true,
): number | null {
  const [seconds, setSeconds] = useState(() => remainingSeconds(expiresAt));

  useEffect(() => {
    setSeconds(remainingSeconds(expiresAt));
    if (!active || expiresAt === undefined) return;
    const timer = setInterval(() => {
      setSeconds(remainingSeconds(expiresAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, active]);

  return seconds;
}

/** 65 → "1:05" */
export function formatRemaining(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest < 10 ? `0${rest}` : rest}`;
}

/** 65 → "1분 5초" (화면 낭독기용) */
export function describeRemaining(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest}초`;
  return rest === 0 ? `${minutes}분` : `${minutes}분 ${rest}초`;
}
