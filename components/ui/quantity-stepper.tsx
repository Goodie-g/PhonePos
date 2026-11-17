import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  BorderRadius,
  Spacing,
  Typography,
  type ThemeColors,
} from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';

interface QuantityStepperProps {
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
  decrementDisabled?: boolean;
  incrementLabel?: string;
  decrementLabel?: string;
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    button: {
      width: 40,
      height: 40,
      borderRadius: BorderRadius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    value: {
      minWidth: 32,
      textAlign: 'center',
      fontSize: Typography.sizes.lg,
      fontWeight: Typography.weights.bold,
      color: colors.text,
    },
  });

export const QuantityStepper: React.FC<QuantityStepperProps> = ({
  value,
  onIncrement,
  onDecrement,
  decrementDisabled = false,
  incrementLabel = 'Increase quantity',
  decrementLabel = 'Decrease quantity',
}) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={decrementLabel}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onDecrement();
        }}
        disabled={decrementDisabled}
        style={({ pressed }) => [
          styles.button,
          { opacity: decrementDisabled ? 0.35 : pressed ? 0.7 : 1 },
        ]}>
        <MaterialIcons name="remove" size={20} color={colors.text} />
      </Pressable>
      <Text style={styles.value}>{value}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={incrementLabel}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onIncrement();
        }}
        style={({ pressed }) => [styles.button, { opacity: pressed ? 0.7 : 1 }]}>
        <MaterialIcons name="add" size={20} color={colors.text} />
      </Pressable>
    </View>
  );
};
