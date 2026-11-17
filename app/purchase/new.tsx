/** Create purchase order — supplier + lines (variant, qty, unit cost). */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/ui/screen';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Chip } from '@/components/ui/chip';
import { QuantityStepper } from '@/components/ui/quantity-stepper';
import { useToast } from '@/components/ui/feedback';
import { Spacing, Typography, type ThemeColors } from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';
import { useSuppliers } from '@/hooks/api/use-meta';
import { useProducts } from '@/hooks/api/use-catalogue';
import { useCreatePurchaseOrder } from '@/hooks/api/use-operations';
import { ApiClientError } from '@/lib/api/client';
import { formatMoney } from '@/lib/api/format';

export default function NewPurchaseScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();

  const suppliers = useSuppliers();
  const createOrder = useCreatePurchaseOrder();
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [lines, setLines] = useState<{ variantId: string; sku: string; quantity: number; unitCost: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);
  const productQuery = useProducts({ search: debounced || undefined, pageSize: 10 });

  const addVariant = (v: any) => {
    setLines((prev) => {
      if (prev.find((l) => l.variantId === v.id)) return prev;
      return [...prev, { variantId: v.id, sku: v.sku, quantity: 1, unitCost: String(v.costPrice) }];
    });
    setSearch(''); setDebounced('');
  };

  const submit = async () => {
    setError(null);
    if (!supplierId) return setError('Choose a supplier');
    if (lines.length === 0) return setError('Add at least one line');
    const bad = lines.find((l) => !(Number(l.quantity) > 0) || !(Number(l.unitCost) >= 0));
    if (bad) return setError('Every line needs a quantity and cost price');
    try {
      const res = await createOrder.mutateAsync({
        supplierId,
        items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitCost: Number(l.unitCost) })),
      });
      show('PO created — submit it, then receive goods', 'success');
      router.replace(`/purchase/${(res as any).data.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to create PO');
    }
  };

  return (
    <Screen title="New purchase order" subtitle="Costs here become the defaults for received devices" back>
      <Card>
        <Text style={styles.label}>Supplier</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {(suppliers.data?.data ?? []).filter((s: any) => s.isActive).map((s: any) => (
            <Chip key={s.id} label={s.name} active={supplierId === s.id} onPress={() => setSupplierId(s.id)} />
          ))}
        </View>
      </Card>

      <Card>
        <Text style={styles.label}>Add variants</Text>
        <Input placeholder="Search SKU or name…" value={search} onChangeText={setSearch} />
        {(productQuery.data?.data ?? []).slice(0, 6).map((p: any) =>
          p.variants.map((v: any) => (
            <View key={v.id} style={styles.suggestRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.suggestName}>{v.sku}</Text>
                <Text style={styles.meta}>buying at {formatMoney(v.costPrice)}</Text>
              </View>
              <Button text="Add" size="sm" onPress={() => addVariant(v)} />
            </View>
          ))
        )}
      </Card>

      {lines.map((l, idx) => (
        <Card key={l.variantId}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, fontWeight: Typography.weights.semibold, color: colors.text }}>{l.sku}</Text>
            <Button text="Remove" size="sm" variant="danger" onPress={() => setLines((prev) => prev.filter((_, i) => i !== idx))} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
            <QuantityStepper
              value={l.quantity}
              onIncrement={() => setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, quantity: x.quantity + 1 } : x)))}
              onDecrement={() => setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x)))}
              decrementDisabled={l.quantity <= 1}
            />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Input placeholder="Unit cost (TZS)" keyboardType="numeric"
                value={l.unitCost}
                onChangeText={(v) => setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, unitCost: v } : x)))} />
            </View>
          </View>
        </Card>
      ))}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button text={createOrder.isPending ? 'Creating…' : 'Create PO (draft)'} onPress={submit} disabled={createOrder.isPending} />
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    label: {
      fontSize: Typography.sizes.sm, fontWeight: Typography.weights.semibold,
      color: colors.textSecondary, marginVertical: Spacing.xs,
    },
    meta: { fontSize: Typography.sizes.xs, color: colors.textSecondary },
    suggestRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.xs },
    suggestName: { fontSize: Typography.sizes.sm, fontWeight: Typography.weights.medium, color: colors.text },
    error: { color: colors.danger, fontSize: Typography.sizes.sm, marginBottom: 8 },
  });

