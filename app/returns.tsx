/** Returns list — tap for inspection/restock decisions. */
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorView, LoadingView } from '@/components/ui/feedback';
import { ApiStatusBadge } from '@/components/ui/api-status-badge';
import { Button } from '@/components/ui/button';
import { BorderRadius, Spacing, Typography, type ThemeColors } from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';
import { formatDate, formatMoney } from '@/lib/api/format';
import { useReturns } from '@/hooks/api/use-operations';

export default function ReturnsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [status, setStatus] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const returns = useReturns({ status: status ?? undefined, page, pageSize: 15 });
  const items = returns.data?.data ?? [];
  const pageCount = Math.max(1, Math.ceil((returns.data?.total ?? 0) / 15));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Returns</Text>
        <Text style={styles.subtitle}>Returned phones stay out of stock until they pass inspection.</Text>
      </View>
      <View style={styles.chips}>
        <Chip label="All" active={status === null} onPress={() => { setStatus(null); setPage(1); }} />
        {['RECEIVED', 'UNDER_INSPECTION', 'CLOSED', 'REJECTED'].map((s) => (
          <Chip key={s} label={s.replace('_', ' ')} active={status === s} onPress={() => { setStatus(s); setPage(1); }} />
        ))}
      </View>

      {returns.isLoading && <LoadingView />}
      {returns.error && <ErrorView error={returns.error} retry={() => returns.refetch()} />}
      {!returns.isLoading && !returns.error && (
        items.length === 0 ? (
          <EmptyState icon="assignment-return" title="No returns" subtitle="Returns are opened against invoiced orders." />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(r: any) => r.id}
            renderItem={({ item }) => (
              <Pressable accessibilityRole="button" onPress={() => router.push(`/return/${item.id}`)}
                style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.returnNumber} · {item.customer.name}</Text>
                  <Text style={styles.meta}>
                    {item.salesOrder?.orderNumber} · {formatDate(item.createdAt)}
                    {item.refundAmount ? ` · refund ${formatMoney(item.refundAmount)}` : ''}
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

