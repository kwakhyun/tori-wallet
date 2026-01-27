/**
 * 하단 탭 네비게이션 아이콘 (모던 & 미니멀 디자인)
 */

import React from 'react';
import Svg, { Path, Circle, Rect, G } from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
  focused?: boolean;
}

/**
 * 홈 아이콘 - 심플한 집 모양
 */
export function HomeIcon({ size = 24, color = '#000', focused }: IconProps) {
  const strokeWidth = focused ? 2.2 : 1.8;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 10.5L12 3L21 10.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M5 9.5V19C5 19.5523 5.44772 20 6 20H9V15C9 14.4477 9.44772 14 10 14H14C14.5523 14 15 14.4477 15 15V20H18C18.5523 20 19 19.5523 19 19V9.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={focused ? color : 'none'}
        fillOpacity={focused ? 0.15 : 0}
      />
    </Svg>
  );
}

/**
 * 탐색 아이콘 - 나침반/검색 느낌의 원형
 */
export function ExploreIcon({ size = 24, color = '#000', focused }: IconProps) {
  const strokeWidth = focused ? 2.2 : 1.8;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle
        cx="12"
        cy="12"
        r="9"
        stroke={color}
        strokeWidth={strokeWidth}
        fill={focused ? color : 'none'}
        fillOpacity={focused ? 0.15 : 0}
      />
      <Path
        d="M14.5 9.5L13 13L9.5 14.5L11 11L14.5 9.5Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        fill={focused ? color : 'none'}
      />
    </Svg>
  );
}

/**
 * 포트폴리오 아이콘 - 파이 차트 느낌
 */
export function PortfolioIcon({
  size = 24,
  color = '#000',
  focused,
}: IconProps) {
  const strokeWidth = focused ? 2.2 : 1.8;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle
        cx="12"
        cy="12"
        r="9"
        stroke={color}
        strokeWidth={strokeWidth}
        fill={focused ? color : 'none'}
        fillOpacity={focused ? 0.15 : 0}
      />
      <Path
        d="M12 3V12L18.5 6.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12 12L6 17"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * 활동 아이콘 - 펄스/활동 그래프
 */
export function ActivityIcon({
  size = 24,
  color = '#000',
  focused,
}: IconProps) {
  const strokeWidth = focused ? 2.2 : 1.8;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect
        x="3"
        y="4"
        width="18"
        height="16"
        rx="2"
        stroke={color}
        strokeWidth={strokeWidth}
        fill={focused ? color : 'none'}
        fillOpacity={focused ? 0.15 : 0}
      />
      <Path
        d="M3 9H21"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Path
        d="M7 14H10"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Path
        d="M7 17H14"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * 설정 아이콘 - 심플한 슬라이더 형태
 */
export function SettingsIcon({
  size = 24,
  color = '#000',
  focused,
}: IconProps) {
  const strokeWidth = focused ? 2.2 : 1.8;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G>
        {/* 첫 번째 슬라이더 */}
        <Path
          d="M4 6H9"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <Circle
          cx="12"
          cy="6"
          r="2.5"
          stroke={color}
          strokeWidth={strokeWidth}
          fill={focused ? color : 'none'}
        />
        <Path
          d="M15 6H20"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* 두 번째 슬라이더 */}
        <Path
          d="M4 12H6"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <Circle
          cx="9"
          cy="12"
          r="2.5"
          stroke={color}
          strokeWidth={strokeWidth}
          fill={focused ? color : 'none'}
        />
        <Path
          d="M12 12H20"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* 세 번째 슬라이더 */}
        <Path
          d="M4 18H13"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <Circle
          cx="16"
          cy="18"
          r="2.5"
          stroke={color}
          strokeWidth={strokeWidth}
          fill={focused ? color : 'none'}
        />
        <Path
          d="M19 18H20"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </G>
    </Svg>
  );
}
