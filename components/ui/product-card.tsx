import { Image } from 'expo-image';
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  BorderRadius,
  Shadows,
  Spacing,
  Typography,
  statusBg,
  statusColor,
  statusLabel,
  type ProductStatus,
  type ThemeColors,
} from '@/constants/design';
import { formatMoney } from '@/lib/api/format';
import { useThemeColors } from '@/hooks/use-theme';

interface ProductCardProps {
  image?: string;
  name: string;
  variant?: string;
  variantCount?: number;
  quantity: number;
  price?: number;
  status: ProductStatus;
  onPress?: () => void;
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.background,
      borderRadius: BorderRadius.lg,
      overflow: 'hidden',
      marginBottom: Spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      ...Shadows.md,
    },
    imageContainer: {
      width: '100%',
      height: 160,
      backgroundColor: colors.backgroundSecondary,
    },
    image: {
      width: '100%',
      height: '100%',
    },
    imagePlaceholder: {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.muted,
    },
    badge: {
      position: 'absolute',
      top: Spacing.sm,
      left: Spacing.sm,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 3,
      borderRadius: BorderRadius.full,
    },
    badgeText: {
      fontSize: Typography.sizes.xs,
      fontWeight: Typography.weights.semibold,
    },
    content: {
      padding: Spacing.md,
    },
    name: {
      fontSize: Typography.sizes.base,
      fontWeight: Typography.weights.semibold,
      color: colors.text,
      marginBottom: 2,
    },
    variant: {
      fontSize: Typography.sizes.sm,
      color: colors.textSecondary,
      marginBottom: Spacing.sm,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    price: {
      fontSize: Typography.sizes.lg,
      fontWeight: Typography.weights.bold,
      color: colors.text,
    },
    qtyPill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.sm,
      paddingVertical: 3,
      borderRadius: BorderRadius.full,
      gap: 4,
    },
    qtyText: {
      fontSize: Typography.sizes.sm,
      fontWeight: Typography.weights.semibold,
    },
  });

export const ProductCard: React.FC<ProductCardProps> = ({
  image,
  name,
  variant,
  variantCount,
  quantity,
  price,
  status,
  onPress,
}) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const subtitle =
    variantCount && variantCount > 1
      ? `${variantCount} variants`
      : variant ?? undefined;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      activeOpacity={0.85}
      style={styles.container}>
      <View style={styles.imageContainer}>
        {image ? (
          <Image source={{ uri: image }} style={styles.image} contentFit="cover" transition={150} />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={{ fontSize: 28, color: colors.textTertiary }}>📦</Text>
          </View>
        )}
        <View
          style={[
            styles.badge,
            { backgroundColor: statusBg(colors, status) },
          ]}>
          <Text style={[styles.badgeText, { color: statusColor(colors, status) }]}>
            {statusLabel[status]}
          </Text>
        </View>
      </View>

      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {subtitle ? (
          <Text style={styles.variant} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}

        <View style={styles.footer}>
          {price != null ? (
            <Text style={styles.price}>{formatMoney(price)}</Text>
          ) : (
            <View />
          )}
          <View
            style={[
              styles.qtyPill,
              { backgroundColor: statusBg(colors, status) },
            ]}>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: statusColor(colors, status),
              }}
            />
            <Text style={[styles.qtyText, { color: statusColor(colors, status) }]}>
              {quantity} in stock
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};


