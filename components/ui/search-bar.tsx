import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import {
  BorderRadius,
  Spacing,
  Typography,
  type ThemeColors,
} from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric';
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BorderRadius.lg,
      paddingHorizontal: Spacing.md,
      minHeight: 48,
    },
    input: {
      flex: 1,
      fontSize: Typography.sizes.base,
      color: colors.text,
      paddingVertical: Spacing.sm,
      marginLeft: Spacing.sm,
    },
    clear: {
      padding: Spacing.xs,
    },
  });

export const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChangeText,
  placeholder = 'Search...',
  keyboardType = 'default',
}) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <MaterialIcons name="search" size={20} color={colors.textTertiary} />
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
      {value.length > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={() => onChangeText('')}
          style={styles.clear}
          hitSlop={8}>
          <MaterialIcons name="close" size={18} color={colors.textTertiary} />
        </Pressable>
      )}
    </View>
  );
};

