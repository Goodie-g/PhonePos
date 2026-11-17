/** Devices (IMEI) — search by IMEI, filter by status; mark RECEIVED units available. */
import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchBar } from '@/components/ui/search-bar';
import { LoadingView, ErrorView, useToast } from '@/components/ui/feedback';
import { ApiStatusBadge } from '@/components/ui/api-status-badge';
import { Button } from '@/components/ui/button';
import { useMarkAvailable } from '@/hooks/api/use-catalogue';
import { BorderRadius, Spacing, Typography, type ThemeColors } from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';
import { useDevices } from '@/hooks/api/use-catalogue';

const STATUSES = ['AVAILABLE', 'RESERVED', 'SOLD', 'RECEIVED', 'RETURNED', 'IN_TRANSIT', 'QUARANTINED'];

export default function DevicesScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const [imei, setImei] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const markAvailable = useMarkAvailable();

  React.useEffect(() => {
    const t = setTimeout(() => { setDebounced(imei.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [imei]);

  const devices = useDevices({
    imei: debounced || undefined,
    status: status ?? undefined,
    page, pageSize: 20,
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Devices</Text>
        <Text style={styles.subtitle}>Every physical handset is unique by IMEI.</Text>
      </View>
      <SearchBar value={imei} onChangeText={setImei} placeholder="Search IMEI…" keyboardType="numeric" />
      <View style={styles.chips}>
        <Chip label="All" active={status === null} onPress={() => { setStatus(null); setPage(1); }} />
        {STATUSES.map((s) => (
          <Chip key={s} label={s.replace('_', ' ')} active={status === s} onPress={() => { setStatus(s); setPage(1); }} />
        ))}
      </View>

      {devices.isLoading && <LoadingView />}
      {devices.error && <ErrorView error={devices.error} retry={() => devices.refetch()} />}
      {!devices.isLoading && !devices.error && (
        (devices.data?.data ?? []).length === 0 ? (
          <EmptyState icon="qr-code" title="No devices" subtitle="Devices are registered when you receive phone stock." />
        ) : (
          <FlatList
            data={devices.data.data}
            keyExtractor={(d: any) => d.id}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.imei1}{item.imei2 ? ` / ${item.imei2}` : ''}</Text>
                  <Text style={styles.meta}>
                    {item.variant.product.brand?.name} {item.variant.product.name} · {item.variant.sku}
                  </Text>
                  <Text style={styles.meta}>
                    {item.warehouse.name} · cost {item.acquisitionCost ? String(item.acquisitionCost).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '—'} TZS
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <ApiStatusBadge status={item.status} />
                  {item.status === 'RECEIVED' && (
                    <Button
                      text="Mark available" size="sm"
                      onPress={() => markAvailable.mutate(item.id, { onSuccess: () => show('Device now available', 'success'), onError: (e: any) => show(e.message, 'error') })}
                    />
                  )}
                </View>
              </View>
            )}
            ListFooterComponent={
              <View style={styles.pager}>
                <Button text="‹ Prev" size="sm" variant="secondary" disabled={page <= 1} onPress={() => setPage(page - 1)} />
                <Text style={[styles.pageText, { color: colors.textSecondary }]}>{page}</Text>
                <Button text="Next ›" size="sm" variant="secondary" disabled={page >= Math.ceil((devices.data?.total ?? 0) / 20)} onPress={() => setPage(page + 1)} />
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

