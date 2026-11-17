import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  BorderRadius, Spacing, Typography, type ThemeColors,
} from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';
import { statusInfo, type StatusKind } from '@/lib/api/format';

/** Badge for every API status concept (orders, invoices, devices, POs, ...). */
export const ApiStatusBadge: React.FC<{ status?: string; kind?: StatusKind; label?: string }> = ({
  status, kind, label,
}) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(), []);
  const info = status == null || kind != null
    ? { label: label ?? status ?? statusInfo(status ?? '').label, kind: kind ?? 'muted' as StatusKind }
    : statusInfo(status);
  const color =
    info.kind === 'success' ? colors.success
    : info.kind === 'warning' ? colors.warning
    : info.kind === 'danger' ? colors.danger
    : info.kind === 'info' ? colors.info
    : colors.textSecondary;
  return (
    <View style={[styles.badge, { backgroundColor: color + '22' }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.text, { color }]}>{info.label}</Text>
    </View>
  );
};

const createStyles = () =>
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
    dot: { width: 6, height: 6, borderRadius: 3 },
    text: { fontSize: Typography.sizes.xs, fontWeight: Typography.weights.semibold },
  });
