/** Purchases list — POs with status; tap for detail/receiving. */
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Chip } from '@/components/ui/chip';
import { FAB } from '@/components/ui/fab';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorView, LoadingView } from '@/components/ui/feedback';
import { ApiStatusBadge } from '@/components/ui/api-status-badge';
import { Button } from '@/components/ui/button';
import { BorderRadius, Spacing, Typography, type ThemeColors } from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';
import { formatDate, formatMoney } from '@/lib/api/format';
import { usePurchases } from '@/hooks/api/use-operations';

const PO_TOTAL = (po: any) => (po.items ?? []).reduce((s: number, i: any) => s + Number(i.quantity) * Number(i.unitCost), 0);

export default function PurchasesScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [status, setStatus] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const purchases = usePurchases({ status: status ?? undefined, page, pageSize: 15 });
  const items = purchases.data?.data ?? [];
  const pageCount = Math.max(1, Math.ceil((purchases.data?.total ?? 0) / 15));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Purchases</Text>
        <Text style={styles.subtitle}>Stock only changes when goods are actually received.</Text>
      </View>
      <View style={styles.chips}>
        <Chip label="All" active={status === null} onPress={() => { setStatus(null); setPage(1); }} />
        {['DRAFT', 'SUBMITTED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'].map((s) => (
          <Chip key={s} label={s.replace('_', ' ')} active={status === s} onPress={() => { setStatus(s); setPage(1); }} />
        ))}
      </View>

      {purchases.isLoading && <LoadingView />}
      {purchases.error && <ErrorView error={purchases.error} retry={() => purchases.refetch()} />}
      {!purchases.isLoading && !purchases.error && (
        items.length === 0 ? (
          <EmptyState icon="local-shipping" title="No purchase orders" subtitle="Create a PO to buy stock from a supplier." />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(p: any) => p.id}
            renderItem={({ item }) => (
              <Pressable accessibilityRole="button" onPress={() => router.push(`/purchase/${item.id}`)}
                style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.poNumber} · {item.supplier.name}</Text>
                  <Text style={styles.meta}>
                    {formatMoney(PO_TOTAL(item))} · {formatDate(item.createdAt)}
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
      <FAB onPress={() => router.push('/purchase/new')} icon="add" />
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
      flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background,
      borderWidth: 1, borderColor: colors.border, borderRadius: BorderRadius.lg,
      padding: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.md,
    },
    name: { fontSize: Typography.sizes.base, fontWeight: Typography.weights.semibold, color: colors.text },
    meta: { fontSize: Typography.sizes.xs, color: colors.textSecondary, marginTop: 2 },
    pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.md, marginTop: Spacing.sm },
    pageText: { fontSize: Typography.sizes.sm },
  });

