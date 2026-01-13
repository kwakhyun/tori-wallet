/**
 * Tori Wallet Theme Configuration
 * 라이트/다크 모드 지원
 */

// ============================================
// Color Palette (공통 색상 팔레트)
// ============================================
const palette = {
  // Primary Colors
  indigo: {
    50: '#EEF2FF',
    100: '#E0E7FF',
    200: '#C7D2FE',
    300: '#A5B4FC',
    400: '#818CF8',
    500: '#6366F1',
    600: '#4F46E5',
    700: '#4338CA',
    800: '#3730A3',
    900: '#312E81',
  },

  // Cyan Colors
  cyan: {
    50: '#ECFEFF',
    100: '#CFFAFE',
    200: '#A5F3FC',
    300: '#67E8F9',
    400: '#22D3EE',
    500: '#06B6D4',
    600: '#0891B2',
    700: '#0E7490',
    800: '#155E75',
    900: '#164E63',
  },

  // Gray Colors
  gray: {
    50: '#FAFAFA',
    100: '#F4F4F5',
    200: '#E4E4E7',
    300: '#D4D4D8',
    400: '#A1A1AA',
    500: '#71717A',
    600: '#52525B',
    700: '#3F3F46',
    800: '#27272A',
    900: '#18181B',
  },

  // Semantic Colors
  green: {
    50: '#ECFDF5',
    100: '#D1FAE5',
    400: '#34D399',
    500: '#10B981',
    600: '#059669',
  },

  yellow: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    400: '#FBBF24',
    500: '#F59E0B',
    600: '#D97706',
  },

  red: {
    50: '#FEF2F2',
    100: '#FEE2E2',
    400: '#F87171',
    500: '#EF4444',
    600: '#DC2626',
  },

  blue: {
    50: '#EFF6FF',
    100: '#DBEAFE',
    400: '#60A5FA',
    500: '#3B82F6',
    600: '#2563EB',
  },

  // Base Colors
  white: '#FFFFFF',
  black: '#000000',

  // Background Colors (Dark Theme Base)
  background: {
    dark: '#0F0F23',
    secondary: '#1A1A2E',
    tertiary: '#252542',
    surface: '#2D2D4A',
  },
};

// ============================================
// Dark Theme Colors
// ============================================
const darkColors = {
  // Primary
  primary: palette.indigo[500],
  primaryLight: palette.indigo[400],
  primaryDark: palette.indigo[600],

  // Secondary
  secondary: palette.cyan[400],
  secondaryLight: palette.cyan[300],
  secondaryDark: palette.cyan[500],

  // Backgrounds
  background: '#0F0F23',
  backgroundSecondary: '#1A1A2E',
  backgroundTertiary: '#252542',
  surface: '#2D2D4A',

  // Text
  textPrimary: palette.white,
  textSecondary: palette.gray[400],
  textTertiary: palette.gray[500],
  textMuted: palette.gray[600],

  // Status
  success: palette.green[500],
  successLight: palette.green[400],
  successDark: palette.green[600],
  warning: palette.yellow[500],
  warningLight: palette.yellow[400],
  warningDark: palette.yellow[600],
  error: palette.red[500],
  errorLight: palette.red[400],
  errorDark: palette.red[600],
  info: palette.blue[500],
  infoLight: palette.blue[400],
  infoDark: palette.blue[600],

  // Borders
  border: '#3F3F5A',
  borderLight: '#52526E',

  // Card
  card: '#1E1E3F',
  cardHover: '#252550',

  // Input
  inputBackground: '#1A1A2E',
  inputBorder: '#3F3F5A',
  inputFocus: palette.indigo[500],

  // Overlay
  overlay: 'rgba(0, 0, 0, 0.7)',
  backdrop: 'rgba(15, 15, 35, 0.9)',

  // Gradients
  gradientPrimary: [palette.indigo[500], '#8B5CF6'] as [string, string],
  gradientSecondary: [palette.cyan[400], palette.indigo[500]] as [
    string,
    string,
  ],
  gradientSuccess: [palette.green[500], palette.green[400]] as [string, string],
};

// ============================================
// Light Theme Colors
// ============================================
const lightColors = {
  // Primary
  primary: palette.indigo[600],
  primaryLight: palette.indigo[500],
  primaryDark: palette.indigo[700],

  // Secondary
  secondary: palette.cyan[500],
  secondaryLight: palette.cyan[400],
  secondaryDark: palette.cyan[600],

  // Backgrounds
  background: palette.gray[50],
  backgroundSecondary: palette.white,
  backgroundTertiary: palette.gray[100],
  surface: palette.white,

  // Text
  textPrimary: palette.gray[900],
  textSecondary: palette.gray[600],
  textTertiary: palette.gray[500],
  textMuted: palette.gray[400],

  // Status
  success: palette.green[600],
  successLight: palette.green[500],
  successDark: palette.green[600],
  warning: palette.yellow[600],
  warningLight: palette.yellow[500],
  warningDark: palette.yellow[600],
  error: palette.red[600],
  errorLight: palette.red[500],
  errorDark: palette.red[600],
  info: palette.blue[600],
  infoLight: palette.blue[500],
  infoDark: palette.blue[600],

  // Borders
  border: palette.gray[200],
  borderLight: palette.gray[300],

  // Card
  card: palette.white,
  cardHover: palette.gray[50],

  // Input
  inputBackground: palette.white,
  inputBorder: palette.gray[300],
  inputFocus: palette.indigo[500],

  // Overlay
  overlay: 'rgba(0, 0, 0, 0.5)',
  backdrop: 'rgba(255, 255, 255, 0.9)',

  // Gradients
  gradientPrimary: [palette.indigo[500], palette.indigo[600]] as [
    string,
    string,
  ],
  gradientSecondary: [palette.cyan[400], palette.indigo[500]] as [
    string,
    string,
  ],
  gradientSuccess: [palette.green[500], palette.green[400]] as [string, string],
};

// ============================================
// Shared Theme Properties
// ============================================
const sharedTheme = {
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },

  borderRadius: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    full: 9999,
  },

  typography: {
    h1: {
      fontSize: 32,
      fontWeight: '700' as const,
      lineHeight: 40,
    },
    h2: {
      fontSize: 24,
      fontWeight: '600' as const,
      lineHeight: 32,
    },
    h3: {
      fontSize: 20,
      fontWeight: '600' as const,
      lineHeight: 28,
    },
    body: {
      fontSize: 16,
      fontWeight: '400' as const,
      lineHeight: 24,
    },
    bodySmall: {
      fontSize: 14,
      fontWeight: '400' as const,
      lineHeight: 20,
    },
    caption: {
      fontSize: 12,
      fontWeight: '400' as const,
      lineHeight: 16,
    },
    button: {
      fontSize: 16,
      fontWeight: '600' as const,
      lineHeight: 24,
    },
  },

  shadows: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 4,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.2,
      shadowRadius: 16,
      elevation: 8,
    },
  },
};

// ============================================
// Theme Definitions
// ============================================
export const darkTheme = {
  ...sharedTheme,
  colors: darkColors,
  isDark: true,
};

export const lightTheme = {
  ...sharedTheme,
  colors: lightColors,
  isDark: false,
};

// Default theme (dark)
export const theme = darkTheme;

// Theme type
export type Theme = typeof darkTheme;
export type ThemeColors = typeof darkColors;
export type ThemeMode = 'light' | 'dark' | 'system';

// Color palette export for direct access
export { palette };
