/**
 * Order builder — pick customer + warehouse, add variant lines.
 * The API computes prices (customer price tiers), never the client.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Chip } from '@/components/ui/chip';
import { QuantityStepper } from '@/components/ui/quantity-stepper';
import { useToast } from '@/components/ui/feedback';
import { Spacing, Typography, type ThemeColors } from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';
import { useCustomers } from '@/hooks/api/use-commerce';
import { useWarehouses } from '@/hooks/api/use-meta';
import { useProducts } from '@/hooks/api/use-catalogue';
import { useCreateOrder } from '@/hooks/api/use-commerce';
import { ApiClientError } from '@/lib/api/client';

export default function NewOrderScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();

  const customers = useCustomers({ pageSize: 50 });
  const warehouses = useWarehouses();
  const createOrder = useCreateOrder();

  const [customerId, setCustomerId] = useState<string | null>(null);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [lines, setLines] = useState<{ variantId: string; sku: string; name: string; type: string; quantity: number }[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const chooseWarehouseIfSingle = () => {
    if (!warehouseId && warehouses.data?.data?.length === 1) {
      return warehouses.data.data[0].id;
    }
    return warehouseId;
  };

  const productQuery = useProducts({ search: debounced || undefined, pageSize: 10 });

  const addVariant = (v: any) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.variantId === v.id);
      if (existing) return prev.map((l) => (l.variantId === v.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, {
        variantId: v.id, sku: v.sku, type: v.product?.type ?? 'ACCESSORY',
        name: `${v.product?.brand?.name ?? ''} ${v.product?.name ?? ''}`.trim(),
        quantity: 1,
      }];
    });
    setSearch('');
    setDebounced('');
  };

  const submit = async () => {
    setFormError(null);
    const wh = chooseWarehouseIfSingle();
    if (!customerId) return setFormError('Choose a customer');
    if (!wh) return setFormError('Choose a warehouse');
    if (lines.length === 0) return setFormError('Add at least one line');
    try {
      const res = await createOrder.mutateAsync({
        customerId, warehouseId: wh,
        items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      });
      const orderId = (res as any).data.id;
      show('Order created as draft — submit, then confirm to reserve stock', 'success');
      router.replace(`/order/${orderId}`);
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : (err as Error).message);
    }
  };

  return (
    <Screen title="New order" subtitle="Server resolves customer prices and totals" back>
      <Card>
        <Text style={styles.label}>Customer</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {(customers.data?.data ?? []).map((c: any) => (
            <Chip key={c.id} label={c.name} active={customerId === c.id} onPress={() => setCustomerId(c.id)} />
          ))}
        </View>

        <Text style={styles.label}>Warehouse</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {(warehouses.data?.data ?? []).map((w: any) => (
            <Chip key={w.id} label={`${w.name} (${w.code})`} active={warehouseId === w.id} onPress={() => setWarehouseId(w.id)} />
          ))}
        </View>
      </Card>

      <Card>
        <Text style={styles.label}>Add products</Text>
        <Input placeholder="Search SKU or name…" value={search} onChangeText={setSearch} />
        {(productQuery.data?.data ?? []).slice(0, 6).map((p: any) =>
          p.variants.map((v: any) => (
            <View key={v.id} style={styles.suggestRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.suggestName}>{v.sku}</Text>
                <Text style={styles.meta}>{p.brand?.name} {p.name}</Text>
              </View>
              <Button text="Add" size="sm" onPress={() => addVariant(v)} />
            </View>
          ))
        )}
      </Card>

      {lines.length > 0 && (
        <Card>
          <Text style={styles.label}>{lines.length} line(s)</Text>
          {lines.map((l) => (
            <View key={l.variantId} style={styles.lineRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.suggestName}>{l.sku}</Text>
                <Text style={styles.meta}>{l.name}</Text>
              </View>
              <QuantityStepper
                value={l.quantity}
                onIncrement={() => setLines((prev) => prev.map((x) => (x.variantId === l.variantId ? { ...x, quantity: x.quantity + 1 } : x)))}
                onDecrement={() =>
                  setLines((prev) =>
                    l.quantity <= 1
                      ? prev.filter((x) => x.variantId !== l.variantId)
                      : prev.map((x) => (x.variantId === l.variantId ? { ...x, quantity: x.quantity - 1 } : x))
                  )
                }
                decrementLabel={l.quantity <= 1 ? 'Remove line' : 'Decrease quantity'}
              />
            </View>
          ))}
        </Card>
      )}

      {formError ? <Text style={styles.error}>{formError}</Text> : null}
      <Button text={createOrder.isPending ? 'Creating…' : 'Create draft order'} onPress={submit} disabled={createOrder.isPending} />
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    label: {
      fontSize: Typography.sizes.sm,
      fontWeight: Typography.weights.semibold,
      color: colors.textSecondary,
      marginVertical: Spacing.xs,
    },
    meta: { fontSize: Typography.sizes.xs, color: colors.textSecondary },
    suggestRow: {
      flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.xs,
    },
    suggestName: { fontSize: Typography.sizes.sm, fontWeight: Typography.weights.medium, color: colors.text },
    lineRow: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xs,
    },
    error: { color: colors.danger, fontSize: Typography.sizes.sm, marginBottom: 8 },
  });

