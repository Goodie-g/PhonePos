/**
 * Inventory — product catalogue list, server-side search/filter/sort/pagination.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { FAB } from '@/components/ui/fab';
import { SearchBar } from '@/components/ui/search-bar';
import { ErrorView, LoadingView } from '@/components/ui/feedback';
import { ApiStatusBadge } from '@/components/ui/api-status-badge';
import { Button } from '@/components/ui/button';
import {
  BorderRadius, Spacing, Typography, type ThemeColors,
} from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';
import { formatMoney, variantSpec } from '@/lib/api/format';
import { useProducts } from '@/hooks/api/use-catalogue';

const STATUS_FILTERS = [null, 'PHONE', 'ACCESSORY'] as const;
const TYPE_LABELS: Record<string, string> = { PHONE: 'Phones', ACCESSORY: 'Accessories' };

export default function InventoryScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [search, setSearch] = React.useState('');
  const [debounced, setDebounced] = useState('');
  const [type, setType] = useState<string | null>(null);
  const [sort, setSort] = useState('name');
  const [page, setPage] = useState(1);

  React.useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const products = useProducts({
    search: debounced || undefined,
    type: type ?? undefined,
    sort,
    page,
    pageSize: 15,
  });

  const items = products.data?.data ?? [];
  const total = products.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 15));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Catalogue</Text>
        <Text style={styles.subtitle}>{total} products</Text>
      </View>
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search name or SKU…" />
      <View style={styles.chips}>
        {STATUS_FILTERS.map((t) => (
          <Chip
            key={t ?? 'all'}
            label={t ? TYPE_LABELS[t] : 'All'}
            active={type === t}
            onPress={() => { setType(t); setPage(1); }}
          />
        ))}
        <Chip label="Name A→Z" active={sort === 'name'} onPress={() => setSort('name')} />
        <Chip label="Price ↓" active={sort === '-name'} onPress={() => setSort('-name')} />
      </View>

      {products.isLoading && <LoadingView />}
      {products.error && <ErrorView error={products.error} retry={() => products.refetch()} />}

      {!products.isLoading && !products.error && (
        items.length === 0 ? (
          <EmptyState
            icon="inventory"
            title={debounced ? 'No matches' : 'No products yet'}
            subtitle={debounced ? 'Try a different search.' : 'Add your first product or brand to get started.'}
          />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(p: any) => p.id}
            renderItem={({ item }) => <ProductRow product={item} onPress={() => router.push(`/product/${item.id}`)} />}
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

      <FAB onPress={() => router.push('/product/new')} icon="add" />
    </SafeAreaView>
  );
}

const ProductRow: React.FC<{ product: any; onPress: () => void }> = ({ product, onPress }) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const stock = product.variants?.reduce((s: number, v: any) => s + (v.stock?.available ?? 0), 0);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {product.brand?.name} {product.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {product.variants?.map((v: any) => v.sku).join(', ')}
        </Text>
        <Text style={styles.meta}>
          {variantSpec(product.variants?.[0] ?? {})} · {product.variants?.length} variant(s)
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.price}>
          {product.variants?.length ? formatMoney(product.variants[0].sellPrice) : '—'}
        </Text>
        {product.status === 'DISCONTINUED' && <ApiStatusBadge status="DISCONTINUED" />}
      </View>
    </Pressable>
  );
};

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
    right: { alignItems: 'flex-end', gap: Spacing.xs },
    price: { fontSize: Typography.sizes.sm, fontWeight: Typography.weights.bold, color: colors.primary },
    pager: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.md,
      marginTop: Spacing.sm,
    },
    pageText: { fontSize: Typography.sizes.sm },
  });

