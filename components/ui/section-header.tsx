import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Spacing, Typography, type ThemeColors } from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';

interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.md,
    },
    title: {
      fontSize: Typography.sizes.lg,
      fontWeight: Typography.weights.semibold,
      color: colors.text,
    },
    action: {
      fontSize: Typography.sizes.sm,
      fontWeight: Typography.weights.semibold,
      color: colors.primary,
    },
  });

export const SectionHeader: React.FC<SectionHeaderProps> = ({ title, actionLabel, onAction }) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8}>
          <Text style={styles.action}>{actionLabel}</Text>
        </Pressable>
      ) : (
        <View />
      )}
    </View>
  );
};
