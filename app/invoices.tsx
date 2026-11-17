/**
 * Invoices list — filter by status / overdue; shows outstanding amounts.
 */
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
import { useInvoices } from '@/hooks/api/use-commerce';

export default function InvoicesScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [status, setStatus] = useState<string | null>(null);
  const [overdue, setOverdue] = useState(false);
  const [page, setPage] = useState(1);

  const invoices = useInvoices({ status: status ?? undefined, overdue: overdue || undefined, page, pageSize: 15 });
  const items = invoices.data?.data ?? [];
  const pageCount = Math.max(1, Math.ceil((invoices.data?.total ?? 0) / 15));

  return (
    <SafeAreaView style={styles.container}>
        <View style={styles.header}><Text style={styles.title}>Invoices</Text></View>
        <View style={styles.chips}>
          <Chip label="All" active={status === null && !overdue} onPress={() => { setStatus(null); setOverdue(false); setPage(1); }} />
          <Chip label="Overdue" active={overdue} onPress={() => { setOverdue(true); setPage(1); }} />
          {['ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID'].map((s) => (
            <Chip key={s} label={s === 'PARTIALLY_PAID' ? 'Part-paid' : s.charAt(0) + s.slice(1).toLowerCase()} active={status === s} onPress={() => { setStatus(s); setPage(1); }} />
          ))}
        </View>

        {invoices.isLoading && <LoadingView />}
        {invoices.error && <ErrorView error={invoices.error} retry={() => invoices.refetch()} />}

        {!invoices.isLoading && !invoices.error && (
          items.length === 0 ? (
            <EmptyState icon="receipt-long" title="No invoices" subtitle="Invoices are generated from fully fulfilled orders." />
          ) : (
            <FlatList
              data={items}
              keyExtractor={(i: any) => i.id}
              renderItem={({ item }) => (
                <Pressable accessibilityRole="button" onPress={() => router.push(`/invoice/${item.id}`)}
                  style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>{item.invoiceNumber} · {item.customer.name}</Text>
                    <Text style={styles.meta}>
                      Total {formatMoney(item.total)} · Paid {formatMoney(item.amountPaid)}
                    </Text>
                    {item.dueAt ? <Text style={styles.meta}>Due {formatDate(item.dueAt)}</Text> : null}
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
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background,
      borderWidth: 1, borderColor: colors.border, borderRadius: BorderRadius.lg,
      padding: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.md,
    },
    name: { fontSize: Typography.sizes.base, fontWeight: Typography.weights.semibold, color: colors.text },
    meta: { fontSize: Typography.sizes.xs, color: colors.textSecondary, marginTop: 2 },
    pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.md, marginTop: Spacing.sm },
    pageText: { fontSize: Typography.sizes.sm },
  });

