import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  BorderRadius,
  Spacing,
  Typography,
  statusColor,
  statusLabel,
  type ProductStatus,
  type ThemeColors,
} from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';

interface StatusBadgeProps {
  status: ProductStatus;
  label?: string;
}

const createStyles = (_colors: ThemeColors) =>
  StyleSheet.create({
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 4,
      borderRadius: BorderRadius.full,
      alignSelf: 'flex-start',
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    text: {
      fontSize: Typography.sizes.xs,
      fontWeight: Typography.weights.semibold,
    },
  });

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label }) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.badge, { backgroundColor: statusColor(colors, status) + '22' }]}>
      <View style={[styles.dot, { backgroundColor: statusColor(colors, status) }]} />
      <Text style={[styles.text, { color: statusColor(colors, status) }]}>
        {label ?? statusLabel[status]}
      </Text>
    </View>
  );
};
