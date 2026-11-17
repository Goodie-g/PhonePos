/** Create a return against a fulfilled/invoiced order. */
import { useLocalSearchParams, router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/ui/screen';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QuantityStepper } from '@/components/ui/quantity-stepper';
import { useToast } from '@/components/ui/feedback';
import { Spacing, Typography, type ThemeColors } from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';
import { useOrder } from '@/hooks/api/use-commerce';
import { useCreateReturn } from '@/hooks/api/use-operations';
import { useDevices } from '@/hooks/api/use-catalogue';
import { Chip } from '@/components/ui/chip';
import { ApiClientError } from '@/lib/api/client';

export default function NewReturnScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();

  const order = useOrder(orderId);
  const soldDevices = useDevices({ status: 'SOLD', pageSize: 100 });
  const createReturn = useCreateReturn();

  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<Record<string, number>>({}); // accessory orderItemId -> qty
  const [deviceIds, setDeviceIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (order.isLoading) return <Text style={{ padding: 24, color: colors.textSecondary }}>Loading order…</Text>;
  if (order.error) return <Text style={{ padding: 24, color: colors.danger }}>Order not found.</Text>;
  const o = order.data!.data;
  const orderDevices = (soldDevices.data?.data ?? []).filter(
    (d: any) => d.soldOrderItemId && o.items.some((i: any) => i.id === d.soldOrderItemId)
  );

  const submit = async () => {
    setError(null);
    if (!reason.trim() || reason.trim().length < 3) return setError('Describe the reason (min 3 chars)');
    const items = [
      ...Object.entries(lines).filter(([, q]) => q > 0).map(([orderItemId, quantity]) => ({ orderItemId, quantity })),
      ...orderDevices.filter((d: any) => deviceIds.includes(d.id)).map((d: any) => ({
        orderItemId: d.soldOrderItemId, quantity: 1, deviceId: d.id,
      })),
    ];
    if (items.length === 0) return setError('Select what is being returned');
    try {
      const res = await createReturn.mutateAsync({ salesOrderId: o.id, reason: reason.trim(), items });
      show('Return registered — goods are awaiting inspection', 'success');
      router.replace(`/return/${(res as any).data.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : (err as Error).message);
    }
  };

  return (
    <Screen title={`Return · ${o.orderNumber}`} subtitle="Phones become RETURNED — inspection restocks them" back>
      <Card>
        <Text style={styles.label}>Reason *</Text>
        <Input placeholder="e.g. Customer reports device faulty" value={reason} onChangeText={setReason} />
      </Card>

      {orderDevices.length > 0 && (
        <Card>
          <Text style={styles.label}>Phones sold on this order</Text>
          {orderDevices.map((d: any) => (
            <View key={d.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{d.imei1}</Text>
                <Text style={styles.meta}>{d.variant.sku}</Text>
              </View>
              <Chip
                label={deviceIds.includes(d.id) ? 'Returning' : 'Select'}
                active={deviceIds.includes(d.id)}
                onPress={() => setDeviceIds((prev) =>
                  prev.includes(d.id) ? prev.filter((x) => x !== d.id) : [...prev, d.id])}
              />
            </View>
          ))}
        </Card>
      )}

      <Card>
        <Text style={styles.label}>Accessories on this order</Text>
        {o.items.filter((i: any) => i.variant.product.type === 'ACCESSORY').map((i: any) => {
          const max = i.fulfilledQty;
          if (max <= 0) return null;
          const qty = lines[i.id] ?? 0;
          return (
            <View key={i.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{i.variant.sku}</Text>
                <Text style={styles.meta}>fulfilled {max}</Text>
              </View>
              <View style={styles.stepRow}>
                <Button text="−" size="sm" variant="secondary" onPress={() => setLines((p) => ({ ...p, [i.id]: Math.max(0, qty - 1) }))} />
                <Text style={styles.qty}>{qty}</Text>
                <Button text="+" size="sm" onPress={() => setLines((p) => ({ ...p, [i.id]: Math.min(max, qty + 1) }))} />
              </View>
            </View>
          );
        })}
        {o.items.every((i: any) => i.variant.product.type !== 'ACCESSORY') && (
          <Text style={styles.meta}>No accessories.</Text>
        )}
      </Card>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button text={createReturn.isPending ? 'Saving…' : 'Register return'} onPress={submit} disabled={createReturn.isPending} />
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    label: { fontSize: Typography.sizes.sm, fontWeight: Typography.weights.semibold, color: colors.textSecondary, marginVertical: 4 },
    meta: { fontSize: Typography.sizes.xs, color: colors.textSecondary },
    name: { fontSize: Typography.sizes.sm, fontWeight: Typography.weights.medium, color: colors.text },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.xs },
    stepRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    qty: { minWidth: 32, textAlign: 'center', fontWeight: Typography.weights.bold, color: colors.text },
    error: { color: colors.danger, fontSize: Typography.sizes.sm, marginBottom: 8 },
  });

