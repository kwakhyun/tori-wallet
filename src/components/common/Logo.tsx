/**
 * Tori Wallet - Logo Component
 * 앱 로고 및 아이콘
 *
 * 디자인 컨셉:
 * - 심플하고 귀여운 고양이 얼굴
 * - 현대적인 그라데이션 + 미니멀한 디자인
 * - 보라색/인디고 계열 (신뢰, 혁신, 프리미엄)
 */

import React from 'react';
import Svg, {
  Circle,
  Path,
  Defs,
  LinearGradient,
  Stop,
  G,
  Rect,
  Ellipse,
  Line,
} from 'react-native-svg';

// 브랜드 컬러 상수
const BRAND_COLORS = {
  primary: '#6366F1', // Indigo-500
  primaryLight: '#818CF8', // Indigo-400
  primaryDark: '#4F46E5', // Indigo-600
  accent: '#A5B4FC', // Indigo-300
  glow: '#C7D2FE', // Indigo-200
  deepPurple: '#3730A3', // Indigo-800
};

interface LogoProps {
  size?: number;
  variant?: 'full' | 'icon' | 'text';
  theme?: 'light' | 'dark';
}

/**
 * Tori Wallet 로고
 * - 새(鳥, Tori) 모티프 + 지갑/보안 컨셉
 * - 보라색 그라데이션 (브랜드 컬러)
 */
export function ToriLogo({
  size = 100,
  variant = 'icon',
  theme = 'dark',
}: LogoProps) {
  if (variant === 'icon') {
    return <ToriIcon size={size} />;
  }

  if (variant === 'text') {
    return <ToriText size={size} theme={theme} />;
  }

  // Full logo with icon and text
  const textColor = theme === 'dark' ? '#FFFFFF' : BRAND_COLORS.primary;
  const subtitleColor = theme === 'dark' ? '#A1A1AA' : '#6B7280';

  return (
    <Svg width={size * 3} height={size} viewBox="0 0 300 100">
      <Defs>
        <LinearGradient
          id="logoGradientFull"
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <Stop offset="0%" stopColor={BRAND_COLORS.accent} />
          <Stop offset="50%" stopColor={BRAND_COLORS.primary} />
          <Stop offset="100%" stopColor={BRAND_COLORS.primaryDark} />
        </LinearGradient>
        <LinearGradient id="textGradientFull" x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor={BRAND_COLORS.primaryLight} />
          <Stop offset="100%" stopColor={BRAND_COLORS.primary} />
        </LinearGradient>
      </Defs>

      {/* Icon */}
      <G transform="translate(5, 5)">
        {/* 배경 - 둥근 사각형 */}
        <Rect
          x="0"
          y="0"
          width="90"
          height="90"
          rx="22"
          ry="22"
          fill="url(#logoGradientFull)"
        />

        {/* 새 실루엣 */}
        <G transform="translate(12, 12)">
          {/* 몸체 - 우아한 새 형태 */}
          <Path
            d="M18 42 C18 26, 30 16, 48 16 C56 16, 60 20, 56 27 C52 34, 42 36, 35 38 C48 41, 58 50, 54 60 C50 70, 35 74, 22 66 C15 61, 15 51, 18 42 Z"
            fill="white"
          />

          {/* 날개 - 역동적인 곡선 */}
          <Path
            d="M24 40 Q36 32, 50 38 Q42 46, 28 54 Q22 48, 24 40 Z"
            fill="rgba(79, 70, 229, 0.15)"
          />

          {/* 눈 */}
          <Circle cx="50" cy="24" r="4" fill={BRAND_COLORS.deepPurple} />
          <Circle cx="51" cy="23" r="1.5" fill="white" />

          {/* 부리 */}
          <Path d="M56 26 L66 22 L58 30 Z" fill="white" />
        </G>
      </G>

      {/* Text: TORI */}
      <G transform="translate(110, 25)">
        <Path
          d="M0 10 L32 10 L32 18 L20 18 L20 55 L12 55 L12 18 L0 18 Z"
          fill={theme === 'dark' ? 'url(#textGradientFull)' : textColor}
        />
        <Path
          d="M38 32.5 C38 18, 50 10, 66 10 C82 10, 94 18, 94 32.5 C94 47, 82 55, 66 55 C50 55, 38 47, 38 32.5 Z M48 32.5 C48 42, 55 48, 66 48 C77 48, 84 42, 84 32.5 C84 23, 77 17, 66 17 C55 17, 48 23, 48 32.5 Z"
          fill={theme === 'dark' ? 'url(#textGradientFull)' : textColor}
        />
        <Path
          d="M100 10 L130 10 C142 10, 150 18, 150 28 C150 36, 145 42, 136 44 L155 55 L143 55 L127 45 L110 45 L110 55 L100 55 Z M110 18 L110 38 L128 38 C136 38, 140 34, 140 28 C140 22, 136 18, 128 18 Z"
          fill={theme === 'dark' ? 'url(#textGradientFull)' : textColor}
        />
        <Path
          d="M160 10 L170 10 L170 55 L160 55 Z"
          fill={theme === 'dark' ? 'url(#textGradientFull)' : textColor}
        />
      </G>

      {/* Subtitle: WALLET */}
      <G transform="translate(112, 65)">
        <Path
          d="M0 5 L4 5 L8 17 L12 5 L16 5 L20 17 L24 5 L28 5 L21 25 L17 25 L13 13 L9 25 L5 25 Z"
          fill={subtitleColor}
        />
        <Path
          d="M32 5 L42 5 L50 25 L46 25 L44 20 L34 20 L32 25 L28 25 Z M35 16 L43 16 L39 7 Z"
          fill={subtitleColor}
        />
        <Path
          d="M52 5 L56 5 L56 21 L67 21 L67 25 L52 25 Z"
          fill={subtitleColor}
        />
        <Path
          d="M70 5 L74 5 L74 21 L85 21 L85 25 L70 25 Z"
          fill={subtitleColor}
        />
        <Path
          d="M88 5 L103 5 L103 9 L92 9 L92 13 L102 13 L102 17 L92 17 L92 21 L103 21 L103 25 L88 25 Z"
          fill={subtitleColor}
        />
        <Path
          d="M108 5 L122 5 L122 9 L118 9 L118 25 L112 25 L112 9 L108 9 Z"
          fill={subtitleColor}
        />
      </G>
    </Svg>
  );
}

