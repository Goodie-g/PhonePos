/**
 * Login screen — react-hook-form + zod + SessionProvider.login().
 * Includes quick-login buttons for the seeded demo users (shown on all
 * platforms; harmless because they just prefill the form fields).
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  BorderRadius, Spacing, Typography, heroGradient, type ThemeColors,
} from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/session';
import { ApiClientError } from '@/lib/api/client';

const loginForm = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});
type LoginForm = z.infer<typeof loginForm>;

const DEMO_USERS = [
  { label: 'Business owner', email: 'neema@uhuruphones.co.tz' },
  { label: 'Sales manager', email: 'sales@uhuruphones.co.tz' },
  { label: 'Warehouse staff', email: 'store@uhuruphones.co.tz' },
  { label: 'Second business (owner)', email: 'baraka@kiligadgets.co.tz' },
];

export default function LoginScreen() {
  const colors = useThemeColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { login } = useSession();
  const [submitting, setSubmitting] = React.useState(false);
  const [rootError, setRootError] = React.useState<string | null>(null);

  const { handleSubmit, setValue, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginForm),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    setRootError(null);
    try {
      await login(values.email.toLowerCase().trim(), values.password);
    } catch (err) {
      setRootError(err instanceof ApiClientError ? err.message : (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  });

  const quickLogin = (email: string) => {
    setValue('email', email, { shouldValidate: true });
    setValue('password', 'Stoku2026!', { shouldValidate: true });
    onSubmit();
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <LinearGradient colors={[...heroGradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <MaterialIcons name="smartphone" size={44} color="#FFFFFF" />
          <Text style={styles.heroTitle}>Stoku</Text>
          <Text style={styles.heroSubtitle}>Wholesale & distribution for mobile-phone businesses</Text>
        </LinearGradient>

        <View style={styles.formWrap}>
          <Text style={styles.formTitle}>Sign in</Text>

          <View>
            <Text style={styles.label}>Email</Text>
            <Input
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@business.co.tz"
              onChangeText={(v) => setValue('email', v, { shouldValidate: true })}
            />
          </View>
          {errors.email ? <Text style={styles.error}>{errors.email.message}</Text> : null}

          <View>
            <Text style={styles.label}>Password</Text>
            <Input secureTextEntry placeholder="••••••••" onChangeText={(v) => setValue('password', v, { shouldValidate: true })} />
          </View>
          {errors.password ? <Text style={styles.error}>{errors.password.message}</Text> : null}
          {rootError ? <Text style={styles.error}>{rootError}</Text> : null}

          <View style={{ marginTop: Spacing.md }}>
            <Button text={submitting ? 'Signing in…' : 'Sign in'} onPress={onSubmit} disabled={submitting} />
          </View>

          <View style={styles.demo}>
            <Text style={styles.demoTitle}>Demo accounts (seeded, password Stoku2026!)</Text>
            {DEMO_USERS.map((u) => (
              <Pressable
                key={u.email}
                accessibilityRole="button"
                onPress={() => quickLogin(u.email)}
                style={({ pressed }) => [styles.demoRow, pressed && { opacity: 0.7 }]}>
                <Text style={styles.demoLabel}>{u.label}</Text>
                <Text style={styles.demoEmail}>{u.email}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.backgroundSecondary },
    hero: {
      alignItems: 'center',
      paddingVertical: Spacing['2xl'],
      gap: Spacing.sm,
    },
    heroTitle: { fontSize: Typography.sizes['4xl'], fontWeight: Typography.weights.bold, color: '#FFFFFF' },
    heroSubtitle: { fontSize: Typography.sizes.sm, color: 'rgba(255,255,255,0.85)', textAlign: 'center' },
    formWrap: {
      flex: 1,
      margin: Spacing.lg,
      padding: Spacing.xl,
      backgroundColor: colors.background,
      borderRadius: BorderRadius.xl,
      borderWidth: 1,
      borderColor: colors.border,
    },
    formTitle: {
      fontSize: Typography.sizes.xl,
      fontWeight: Typography.weights.bold,
      color: colors.text,
      marginBottom: Spacing.lg,
    },
    label: {
      fontSize: Typography.sizes.sm,
      fontWeight: Typography.weights.medium,
      color: colors.textSecondary,
      marginBottom: Spacing.xs,
    },
    error: { color: colors.danger, fontSize: Typography.sizes.xs, marginBottom: Spacing.sm },
    demo: { marginTop: Spacing.xl, gap: Spacing.xs },
    demoTitle: {
      fontSize: Typography.sizes.xs,
      color: colors.textTertiary,
      fontWeight: Typography.weights.semibold,
      marginBottom: Spacing.sm,
    },
    demoRow: {
      padding: Spacing.md,
      borderRadius: BorderRadius.md,
      backgroundColor: colors.backgroundSecondary,
      marginBottom: Spacing.xs,
    },
    demoLabel: { fontSize: Typography.sizes.sm, fontWeight: Typography.weights.semibold, color: colors.text },
    demoEmail: { fontSize: Typography.sizes.xs, color: colors.textSecondary },
  });
