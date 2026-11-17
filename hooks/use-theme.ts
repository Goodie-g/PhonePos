import { darkColors, lightColors, type ThemeColors } from '@/constants/design';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useThemeColors(): ThemeColors {
  const scheme = useColorScheme();
  return scheme === 'dark' ? darkColors : lightColors;
}