/**
 * 아이콘만 (앱 아이콘용)
 * 정사각형, 둥근 모서리, iOS/Android 앱 아이콘으로 사용 가능
 * 심플한 고양이 얼굴 디자인
 */
export function ToriIcon({ size = 100 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="iconGradientBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={BRAND_COLORS.accent} />
          <Stop offset="40%" stopColor={BRAND_COLORS.primary} />
          <Stop offset="100%" stopColor={BRAND_COLORS.primaryDark} />
        </LinearGradient>
        <LinearGradient id="shineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="white" stopOpacity={0.25} />
          <Stop offset="50%" stopColor="white" stopOpacity={0.05} />
          <Stop offset="100%" stopColor="white" stopOpacity={0} />
        </LinearGradient>
      </Defs>

      {/* 배경 - 둥근 사각형 (iOS 스타일) */}
      <Rect
        x="0"
        y="0"
        width="100"
        height="100"
        rx="22"
        ry="22"
        fill="url(#iconGradientBg)"
      />

      {/* 상단 광택 효과 */}
      <Path
        d="M22 0 L78 0 Q100 0 100 22 L100 45 Q50 55 0 45 L0 22 Q0 0 22 0 Z"
        fill="url(#shineGradient)"
      />

      {/* 심플한 고양이 얼굴 */}
      <G transform="translate(15, 18)">
        {/* 왼쪽 귀 */}
        <Path d="M12 28 L5 5 L25 20 Z" fill="white" />
        {/* 오른쪽 귀 */}
        <Path d="M58 28 L65 5 L45 20 Z" fill="white" />
        {/* 귀 안쪽 (왼쪽) */}
        <Path d="M13 24 L9 10 L22 19 Z" fill={BRAND_COLORS.glow} />
        {/* 귀 안쪽 (오른쪽) */}
        <Path d="M57 24 L61 10 L48 19 Z" fill={BRAND_COLORS.glow} />
        {/* 얼굴 */}
        <Ellipse cx="35" cy="42" rx="30" ry="26" fill="white" />
        {/* 왼쪽 눈 */}
        <Ellipse cx="22" cy="38" rx="5" ry="6" fill={BRAND_COLORS.deepPurple} />
        <Circle cx="23" cy="36" r="2" fill="white" />
        {/* 오른쪽 눈 */}
        <Ellipse cx="48" cy="38" rx="5" ry="6" fill={BRAND_COLORS.deepPurple} />
        <Circle cx="49" cy="36" r="2" fill="white" />
        {/* 코 */}
        <Ellipse cx="35" cy="50" rx="3.5" ry="2.5" fill={BRAND_COLORS.glow} />
        {/* 입 */}
        <Path
          d="M35 52.5 Q30 58 26 55"
          stroke={BRAND_COLORS.glow}
          strokeWidth="1.8"
          fill="none"
          strokeLinecap="round"
        />
        <Path
          d="M35 52.5 Q40 58 44 55"
          stroke={BRAND_COLORS.glow}
          strokeWidth="1.8"
          fill="none"
          strokeLinecap="round"
        />
        {/* 수염 (왼쪽) */}
        <Line
          x1="2"
          y1="42"
          x2="14"
          y2="44"
          stroke="#E0E7FF"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <Line
          x1="2"
          y1="48"
          x2="14"
          y2="48"
          stroke="#E0E7FF"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <Line
          x1="4"
          y1="54"
          x2="14"
          y2="52"
          stroke="#E0E7FF"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        {/* 수염 (오른쪽) */}
        <Line
          x1="68"
          y1="42"
          x2="56"
          y2="44"
          stroke="#E0E7FF"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <Line
          x1="68"
          y1="48"
          x2="56"
          y2="48"
          stroke="#E0E7FF"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <Line
          x1="66"
          y1="54"
          x2="56"
          y2="52"
          stroke="#E0E7FF"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </G>
    </Svg>
  );
}

