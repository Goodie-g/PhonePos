import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Spacing, Typography, type ThemeColors } from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';

interface EmptyStateProps {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Spacing['3xl'],
      paddingHorizontal: Spacing.xl,
    },
    iconWrap: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.lg,
    },
    title: {
      fontSize: Typography.sizes.lg,
      fontWeight: Typography.weights.semibold,
      color: colors.text,
      marginBottom: Spacing.sm,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: Typography.sizes.sm,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: Spacing.lg,
    },
  });

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, subtitle, action }) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <MaterialIcons name={icon} size={32} color={colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {action}
    </View>
  );
};
