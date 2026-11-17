import React, { useMemo } from 'react';
import { StyleSheet, TextInput, type TextInputProps, type StyleProp, type TextStyle } from 'react-native';
import {
  BorderRadius,
  Spacing,
  Typography,
  type ThemeColors,
} from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      marginBottom: Spacing.md,
      fontSize: Typography.sizes.base,
      color: colors.text,
      backgroundColor: colors.background,
    },
  });

interface InputProps extends TextInputProps {
  style?: StyleProp<TextStyle>;
}

export const Input: React.FC<InputProps> = ({ style, ...rest }) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <TextInput
      placeholderTextColor={colors.textTertiary}
      {...rest}
      style={[styles.input, style]}
    />
  );
};