/**
 * 배경 없는 고양이 얼굴 (앱 내 로고용)
 * WelcomeScreen 등에서 사용
 */
export function ToriCatFace({ size = 100 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient
          id="catFaceGradient"
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <Stop offset="0%" stopColor={BRAND_COLORS.accent} />
          <Stop offset="50%" stopColor={BRAND_COLORS.primary} />
          <Stop offset="100%" stopColor={BRAND_COLORS.primaryDark} />
        </LinearGradient>
      </Defs>

      {/* 심플한 고양이 얼굴 - 배경 없음 */}
      <G transform="translate(5, 5)">
        {/* 왼쪽 귀 */}
        <Path d="M18 38 L8 8 L35 28 Z" fill="url(#catFaceGradient)" />
        {/* 오른쪽 귀 */}
        <Path d="M72 38 L82 8 L55 28 Z" fill="url(#catFaceGradient)" />
        {/* 귀 안쪽 (왼쪽) */}
        <Path d="M20 34 L14 16 L32 28 Z" fill={BRAND_COLORS.primaryLight} />
        {/* 귀 안쪽 (오른쪽) */}
        <Path d="M70 34 L76 16 L58 28 Z" fill={BRAND_COLORS.primaryLight} />
        {/* 얼굴 */}
        <Ellipse cx="45" cy="55" rx="38" ry="34" fill="url(#catFaceGradient)" />
        {/* 왼쪽 눈 */}
        <Ellipse cx="30" cy="50" rx="8" ry="10" fill="white" />
        <Ellipse cx="31" cy="51" rx="4" ry="5" fill="#1F2937" />
        <Circle cx="32" cy="48" r="2" fill="white" />
        {/* 오른쪽 눈 */}
        <Ellipse cx="60" cy="50" rx="8" ry="10" fill="white" />
        <Ellipse cx="61" cy="51" rx="4" ry="5" fill="#1F2937" />
        <Circle cx="62" cy="48" r="2" fill="white" />
        {/* 코 */}
        <Ellipse cx="45" cy="65" rx="5" ry="4" fill={BRAND_COLORS.glow} />
        {/* 입 */}
        <Path
          d="M45 69 Q38 78 30 73"
          stroke={BRAND_COLORS.glow}
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />
        <Path
          d="M45 69 Q52 78 60 73"
          stroke={BRAND_COLORS.glow}
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />
        {/* 수염 (왼쪽) */}
        <Line
          x1="2"
          y1="52"
          x2="18"
          y2="55"
          stroke={BRAND_COLORS.glow}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <Line
          x1="2"
          y1="62"
          x2="18"
          y2="62"
          stroke={BRAND_COLORS.glow}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <Line
          x1="4"
          y1="72"
          x2="18"
          y2="69"
          stroke={BRAND_COLORS.glow}
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* 수염 (오른쪽) */}
        <Line
          x1="88"
          y1="52"
          x2="72"
          y2="55"
          stroke={BRAND_COLORS.glow}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <Line
          x1="88"
          y1="62"
          x2="72"
          y2="62"
          stroke={BRAND_COLORS.glow}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <Line
          x1="86"
          y1="72"
          x2="72"
          y2="69"
          stroke={BRAND_COLORS.glow}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </G>
    </Svg>
  );
}

