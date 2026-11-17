/**
 * Screen — a stack screen with a back-chevron header. Keeps every screen
 * consistent (desktop and mobile) with minimal per-screen code.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  BorderRadius, Spacing, Typography, type ThemeColors,
} from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';

export const Screen: React.FC<{
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode; // header action (e.g. + button)
  children: React.ReactNode;
  scroll?: boolean;
}> = ({ title, subtitle, back, right, children, scroll = true }) => {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const body = scroll ? (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      {children}
    </ScrollView>
  ) : (
    <>{children}</>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        {back && (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={styles.backButton}
            hitSlop={12}>
            <MaterialIcons name="arrow-back" size={22} color={colors.text} />
          </Pressable>
        )}
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {body}
    </SafeAreaView>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.backgroundSecondary,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.lg,
      paddingBottom: Spacing.md,
    },
    backButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerText: { flex: 1 },
    title: {
      fontSize: Typography.sizes['2xl'],
      fontWeight: Typography.weights.bold,
      color: colors.text,
    },
    subtitle: {
      fontSize: Typography.sizes.sm,
      color: colors.textSecondary,
      marginTop: 2,
    },
    scrollContent: { paddingBottom: Spacing['3xl'] },
  });

/** Card-ish row used by list screens. */
export const ListRow: React.FC<{
  onPress?: () => void;
  children: React.ReactNode;
  style?: object;
}> = ({ onPress, children, style }) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createListStyles(colors), [colors]);
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.row,
        { opacity: pressed && onPress ? 0.85 : 1 },
        style,
      ]}>
      {children}
    </Pressable>
  );
};

const createListStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      marginBottom: Spacing.sm,
    },
  });
