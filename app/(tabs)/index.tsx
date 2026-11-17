/**
 * Dashboard — all numbers come from /api/reports/dashboard (server aggregates),
 * plus a few server-side queries for recent orders & low stock.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { ApiStatusBadge } from '@/components/ui/api-status-badge';
import { ErrorView, LoadingView } from '@/components/ui/feedback';
import {
  BorderRadius, Spacing, Typography, heroGradient, type ThemeColors,
} from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';
import { useSession } from '@/lib/session';
import { formatDateTime, formatMoney } from '@/lib/api/format';
import { useDashboard } from '@/hooks/api/use-operations';
import { useOrders } from '@/hooks/api/use-commerce';
import { useBalances } from '@/hooks/api/use-catalogue';
import { useConfirm } from '@/components/ui/feedback';

function Metric({
  label, value, icon, tone,
}: {
  label: string; value: string; icon: any; tone?: 'success' | 'danger' | 'warning';
}) {
  const colors = useThemeColors();
  const tint = tone === 'success' ? colors.success : tone === 'danger' ? colors.danger : tone === 'warning' ? colors.warning : colors.primary;
  return (
    <View style={[dashStyles.metric, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <MaterialIcons name={icon} size={18} color={tint} />
      <Text style={[dashStyles.metricValue, { color: colors.text }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[dashStyles.metricLabel, { color: colors.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, business } = useSession();
  const { data, isLoading, error, refetch } = useDashboard();
  const ordersQuery = useOrders({ page: 1, pageSize: 5 });
  const lowStockQuery = useBalances({ pageSize: 6 });

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  if (isLoading) return <LoadingView message="Loading dashboard…" />;
  if (error) return <View style={{ flex: 1, justifyContent: 'center' }}><ErrorView error={error} retry={() => refetch()} /></View>;

  const d = data.data;
  const lowStock = (lowStockQuery.data?.data ?? []).filter((b: any) => b.isLow).slice(0, 4);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Spacing['2xl'] }}>
        <View style={styles.header}>
          <View>
            <Text style={styles.dateText}>{today}</Text>
            <Text style={styles.title}>{business?.businessName ?? 'Stoku'}</Text>
          </View>
          <View style={styles.userChip}>
            <Text style={styles.userName} numberOfLines={1}>{user?.fullName}</Text>
            <Text style={styles.userRole}>{business?.role}</Text>
          </View>
        </View>

        <LinearGradient
          colors={[...heroGradient]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}>
          <Text style={styles.heroLabel}>Invoiced sales (all time)</Text>
          <Text style={styles.heroValue}>{formatMoney(d.revenue)}</Text>
          <View style={styles.heroMeta}>
            <View style={styles.heroMetaItem}>
              <Text style={styles.heroMetaValue}>{d.invoicesIssued}</Text>
              <Text style={styles.heroMetaLabel}>Invoices</Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroMetaItem}>
              <Text style={styles.heroMetaValue}>{formatMoney(d.cashCollected)}</Text>
              <Text style={styles.heroMetaLabel}>Cash collected</Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroMetaItem}>
              <Text style={styles.heroMetaValue}>{formatMoney(d.totalOutstanding)}</Text>
              <Text style={styles.heroMetaLabel}>Outstanding</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={dashStyles.metricRow}>
          <Metric label="Est. gross profit" value={formatMoney(d.grossProfit)} icon="trending-up" tone="success" />
          <Metric label="Open orders" value={String(Object.values(d.openOrders ?? {}).reduce((s: number, n: any) => s + Number(n), 0))} icon="pending-actions" />
        </View>
        <Text style={[dashStyles.metricNote, { color: colors.textTertiary }]}>
          Gross profit is an estimate: invoiced revenue minus VAT minus acquisition costs.
        </Text>

        <View style={styles.sectionContainer}>
          <SectionHeader title="Recent orders" actionLabel="View all" onAction={() => router.push('/orders')} />
          <Card>
            {ordersQuery.isLoading ? (
              <Text style={styles.emptyText}>Loading…</Text>
            ) : (ordersQuery.data?.data ?? []).length === 0 ? (
              <Text style={styles.emptyText}>No orders yet — create one from the Orders tab.</Text>
            ) : (
              (ordersQuery.data!.data as any[]).map((order) => (
                <Pressable
                  key={order.id}
                  accessibilityRole="button"
                  onPress={() => router.push(`/order/${order.id}`)}
                  style={styles.orderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderName} numberOfLines={1}>
                      {order.orderNumber} · {order.customer.name}
                    </Text>
                    <Text style={styles.orderMeta}>
                      {formatMoney(order.grandTotal)} · {formatDateTime(order.createdAt)}
                    </Text>
                  </View>
                  <ApiStatusBadge status={order.status} />
                </Pressable>
              ))
            )}
          </Card>
        </View>

        {lowStock.length > 0 && (
          <View style={styles.sectionContainer}>
            <SectionHeader title="Low stock" actionLabel="Stock report" onAction={() => router.push('/reports')} />
            {lowStock.map((b: any) => (
              <Pressable
                key={b.id}
                accessibilityRole="button"
                onPress={() => { /* navigates to stock report */ router.push('/reports'); }}
                style={styles.lowStockRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.orderName} numberOfLines={1}>
                    {b.variant.product.brand?.name ?? ''} · {b.variant.sku}
                  </Text>
                  <Text style={styles.orderMeta}>
                    {b.available} available at {b.warehouse.name}
                  </Text>
                </View>
                <ApiStatusBadge kind="warning" label="Low stock" />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const dashStyles = StyleSheet.create({
  metricRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  metricNote: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    fontSize: Typography.sizes.xs,
  },
  metric: {
    flex: 1,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#E5E7EB', // overridden at runtime with theme colors
    padding: Spacing.md,
    gap: 4,
    alignItems: 'center',
  },
  metricValue: { fontSize: Typography.sizes.base, fontWeight: Typography.weights.bold },
  metricLabel: { fontSize: Typography.sizes.xs, textAlign: 'center' },
});

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.backgroundSecondary },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.lg,
      paddingBottom: Spacing.md,
    },
    dateText: {
      fontSize: Typography.sizes.sm,
      color: colors.textSecondary,
      fontWeight: Typography.weights.medium,
    },
    title: {
      fontSize: Typography.sizes['2xl'],
      fontWeight: Typography.weights.bold,
      color: colors.text,
      marginTop: 2,
    },
    userChip: { alignItems: 'flex-end' },
    userName: { fontSize: Typography.sizes.sm, color: colors.text, fontWeight: Typography.weights.semibold },
    userRole: { fontSize: Typography.sizes.xs, color: colors.textTertiary },
    heroCard: {
      marginHorizontal: Spacing.lg,
      borderRadius: BorderRadius.xl,
      padding: Spacing.xl,
      marginBottom: Spacing.lg,
    },
    heroLabel: {
      fontSize: Typography.sizes.sm,
      color: 'rgba(255,255,255,0.85)',
      fontWeight: Typography.weights.medium,
    },
    heroValue: {
      fontSize: Typography.sizes['3xl'],
      fontWeight: Typography.weights.bold,
      color: '#FFFFFF',
      marginTop: Spacing.xs,
      marginBottom: Spacing.lg,
    },
    heroMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    heroMetaItem: { flex: 1, alignItems: 'center' },
    heroMetaValue: { fontSize: Typography.sizes.base, fontWeight: Typography.weights.bold, color: '#FFFFFF' },
    heroMetaLabel: { fontSize: Typography.sizes.xs, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
    heroDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.25)' },
    sectionContainer: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.xl },
    emptyText: { fontSize: Typography.sizes.sm, color: colors.textSecondary },
    orderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Spacing.sm,
      gap: Spacing.md,
    },
    orderName: {
      fontSize: Typography.sizes.base,
      fontWeight: Typography.weights.semibold,
      color: colors.text,
    },
    orderMeta: { fontSize: Typography.sizes.xs, color: colors.textSecondary, marginTop: 2 },
    lowStockRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: Spacing.md,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      marginBottom: Spacing.sm,
      gap: Spacing.md,
    },
  });
