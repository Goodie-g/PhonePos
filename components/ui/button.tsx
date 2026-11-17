import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, type ViewStyle } from 'react-native';
import {
  BorderRadius,
  Spacing,
  Typography,
  type ThemeColors,
} from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';

interface ButtonProps {
  onPress?: () => void;
  text: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  style?: ViewStyle;
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    button: {
      borderRadius: BorderRadius.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: {
      fontSize: Typography.sizes.base,
      fontWeight: Typography.weights.semibold,
    },
    disabled: {
      opacity: 0.5,
    },
  });

export const Button: React.FC<ButtonProps> = ({
  onPress,
  text,
  variant = 'primary',
  size = 'md',
  disabled = false,
  style,
}) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const backgroundColor = {
    primary: colors.primary,
    secondary: colors.muted,
    danger: colors.danger,
    success: colors.success,
  }[variant];

  const textColor = {
    primary: colors.onPrimary,
    secondary: colors.text,
    danger: colors.onPrimary,
    success: colors.onPrimary,
  }[variant];

  const sizeStyles = {
    sm: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, minHeight: 36 },
    md: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, minHeight: 44 },
    lg: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg, minHeight: 52 },
  }[size];

  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, sizeStyles, { backgroundColor }, style, disabled && styles.disabled]}>
      <Text style={[styles.text, { color: textColor }]}>{text}</Text>
    </TouchableOpacity>
  );
};
