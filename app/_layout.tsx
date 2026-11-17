/**
 * Root layout — global providers + auth gate.
 *
 * Order matters: SessionProvider (network-independent) feeds the QueryClient
 * because apiFetch reads the session token directly from the session store.
 */
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColors } from '@/hooks/use-theme';
import { SessionProvider, useSession } from '@/lib/session';
import { createQueryClient } from '@/lib/queryClient';
import { ConfirmProvider, ToastProvider } from '@/components/ui/feedback';
import LoginComponent from './login';

export const unstable_settings = {
  anchor: '(tabs)',
};

const queryClient = createQueryClient();

export default function RootLayout() {
  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <ConfirmProvider>
            <ThemeProviderWithSafeArea />
          </ConfirmProvider>
        </ToastProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}

function ThemeProviderWithSafeArea() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider value={theme}>
      <AuthGate />
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

function AuthGate() {
  const { status, business } = useSession();
  const colors = useThemeColors();

  if (status === 'loading') {
    return (
      <View style={gateStyles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (status === 'signedOut' || !business) {
    return <LoginComponent />;
  }
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      {/* Non-tab screens get headers from their own Screen component */}
      {STACK_SCREENS.map((name) => (
        <Stack.Screen key={name} name={name} options={{ headerShown: false }} />
      ))}
    </Stack>
  );
}

const STACK_SCREENS = [
  'login',
  'product/[id]',
  'product/new',
  'order/[id]',
  'order/new',
  'customers',
  'customer/[id]',
  'customer/new',
  'invoices',
  'invoice/[id]',
  'purchases',
  'purchase/[id]',
  'purchase/new',
  'transfers',
  'transfer/[id]',
  'transfer/new',
  'returns',
  'return/[id]',
  'return/new',
  'reports',
  'warehouses',
  'devices',
  'members',
];

const gateStyles = {
  center: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
};