/**
 * 텍스트만 (헤더용)
 */
export function ToriText({
  size = 40,
  theme = 'dark',
}: {
  size?: number;
  theme?: 'light' | 'dark';
}) {
  const width = size * 3;
  const fillColor = theme === 'dark' ? 'white' : BRAND_COLORS.primary;

  return (
    <Svg width={width} height={size} viewBox="0 0 120 40">
      <Defs>
        <LinearGradient id="textGradientOnly" x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor={BRAND_COLORS.primaryLight} />
          <Stop offset="100%" stopColor={BRAND_COLORS.primary} />
        </LinearGradient>
      </Defs>

      {/* T */}
      <Path
        d="M0 4 L26 4 L26 10 L16 10 L16 36 L10 36 L10 10 L0 10 Z"
        fill={theme === 'dark' ? 'url(#textGradientOnly)' : fillColor}
      />

      {/* O */}
      <Path
        d="M30 20 C30 10, 38 4, 50 4 C62 4, 70 10, 70 20 C70 30, 62 36, 50 36 C38 36, 30 30, 30 20 Z M37 20 C37 27, 42 31, 50 31 C58 31, 63 27, 63 20 C63 13, 58 9, 50 9 C42 9, 37 13, 37 20 Z"
        fill={theme === 'dark' ? 'url(#textGradientOnly)' : fillColor}
      />

      {/* R */}
      <Path
        d="M74 4 L96 4 C106 4, 112 9, 112 17 C112 23, 108 27, 101 29 L115 36 L106 36 L94 30 L82 30 L82 36 L74 36 Z M82 10 L82 24 L95 24 C101 24, 105 22, 105 17 C105 12, 101 10, 95 10 Z"
        fill={theme === 'dark' ? 'url(#textGradientOnly)' : fillColor}
      />

      {/* I */}
      <Path
        d="M118 4 L126 4 L126 36 L118 36 Z"
        fill={theme === 'dark' ? 'url(#textGradientOnly)' : fillColor}
      />
    </Svg>
  );
}

/**
 * 온보딩/스플래시용 큰 로고
 * 세로로 아이콘 + 텍스트 배치
 */
export function ToriSplashLogo({
  size = 150,
  showSubtitle = true,
}: {
  size?: number;
  showSubtitle?: boolean;
}) {
  const height = showSubtitle ? size * 1.4 : size * 1.2;

  return (
    <Svg
      width={size}
      height={height}
      viewBox={`0 0 150 ${showSubtitle ? 210 : 180}`}
    >
      <Defs>
        <LinearGradient id="splashGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={BRAND_COLORS.glow} />
          <Stop offset="30%" stopColor={BRAND_COLORS.primaryLight} />
          <Stop offset="70%" stopColor={BRAND_COLORS.primary} />
          <Stop offset="100%" stopColor={BRAND_COLORS.primaryDark} />
        </LinearGradient>
        <LinearGradient id="splashShine" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="white" stopOpacity={0.3} />
          <Stop offset="40%" stopColor="white" stopOpacity={0.1} />
          <Stop offset="100%" stopColor="white" stopOpacity={0} />
        </LinearGradient>
      </Defs>

      {/* 메인 아이콘 - 중앙 배치 */}
      <G transform="translate(25, 0)">
        {/* 배경 */}
        <Rect
          x="0"
          y="0"
          width="100"
          height="100"
          rx="24"
          ry="24"
          fill="url(#splashGradient)"
        />

        {/* 광택 */}
        <Path
          d="M24 0 L76 0 Q100 0 100 24 L100 45 Q50 55 0 45 L0 24 Q0 0 24 0 Z"
          fill="url(#splashShine)"
        />

        {/* 새 */}
        <G transform="translate(14, 14)">
          <Path
            d="M16 38 C16 22, 28 12, 46 12 C56 12, 62 18, 56 26 C50 34, 38 36, 30 38 C46 42, 58 52, 52 64 C46 76, 28 80, 14 70 C6 64, 6 52, 16 38 Z"
            fill="white"
          />
          <Path
            d="M20 40 Q36 28, 52 38 Q42 50, 24 60 Q16 50, 20 40 Z"
            fill={BRAND_COLORS.primary}
            opacity={0.12}
          />
          <Circle cx="50" cy="22" r="5" fill={BRAND_COLORS.deepPurple} />
          <Circle cx="52" cy="20" r="2" fill="white" />
          <Path d="M56 24 L70 18 L60 30 Z" fill="white" />
          <Path
            d="M10 66 Q4 74, 2 82 Q12 76, 18 70 Z"
            fill="white"
            opacity={0.8}
          />
        </G>
      </G>

      {/* 텍스트: TORI */}
      <G transform="translate(20, 120)">
        {/* T */}
        <Path
          d="M0 0 L28 0 L28 7 L18 7 L18 40 L10 40 L10 7 L0 7 Z"
          fill="white"
        />
        {/* O */}
        <Path
          d="M33 20 C33 8, 43 0, 57 0 C71 0, 81 8, 81 20 C81 32, 71 40, 57 40 C43 40, 33 32, 33 20 Z M42 20 C42 28, 48 34, 57 34 C66 34, 72 28, 72 20 C72 12, 66 6, 57 6 C48 6, 42 12, 42 20 Z"
          fill="white"
        />
        {/* R */}
        <Path
          d="M86 0 L110 0 C122 0, 130 6, 130 15 C130 22, 125 27, 116 29 L135 40 L123 40 L108 30 L96 30 L96 40 L86 40 Z M96 7 L96 23 L108 23 C116 23, 121 20, 121 15 C121 10, 116 7, 108 7 Z"
          fill="white"
        />
      </G>

      {/* WALLET subtitle */}
      {showSubtitle && (
        <G transform="translate(28, 175)">
          <Path
            d="M0 5 L5 5 L10 18 L15 5 L20 5 L25 18 L30 5 L35 5 L27 28 L22 28 L17 15 L12 28 L7 28 Z"
            fill="#9CA3AF"
          />
          <Path
            d="M40 5 L52 5 L60 28 L55 28 L53 22 L42 22 L40 28 L35 28 Z M44 17 L51 17 L47 7 Z"
            fill="#9CA3AF"
          />
          <Path d="M62 5 L68 5 L68 23 L80 23 L80 28 L62 28 Z" fill="#9CA3AF" />
          <Path
            d="M82 5 L88 5 L88 23 L100 23 L100 28 L82 28 Z"
            fill="#9CA3AF"
          />
        </G>
      )}
    </Svg>
  );
}

