/** Transfers list — tap a transfer to dispatch/receive it. */
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
import { formatDateTime } from '@/lib/api/format';
import { useTransfers } from '@/hooks/api/use-operations';

export default function TransfersScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [status, setStatus] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const transfers = useTransfers({ status: status ?? undefined, page, pageSize: 15 });
  const items = transfers.data?.data ?? [];
  const pageCount = Math.max(1, Math.ceil((transfers.data?.total ?? 0) / 15));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}><Text style={styles.title}>Transfers</Text></View>
      <View style={[styles.chips, { flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingHorizontal: 16, marginBottom: 8 }]}>
        <Chip label="All" active={status === null} onPress={() => { setStatus(null); setPage(1); }} />
        {['DRAFT', 'DISPATCHED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'].map((s) => (
          <Chip key={s} label={s.replace('_', ' ')} active={status === s} onPress={() => { setStatus(s); setPage(1); }} />
        ))}
      </View>

      {transfers.isLoading && <LoadingView />}
      {transfers.error && <ErrorView error={transfers.error} retry={() => transfers.refetch()} />}
      {!transfers.isLoading && !transfers.error && (
        items.length === 0 ? (
          <EmptyState icon="swap-horiz" title="No transfers" subtitle="Move stock between warehouses with a transfer." />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(t: any) => t.id}
            renderItem={({ item }) => (
              <Pressable accessibilityRole="button" onPress={() => router.push(`/transfer/${item.id}`)}
                style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.transferNumber}</Text>
                  <Text style={styles.meta}>
                    {item.fromWarehouse.name} → {item.toWarehouse.name} · {formatDateTime(item.createdAt)}
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
      <FAB onPress={() => router.push('/transfer/new')} icon="add" />
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.backgroundSecondary },
    header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
    title: { fontSize: Typography.sizes['2xl'], fontWeight: Typography.weights.bold, color: colors.text },
    chips: {},
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

