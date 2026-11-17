/**
 * Design System for Stoku Inventory App
 * Mobile-first, clean, vibrant, fast
 * Single source of truth for tokens (light + dark).
 */

import type { TextStyle } from 'react-native';

export type ProductStatus = 'in-stock' | 'low-stock' | 'out-of-stock';

export type ThemeColors = {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  onPrimary: string;

  success: string;
  warning: string;
  danger: string;
  info: string;

  successBg: string;
  warningBg: string;
  dangerBg: string;
  infoBg: string;

  background: string;
  backgroundSecondary: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  muted: string;
};

export const lightColors: ThemeColors = {
  primary: '#6366F1',
  primaryLight: '#E0E7FF',
  primaryDark: '#4F46E5',
  onPrimary: '#FFFFFF',

  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#3B82F6',

  successBg: '#ECFDF5',
  warningBg: '#FFFBEB',
  dangerBg: '#FEF2F2',
  infoBg: '#EFF6FF',

  background: '#FFFFFF',
  backgroundSecondary: '#F3F4F6',
  text: '#111827',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',
  border: '#E5E7EB',
  muted: '#F3F4F6',
};

export const darkColors: ThemeColors = {
  primary: '#818CF8',
  primaryLight: '#312E81',
  primaryDark: '#6366F1',
  onPrimary: '#111827',

  success: '#34D399',
  warning: '#FBBF24',
  danger: '#F87171',
  info: '#60A5FA',

  successBg: 'rgba(52, 211, 153, 0.14)',
  warningBg: 'rgba(251, 191, 36, 0.14)',
  dangerBg: 'rgba(248, 113, 113, 0.14)',
  infoBg: 'rgba(96, 165, 250, 0.14)',

  background: '#1F2937',
  backgroundSecondary: '#111827',
  text: '#F9FAFB',
  textSecondary: '#9CA3AF',
  textTertiary: '#6B7280',
  border: '#374151',
  muted: '#374151',
};

/** Hero gradient used on the dashboard stat card */
export const heroGradient = ['#6366F1', '#8B5CF6'] as const;

/** Status color mapping shared by badges, dots and inline indicators */
export const statusColor = (colors: ThemeColors, status: ProductStatus): string => {
  switch (status) {
    case 'in-stock':
      return colors.success;
    case 'low-stock':
      return colors.warning;
    case 'out-of-stock':
      return colors.danger;
  }
};

export const statusBg = (colors: ThemeColors, status: ProductStatus): string => {
  switch (status) {
    case 'in-stock':
      return colors.successBg;
    case 'low-stock':
      return colors.warningBg;
    case 'out-of-stock':
      return colors.dangerBg;
  }
};

export const statusLabel: Record<ProductStatus, string> = {
  'in-stock': 'In Stock',
  'low-stock': 'Low Stock',
  'out-of-stock': 'Out of Stock',
};

type FontWeight = NonNullable<TextStyle['fontWeight']>;

export const Typography = {
  sizes: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
  },

  weights: {
    normal: '400' as FontWeight,
    medium: '500' as FontWeight,
    semibold: '600' as FontWeight,
    bold: '700' as FontWeight,
  },

  lineHeights: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
};

export const BorderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 24,
  full: 9999,
};

export const Shadows = {
  sm: {
    shadowColor: 'rgba(0, 0, 0, 0.08)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: 'rgba(0, 0, 0, 0.12)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: 'rgba(0, 0, 0, 0.16)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 8,
  },
};
