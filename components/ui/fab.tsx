import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { BorderRadius, Shadows, type ThemeColors } from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';

interface FABProps {
  icon?: keyof typeof MaterialIcons.glyphMap;
  onPress: () => void;
  accessibilityLabel?: string;
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    fab: {
      position: 'absolute',
      right: 20,
      bottom: 24,
      width: 56,
      height: 56,
      borderRadius: BorderRadius.full,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      ...Shadows.lg,
    },
  });

export const FAB: React.FC<FABProps> = ({ icon = 'add', onPress, accessibilityLabel = 'Add' }) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [
        styles.fab,
        { opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] },
      ]}>
      <MaterialIcons name={icon} size={26} color={colors.onPrimary} />
    </Pressable>
  );
};
