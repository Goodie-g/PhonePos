/** Create transfer: source/destination + accessory quantities + device ids. */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/ui/screen';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Chip } from '@/components/ui/chip';
import { useToast } from '@/components/ui/feedback';
import { Spacing, Typography, type ThemeColors } from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';
import { useWarehouses } from '@/hooks/api/use-meta';
import { useProducts, useDevices, useBalances } from '@/hooks/api/use-catalogue';
import { useCreateTransfer } from '@/hooks/api/use-operations';
import { ApiClientError } from '@/lib/api/client';

export default function NewTransferScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();

  const warehouses = useWarehouses();
  const devices = useDevices({ status: 'AVAILABLE', pageSize: 100 });
  const createTransfer = useCreateTransfer();

  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [lines, setLines] = useState<{ variantId: string; sku: string; quantity: number }[]>([]);
  const [deviceIds, setDeviceIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Available accessory stock at the chosen source (for the quick-add list)
  const source = fromId ? warehouses.data?.data?.find((w: any) => w.id === fromId) : null;
  const balances = useBalances({ warehouseId: fromId ?? undefined, pageSize: 100 });
  const accessoryBalances = (balances.data?.data ?? []).filter((b: any) => b.variant.product.type === 'ACCESSORY' && b.available > 0);

  const submit = async () => {
    setError(null);
    if (!fromId || !toId) return setError('Choose source and destination warehouses');
    if (lines.length === 0 && deviceIds.length === 0) return setError('Add accessories and/or devices');
    try {
      const res = await createTransfer.mutateAsync({
        fromWarehouseId: fromId, toWarehouseId: toId,
        items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        deviceIds,
      });
      show('Transfer created — dispatch it, then receive it', 'success');
      router.replace(`/transfer/${(res as any).data.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to create transfer');
    }
  };

  return (
    <Screen title="New transfer" subtitle="Phase 1: create. Phase 2: dispatch. Phase 3: receive." back>
      <Card>
        <Text style={styles.label}>From</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {(warehouses.data?.data ?? []).map((w: any) => (
            <Chip key={w.id} label={w.name} active={fromId === w.id} onPress={() => setFromId(w.id)} />
          ))}
        </View>
        <Text style={styles.label}>To</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {(warehouses.data?.data ?? []).filter((w: any) => w.id !== fromId).map((w: any) => (
            <Chip key={w.id} label={w.name} active={toId === w.id} onPress={() => setToId(w.id)} />
          ))}
        </View>
      </Card>

      {source && (
        <Card>
          <Text style={styles.label}>Accessory stock at {source.name}</Text>
          {accessoryBalances.length === 0 ? (
            <Text style={styles.meta}>No accessory stock here.</Text>
          ) : (
            accessoryBalances.map((b: any) => (
              <View key={b.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{b.variant.sku}</Text>
                  <Text style={styles.meta}>{b.available} available</Text>
                </View>
                <View style={styles.stepRow}>
                  <Button text="−" size="sm" variant="secondary" onPress={() =>
                    setLines((prev) => prev.map((l) => (l.variantId === b.variantId ? { ...l, quantity: Math.max(1, l.quantity - 1) } : l)))} />
                  <Text style={styles.qty}>{lines.find((l) => l.variantId === b.variantId)?.quantity ?? 0}</Text>
                  <Button text="+" size="sm" onPress={() =>
                    setLines((prev) => prev.find((l) => l.variantId === b.variantId)
                      ? prev.map((l) => (l.variantId === b.variantId ? { ...l, quantity: Math.min(b.available, l.quantity + 1) } : l))
                      : [...prev, { variantId: b.variantId, sku: b.variant.sku, quantity: 1 }])} />
                </View>
              </View>
            ))
          )}
        </Card>
      )}

      <Card>
        <Text style={styles.label}>Devices to move ({deviceIds.length} selected)</Text>
        {(devices.data?.data ?? []).map((d: any) => (
          <View key={d.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{d.imei1}</Text>
              <Text style={styles.meta}>{d.variant.sku} · {d.warehouse.name}</Text>
            </View>
            <Chip
              label={deviceIds.includes(d.id) ? 'Selected' : 'Select'}
              active={deviceIds.includes(d.id)}
              onPress={() => setDeviceIds((prev) =>
                prev.includes(d.id) ? prev.filter((x) => x !== d.id) : [...prev, d.id])}
            />
          </View>
        ))}
      </Card>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button text={createTransfer.isPending ? 'Creating…' : 'Create transfer'} onPress={submit} disabled={createTransfer.isPending} />
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