/**
 * 미니 아이콘 (탭바, 헤더 등에 사용)
 */
export function ToriMiniIcon({ size = 32 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Defs>
        <LinearGradient id="miniGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={BRAND_COLORS.primaryLight} />
          <Stop offset="100%" stopColor={BRAND_COLORS.primaryDark} />
        </LinearGradient>
      </Defs>

      <Rect
        x="0"
        y="0"
        width="32"
        height="32"
        rx="8"
        ry="8"
        fill="url(#miniGradient)"
      />

      {/* 간소화된 새 */}
      <G transform="translate(4, 4)">
        <Path
          d="M6 13 C6 7, 10 4, 16 4 C19 4, 21 6, 19 9 C17 12, 13 13, 10 13 C16 15, 20 18, 18 22 C16 26, 10 27, 5 24 C2 22, 2 18, 6 13 Z"
          fill="white"
        />
        <Circle cx="17" cy="7" r="2" fill={BRAND_COLORS.deepPurple} />
        <Path d="M19 8 L24 6 L21 11 Z" fill="white" />
      </G>
    </Svg>
  );
}

/**
 * 원형 아이콘 (프로필 등에 사용)
 */
export function ToriCircleIcon({ size = 48 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        <LinearGradient id="circleGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={BRAND_COLORS.accent} />
          <Stop offset="50%" stopColor={BRAND_COLORS.primary} />
          <Stop offset="100%" stopColor={BRAND_COLORS.primaryDark} />
        </LinearGradient>
      </Defs>

      <Circle cx="24" cy="24" r="23" fill="url(#circleGradient)" />

      {/* 새 */}
      <G transform="translate(8, 8)">
        <Path
          d="M8 18 C8 10, 14 6, 22 6 C26 6, 28 8, 26 12 C24 16, 18 17, 14 18 C22 20, 28 25, 25 31 C22 37, 13 38, 7 34 C3 31, 3 25, 8 18 Z"
          fill="white"
        />
        <Circle cx="24" cy="10" r="2.5" fill={BRAND_COLORS.deepPurple} />
        <Circle cx="25" cy="9" r="1" fill="white" />
        <Path d="M26 11 L32 8 L29 14 Z" fill="white" />
      </G>
    </Svg>
  );
}

export default ToriLogo;
