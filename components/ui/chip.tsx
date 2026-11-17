import * as Haptics from 'expo-haptics';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import {
  BorderRadius,
  Spacing,
  Typography,
  type ThemeColors,
} from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';

interface ChipProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    chip: {
      minHeight: 36,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: Spacing.md,
      borderRadius: BorderRadius.full,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    text: {
      fontSize: Typography.sizes.sm,
      fontWeight: Typography.weights.medium,
      color: colors.textSecondary,
    },
    textActive: {
      color: colors.onPrimary,
    },
  });

export const Chip: React.FC<ChipProps> = ({ label, active = false, onPress }) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        { opacity: pressed ? 0.85 : 1 },
      ]}>
      <Text style={[styles.text, active && styles.textActive]}>{label}</Text>
    </Pressable>
  );
};
