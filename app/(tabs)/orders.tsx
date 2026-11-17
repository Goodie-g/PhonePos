/**
 * Orders tab — sales order list with status filter chips (+ create FAB).
 */
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { FAB } from '@/components/ui/fab';
import { ErrorView, LoadingView } from '@/components/ui/feedback';
import { ApiStatusBadge } from '@/components/ui/api-status-badge';
import { Button } from '@/components/ui/button';
import { BorderRadius, Spacing, Typography, type ThemeColors } from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';
import { formatDateTime, formatMoney } from '@/lib/api/format';
import { useOrders } from '@/hooks/api/use-commerce';

const STATUSES = ['SUBMITTED', 'CONFIRMED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'INVOICED', 'DRAFT', 'CANCELLED'];

export default function OrdersScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [status, setStatus] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const orders = useOrders({ status: status ?? undefined, page, pageSize: 15 });
  const items = orders.data?.data ?? [];
  const pageCount = Math.max(1, Math.ceil((orders.data?.total ?? 0) / 15));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Orders</Text>
        <Text style={styles.subtitle}>Orders must be confirmed (reserving stock) before fulfilment.</Text>
      </View>
      <View style={styles.chips}>
        <Chip label="All" active={status === null} onPress={() => { setStatus(null); setPage(1); }} />
        {STATUSES.map((s) => (
          <Chip key={s} label={s === 'PARTIALLY_FULFILLED' ? 'Part-fulfilled' : s.charAt(0) + s.slice(1).toLowerCase()} active={status === s} onPress={() => { setStatus(s); setPage(1); }} />
        ))}
      </View>

      {orders.isLoading && <LoadingView />}
      {orders.error && <ErrorView error={orders.error} retry={() => orders.refetch()} />}

      {!orders.isLoading && !orders.error && (
        items.length === 0 ? (
          <EmptyState icon="receipt-long" title="No orders" subtitle="Create an order for one of your customers." />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(o: any) => o.id}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(`/order/${item.id}`)}
                style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.orderNumber} · {item.customer.name}
                  </Text>
                  <Text style={styles.meta} numberOfLines={2}>
                    {item.items.length} line(s) · {formatMoney(item.grandTotal)} · {formatDateTime(item.createdAt)}
                  </Text>
                </View>
                <ApiStatusBadge status={item.status} />
              </Pressable>
            )}
            ListFooterComponent={
              <View style={styles.pager}>
                <Button text="‹ Prev" size="sm" variant="secondary" disabled={page <= 1} onPress={() => setPage(page - 1)} />
                <Text style={[styles.pageText, { color: colors.textSecondary }]}>{page} / {pageCount}</Text>
                <Button text="Next ›" size="sm" variant="secondary" disabled={page >= pageCount} onPress={() => setPage(page + 1)} />
              </View>
            }
            contentContainerStyle={{ paddingBottom: Spacing['2xl'], paddingHorizontal: Spacing.lg }}
          />
        )
      )}

      <FAB onPress={() => router.push('/order/new')} icon="add" />
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.backgroundSecondary },
    header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
    title: { fontSize: Typography.sizes['2xl'], fontWeight: Typography.weights.bold, color: colors.text },
    subtitle: { fontSize: Typography.sizes.xs, color: colors.textSecondary, marginTop: 2 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      marginBottom: Spacing.sm,
      gap: Spacing.md,
    },
    name: { fontSize: Typography.sizes.base, fontWeight: Typography.weights.semibold, color: colors.text },
    meta: { fontSize: Typography.sizes.xs, color: colors.textSecondary, marginTop: 2 },
    pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.md, marginTop: Spacing.sm },
    pageText: { fontSize: Typography.sizes.sm },
  });

