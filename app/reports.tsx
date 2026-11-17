/**
 * Reports — stock position, outstanding receivables, best sellers.
 * All aggregates are computed by the API (SQL), not in the browser.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native-gesture-handler';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { SectionHeader } from '@/components/ui/section-header';
import { ErrorView, LoadingView } from '@/components/ui/feedback';
import { ApiStatusBadge } from '@/components/ui/api-status-badge';
import { BorderRadius, Spacing, Typography, type ThemeColors } from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';
import { useStockReport, useOutstandingReport, useBestSellers } from '@/hooks/api/use-operations';
import { useWarehouseFilter } from '@/hooks/use-warehouse-filter';
import { formatMoney } from '@/lib/api/format';

export default function ReportsScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [tab, setTab] = useState<'stock' | 'outstanding' | 'sellers'>('stock');
  const { warehouseId, picker } = useWarehouseFilter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Reports</Text>
        <Text style={styles.subtitle}>Computed server-side from the stock ledger and invoices.</Text>
      </View>
      <View style={styles.tabs}>
        <Chip label="Stock" active={tab === 'stock'} onPress={() => setTab('stock')} />
        <Chip label="Outstanding" active={tab === 'outstanding'} onPress={() => setTab('outstanding')} />
        <Chip label="Best sellers" active={tab === 'sellers'} onPress={() => setTab('sellers')} />
      </View>
      {picker}

      {tab === 'stock' && <StockReport warehouseId={warehouseId} />}
      {tab === 'outstanding' && <OutstandingReport />}
      {tab === 'sellers' && <BestSellersReport />}
    </SafeAreaView>
  );
}

const StockReport = ({ warehouseId }: { warehouseId?: string }) => {
  const report = useStockReport(warehouseId);
  if (report.isLoading) return <LoadingView />;
  if (report.error) return <ErrorView error={report.error} retry={() => report.refetch()} />;
  const s = report.data!;
  return (
    <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 48 }}>
      <SectionHeader title="Summary" />
      <Card>
        <Text style={rStyles.big}>{formatMoney(s.summary.totalCostValue)} stock value (at cost)</Text>
        <Text style={rStyles.meta}>{s.summary.lowStockCount} item(s) at or below their low-stock threshold</Text>
      </Card>
      <SectionHeader title="Stock by warehouse" />
      {s.data.map((b: any) => (
        <Card key={b.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={rStyles.big}>{b.variant.sku}</Text>
              <Text style={rStyles.meta}>
                {b.variant.product.brand?.name} {b.variant.product.name} · {b.warehouse.name}
              </Text>
              <Text style={rStyles.meta}>
                {b.available} available · {b.reserved} reserved · {b.onHand} on hand
              </Text>
            </View>
            {b.isLow ? <ApiStatusBadge kind="warning" label="Low" /> : null}
          </View>
        </Card>
      ))}
    </ScrollView>
  );
};

const rStyles = {
  big: { fontSize: Typography.sizes.base, fontWeight: '600' as const, color: '#111827' as const },
  meta: { fontSize: Typography.sizes.xs, color: '#6B7280' as const, marginTop: 2 },
} as const;

const OutstandingReport = () => {
  const report = useOutstandingReport();
  if (report.isLoading) return <LoadingView />;
  if (report.error) return <ErrorView error={report.error} retry={() => report.refetch()} />;
  const rows = report.data.data;
  return (
    <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 48 }}>
      {rows.length === 0 ? (
        <Card><Text style={rStyles.meta}>No outstanding balances 🎉</Text></Card>
      ) : (
        rows.map((r: any) => (
          <Card key={r.customer.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={rStyles.big}>{r.customer.name}</Text>
              <Text style={rStyles.big}>{formatMoney(r.outstanding)}</Text>
            </View>
            <Text style={rStyles.meta}>
              {r.invoices} invoice(s) · overdue {formatMoney(r.overdue)}
            </Text>
          </Card>
        ))
      )}
    </ScrollView>
  );
};

const BestSellersReport = () => {
  const report = useBestSellers();
  if (report.isLoading) return <LoadingView />;
  if (report.error) return <ErrorView error={report.error} retry={() => report.refetch()} />;
  const rows = report.data.data;
  return (
    <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 48 }}>
      {rows.length === 0 ? (
        <Card><Text style={rStyles.meta}>No fulfilled sales yet.</Text></Card>
      ) : (
        rows.map((r: any, i: number) => (
          <Card key={r.variant.id}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <View><Text style={[rStyles.big, { fontSize: Typography.sizes.xl }]}>#{i + 1}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={rStyles.big}>{r.variant?.sku}</Text>
                <Text style={rStyles.meta}>
                  {r.variant?.product?.name} · {r.unitsSold} units · {formatMoney(r.revenue)}
                </Text>
              </View>
            </View>
          </Card>
        ))
      )}
    </ScrollView>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.backgroundSecondary },
    header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
    title: { fontSize: Typography.sizes['2xl'], fontWeight: Typography.weights.bold, color: colors.text },
    subtitle: { fontSize: Typography.sizes.xs, color: colors.textSecondary, marginTop: 2 },
    tabs: { flexDirection: 'row', gap: 6, paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  });



