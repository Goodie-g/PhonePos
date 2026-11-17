/**
 * Product detail — variants, per-warehouse stock, inline add-variant form.
 */
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { Screen } from '@/components/ui/screen';
import { ApiStatusBadge } from '@/components/ui/api-status-badge';
import { ErrorView, LoadingView, useToast } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BorderRadius, Spacing, Typography, type ThemeColors } from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';
import { formatMoney, variantSpec } from '@/lib/api/format';
import { apiFetch } from '@/lib/api/client';
import { useProduct, useCreateVariant } from '@/hooks/api/use-catalogue';
import { ApiClientError } from '@/lib/api/client';

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const query = useProduct(id);
  const createVariant = useCreateVariant(id as string);

  const balances = useQuery({
    queryKey: ['inventory', 'balances', { pageSize: 200 }],
    queryFn: () => apiFetch('/api/inventory/balances?pageSize=200'),
    enabled: Boolean(id),
  });

  const [adding, setAdding] = useState(false);
  const [variantForm, setVariantForm] = React.useState({
    sku: '', storageGb: '', ramGb: '', color: '', costPrice: '', sellPrice: '',
  });
  const [formError, setFormError] = useState<string | null>(null);

  if (query.isLoading) return <Text style={styles.padded}>Loading…</Text>;
  if (query.error) return <ErrorView error={query.error} retry={() => query.refetch()} />;
  const p = query.data!.data;
  const balancesData = (balances.data?.data ?? []) as any[];
  const productBalances = balancesData.filter((b) => p.variants.some((v: any) => v.id === b.variantId));

  const submitVariant = async () => {
    setFormError(null);
    try {
      await createVariant.mutateAsync({
        sku: variantForm.sku.trim(),
        storageGb: variantForm.storageGb ? Number(variantForm.storageGb) : undefined,
        ramGb: variantForm.ramGb ? Number(variantForm.ramGb) : undefined,
        color: variantForm.color || undefined,
        costPrice: Number(variantForm.costPrice || 0),
        sellPrice: Number(variantForm.sellPrice || 0),
      });
      show('Variant created', 'success');
      setVariantForm({ sku: '', storageGb: '', ramGb: '', color: '', costPrice: '', sellPrice: '' });
      setAdding(false);
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'Failed to create variant');
    }
  };

  return (
    <Screen title={`${(p.brand?.name ?? '') + ' ' + p.name}`.trim()} subtitle={p.description ?? undefined} back>
      <Card>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <ApiStatusBadge status={p.status === 'ACTIVE' ? 'ACTIVE' : 'CANCELLED'} label={p.status === 'ACTIVE' ? undefined : 'Discontinued'} />
          <Text style={styles.meta}>{p.type === 'PHONE' ? 'IMEI-tracked phones' : 'Quantity-tracked accessories'}</Text>
        </View>
      </Card>

      <SectionHeader title="Variants" />
      {p.variants.map((v: any) => {
        const forVariant = productBalances.filter((b) => b.variantId === v.id);
        const available = forVariant.reduce((s, b) => s + b.available, 0);
        return (
          <Card key={v.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.variantName}>{v.sku}</Text>
                <Text style={styles.meta}>{variantSpec(v) || '—'}</Text>
                <Text style={styles.meta}>
                  Cost {formatMoney(v.costPrice)} · Sell {formatMoney(v.sellPrice)}
                </Text>
              </View>
              <Text style={styles.stock}>{available} available</Text>
            </View>
          </Card>
        );
      })}

      {adding ? (
        <Card>
          <Text style={styles.variantName}>New variant</Text>
          <Input placeholder="SKU (e.g. A15-256-RED)" value={variantForm.sku} onChangeText={(v) => setVariantForm((f) => ({ ...f, sku: v }))} />
          <Input placeholder="Storage GB (phones)" keyboardType="numeric" value={variantForm.storageGb} onChangeText={(v) => setVariantForm((f) => ({ ...f, storageGb: v }))} />
          <Input placeholder="RAM GB (phones)" keyboardType="numeric" value={variantForm.ramGb} onChangeText={(v) => setVariantForm((f) => ({ ...f, ramGb: v }))} />
          <Input placeholder="Colour" value={variantForm.color} onChangeText={(v) => setVariantForm((f) => ({ ...f, color: v }))} />
          <Input placeholder="Cost price (TZS)" keyboardType="numeric" value={variantForm.costPrice} onChangeText={(v) => setVariantForm((f) => ({ ...f, costPrice: v }))} />
          <Input placeholder="Sell price (TZS)" keyboardType="numeric" value={variantForm.sellPrice} onChangeText={(v) => setVariantForm((f) => ({ ...f, sellPrice: v }))} />
          {formError ? <Text style={styles.error}>{formError}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={styles.half}><Button text="Cancel" variant="secondary" onPress={() => setAdding(false)} /></View>
            <View style={styles.half}><Button text="Save" onPress={submitVariant} disabled={createVariant.isPending} /></View>
          </View>
        </Card>
      ) : (
        <View style={{ marginTop: Spacing.md }}>
          <Button text="Add variant" variant="secondary" onPress={() => setAdding(true)} />
        </View>
      )}
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    padded: { padding: Spacing.xl, color: colors.textSecondary },
    meta: { fontSize: Typography.sizes.xs, color: colors.textSecondary, marginTop: 2 },
    variantName: { fontSize: Typography.sizes.base, fontWeight: Typography.weights.semibold, color: colors.text },
    stock: { fontSize: Typography.sizes.base, fontWeight: Typography.weights.bold, color: colors.success },
    error: { color: colors.danger, fontSize: Typography.sizes.xs, marginBottom: 8 },
    half: { flex: 1 },
  });
