/**
 * More tab — navigation menu for the remaining modules + business switching.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { BorderRadius, Spacing, Typography, type ThemeColors } from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';
import { useSession } from '@/lib/session';
import { useConfirm } from '@/components/ui/feedback';

const MENU: { icon: any; label: string; route: string }[] = [
  { icon: 'inventory', label: 'Stock & movements', route: '/reports' },
  { icon: 'store', label: 'Customers', route: '/customers' },
  { icon: 'receipt', label: 'Invoices', route: '/invoices' },
  { icon: 'local-shipping', label: 'Purchases & receiving', route: '/purchases' },
  { icon: 'swap-horiz', label: 'Warehouse transfers', route: '/transfers' },
  { icon: 'qr-scanner', label: 'Devices (IMEI)', route: '/devices' },
  { icon: 'assignment-return', label: 'Customer returns', route: '/returns' },
  { icon: 'warehouse', label: 'Warehouses', route: '/warehouses' },
  { icon: 'group', label: 'Team members', route: '/members' },
];

export default function MoreScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, memberships, business, switchBusiness, logout } = useSession();
  const confirm = useConfirm();

  return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing['3xl'] }}>
          <Text style={styles.title}>More</Text>

          <Card>
            <Text style={styles.sectionTitle}>Signed in</Text>
            <Text style={styles.text}>{user?.fullName} · {user?.email}</Text>
          </Card>

          {memberships.length > 1 && (
            <Card>
              <Text style={styles.sectionTitle}>Switch business</Text>
              {memberships.map((m) => (
                <Pressable
                  key={m.businessId}
                  style={({ pressed }) => [styles.bizRow, pressed && { opacity: 0.7 }]}
                  onPress={() => switchBusiness(m.businessId)}>
                  <MaterialIcons
                    name={m.businessId === business?.businessId ? 'radio-button-checked' : 'radio-button-unchecked'}
                    size={20} color={colors.primary} />
                  <Text style={[styles.text, { flex: 1 }]}>
                    {m.businessName} ({m.role})
                  </Text>
                </Pressable>
              ))}
            </Card>
          )}

          <View style={{ marginTop: Spacing.md, gap: Spacing.sm }}>
            {MENU.map((item) => (
              <Pressable
                key={item.route}
                accessibilityRole="button"
                onPress={() => router.push(item.route)}
                style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.8 }]}>
                <MaterialIcons name={item.icon} size={20} color={colors.primary} />
                <Text style={[styles.menuText, { color: colors.text }]}>{item.label}</Text>
                <MaterialIcons name="chevron-right" size={20} color={colors.textTertiary} />
              </Pressable>
            ))}
          </View>

          <View style={{ marginTop: Spacing.xl }}>
            <Button
              text="Sign out"
              variant="danger"
              onPress={() => confirm({ title: 'Sign out?', actionLabel: 'Sign out', danger: true }).then((ok) => { if (ok) logout(); })}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.backgroundSecondary },
    title: { fontSize: Typography.sizes['2xl'], fontWeight: Typography.weights.bold, color: colors.text, marginBottom: Spacing.md },
    sectionTitle: { fontSize: Typography.sizes.sm, fontWeight: Typography.weights.semibold, color: colors.textSecondary, marginBottom: Spacing.sm },
    text: { fontSize: Typography.sizes.sm, color: colors.text },
    bizRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xs },
    menuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
    },
    menuText: { flex: 1, fontSize: Typography.sizes.base, fontWeight: Typography.weights.medium },
  });

