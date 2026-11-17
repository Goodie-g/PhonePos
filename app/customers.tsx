/** Customers list — search server-side; tap for statement. */
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FAB } from '@/components/ui/fab';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchBar } from '@/components/ui/search-bar';
import { ErrorView, LoadingView } from '@/components/ui/feedback';
import { ApiStatusBadge } from '@/components/ui/api-status-badge';
import { Button } from '@/components/ui/button';
import { BorderRadius, Spacing, Typography, type ThemeColors } from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';
import { formatMoney } from '@/lib/api/format';
import { useCustomers } from '@/hooks/api/use-commerce';

export default function CustomersScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const customers = useCustomers({ search: debounced || undefined, pageSize: 50 });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}><Text style={styles.title}>Customers</Text></View>
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search customers…" />
      {customers.isLoading && <LoadingView />}
      {customers.error && <ErrorView error={customers.error} retry={() => customers.refetch()} />}
      {!customers.isLoading && !customers.error && (
        (customers.data?.data ?? []).length === 0 ? (
          <EmptyState icon="store" title="No customers" subtitle="Add your first business customer." />
        ) : (
          <FlatList
            data={customers.data.data}
            keyExtractor={(c: any) => c.id}
            renderItem={({ item }) => (
              <Pressable accessibilityRole="button" onPress={() => router.push(`/customer/${item.id}`)}
                style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.meta}>
                    {item.code} · terms {item.paymentTermsDays}d · limit {formatMoney(item.creditLimit)}
                  </Text>
                </View>
                <ApiStatusBadge status={item.status} />
              </Pressable>
            )}
            contentContainerStyle={{ paddingBottom: Spacing['2xl'], paddingHorizontal: Spacing.lg }}
          />
        )
      )}
      <FAB onPress={() => router.push('/customer/new')} icon="add" />
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.backgroundSecondary },
    header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
    title: { fontSize: Typography.sizes['2xl'], fontWeight: Typography.weights.bold, color: colors.text },
    card: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background,
      borderWidth: 1, borderColor: colors.border, borderRadius: BorderRadius.lg,
      padding: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.md,
    },
    name: { fontSize: Typography.sizes.base, fontWeight: Typography.weights.semibold, color: colors.text },
    meta: { fontSize: Typography.sizes.xs, color: colors.textSecondary, marginTop: 2 },
  });
