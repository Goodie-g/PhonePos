/**
 * Purchase order detail — status actions + goods receiving.
 * Accessories: receive by quantity. Phones: one row per device, IMEI required.
 * All receiving is atomic server-side; a failed line rolls everything back.
 */
import { useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { ApiStatusBadge } from '@/components/ui/api-status-badge';
import { ErrorView, LoadingView, useToast, useConfirm } from '@/components/ui/feedback';
import { Spacing, Typography, type ThemeColors } from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';
import { formatDateTime, formatMoney } from '@/lib/api/format';
import { usePurchase, usePurchaseAction, useReceiveGoods } from '@/hooks/api/use-operations';
import { useWarehouses } from '@/hooks/api/use-meta';

export default function PurchaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const confirmUi = useConfirm();

  const poQuery = usePurchase(id);
  const warehouses = useWarehouses();
  const submitPo = usePurchaseAction(id, 'submit');
  const cancelPo = usePurchaseAction(id, 'cancel');
  const receive = useReceiveGoods(id);

  const [formError, setFormError] = useState<string | null>(null);
  const [deviceRows, setDeviceRows] = useState<{ poItemId: string; imei1: string; imei2: string; serial: string; key: string }[]>([]);
  const [accessoryQty, setAccessoryQty] = useState<Record<string, string>>({});

  if (poQuery.isLoading) return <LoadingView message="Loading PO…" />;
  if (poQuery.error) return <ErrorView error={poQuery.error} retry={() => poQuery.refetch()} />;
  const po = poQuery.data!.data;

  const warehouseId = warehouses.data?.data?.[0]?.id;
  const receivable = ['SUBMITTED', 'PARTIALLY_RECEIVED'].includes(po.status);
  const accessoryItems = po.items.filter((i: any) => i.variant.product.type === 'ACCESSORY');
  const phoneItems = po.items.filter((i: any) => i.variant.product.type === 'PHONE');

  const doAction = async (mut: any, successText: string) => {
    setFormError(null);
    try {
      await mut.mutateAsync();
      show(successText, 'success');
      poQuery.refetch();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Action failed');
    }
  };

  let rowSeq = 0;
  const addDeviceRows = (poItem: any, count: number) => {
    setDeviceRows((prev) => [
      ...prev,
      ...Array.from({ length: count }, () => {
        const key = `row-${++rowSeq}-${Date.now()}`;
        return { poItemId: poItem.id, imei1: '', imei2: '', serial: '', key };
      }),
    ]);
  };

  const updateRow = (key: string, patch: Partial<{ imei1: string; imei2: string; serial: string }>) =>
    setDeviceRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const receiveGoods = async () => {
    setFormError(null);
    if (!warehouseId) {
      setFormError('No warehouse available — create one first');
      return;
    }
    const lines: { purchaseOrderItemId: string; quantity: number }[] = [];
    for (const item of accessoryItems as any[]) {
      const q = Number(accessoryQty[item.id] ?? 0);
      if (q > 0) lines.push({ purchaseOrderItemId: item.id, quantity: q });
    }
    const devices = deviceRows
      .filter((r) => r.imei1.trim().length > 0)
      .map((r) => ({
        purchaseOrderItemId: r.poItemId,
        imei1: r.imei1.trim(),
        imei2: r.imei2.trim() || undefined,
        serialNumber: r.serial.trim() || undefined,
      }));
    if (lines.length === 0 && devices.length === 0) {
      setFormError('Nothing entered — enter quantities and/or IMEIs first');
      return;
    }
    const ok = await confirmUi({
      title: 'Receive goods?',
      message: `Receiving ${lines.reduce((s, l) => s + l.quantity, 0)} accessory units and ${devices.length} device(s). IMEIs must be unique — duplicates are rejected.`,
      actionLabel: 'Receive',
    });
    if (!ok) return;
    try {
      const res: any = await receive.mutateAsync({
        warehouseId, items: lines, devices, note: undefined,
      });
      show(`Received — PO is now ${res.data.status}`, 'success');
      setDeviceRows([]);
      setAccessoryQty({});
      poQuery.refetch();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Receiving failed');
    }
  };

  return (
    <Screen title={po.poNumber} subtitle={`${po.supplier.name} · ${formatDateTime(po.createdAt)}`} back>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <ApiStatusBadge status={po.status} />
          <Text style={styles.total}>
            {formatMoney((po.items ?? []).reduce((s: number, i: any) => s + Number(i.quantity) * Number(i.unitCost), 0))}
          </Text>
        </View>
      </Card>

      <SectionHeader title="Lines" />
      {po.items.map((item: any) => (
        <Card key={item.id}>
          <Text style={styles.lineName}>{item.variant.sku}</Text>
          <Text style={styles.meta}>
            {item.variant.product.brand?.name} {item.variant.product.name} · {item.variant.product.type}
          </Text>
          <Text style={styles.meta}>
            {item.receivedQty} / {item.quantity} received · {formatMoney(item.unitCost)} each
          </Text>
        </Card>
      ))}

      {receivable && (
        <>
          <SectionHeader title="Receive goods" />
          <Card>
            <Text style={[styles.meta, { marginBottom: 8 }]}>
              Receiving into: {warehouses.data?.data?.[0]?.name ?? '…'}
            </Text>

            {accessoryItems.map((item: any) => {
              const outstanding = item.quantity - item.receivedQty;
              if (outstanding <= 0) return null;
              return (
                <View key={item.id} style={{ marginBottom: 8 }}>
                  <Text style={styles.lineName}>{item.variant.sku} (outstanding {outstanding})</Text>
                  <Input placeholder={`Quantity (max ${outstanding})`} keyboardType="numeric"
                    value={accessoryQty[item.id] ?? ''}
                    onChangeText={(v) => setAccessoryQty((prev) => ({ ...prev, [item.id]: v.replace(/\D/g, '') }))} />
                </View>
              );
            })}

            {phoneItems.map((item: any) => {
              const outstanding = item.quantity - item.receivedQty;
              if (outstanding <= 0) return null;
              const rows = deviceRows.filter((r) => r.poItemId === item.id);
              return (
                <View key={item.id} style={{ marginBottom: 12 }}>
                  <Text style={styles.lineName}>
                    {item.variant.sku} — {rows.length}/{outstanding} device rows
                  </Text>
                  {rows.map((row) => (
                    <View key={row.key}>
                      <Input placeholder="IMEI (15 digits) *" keyboardType="numeric"
                        value={row.imei1}
                        onChangeText={(v) => updateRow(row.key, { imei1: v.replace(/\D/g, '').slice(0, 15) })} />
                    </View>
                  ))}
                  <View style={{ marginVertical: 6 }}>
                    <Button
                      text="Add device row"
                      size="sm" variant="secondary"
                      onPress={() => addDeviceRows(item, 1)}
                    />
                  </View>
                </View>
              );
            })}
          </Card>

          {formError ? <Text style={styles.error}>{formError}</Text> : null}
          <Button text="Receive goods" onPress={receiveGoods} disabled={receive.isPending} />
        </>
      )}

      <View style={styles.actions}>
        {po.status === 'DRAFT' && (
          <Button text="Submit to supplier" onPress={() => doAction(submitPo, 'PO submitted')} />
        )}
        {['DRAFT', 'SUBMITTED'].includes(po.status) && (
          <Button
            text="Cancel PO" variant="danger"
            onPress={() => confirmUi({ title: 'Cancel this PO?', danger: true, actionLabel: 'Cancel PO' })
              .then((ok) => { if (ok) doAction(cancelPo, 'PO cancelled'); })}
          />
        )}
      </View>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    total: { fontSize: Typography.sizes.base, fontWeight: Typography.weights.bold, color: colors.text },
    meta: { fontSize: Typography.sizes.xs, color: colors.textSecondary, marginTop: 2 },
    lineName: { fontSize: Typography.sizes.sm, fontWeight: Typography.weights.semibold, color: colors.text },
    error: { color: colors.danger, fontSize: Typography.sizes.sm, marginTop: 8 },
    actions: { marginTop: Spacing.lg, gap: Spacing.sm },
  });

