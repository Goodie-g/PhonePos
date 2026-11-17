/** Transfer detail: dispatch (stock leaves source) and receive (arrives at dest). */
import { useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { Button } from '@/components/ui/button';
import { ApiStatusBadge } from '@/components/ui/api-status-badge';
import { ErrorView, LoadingView, useToast, useConfirm } from '@/components/ui/feedback';
import { Spacing, Typography, type ThemeColors } from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';
import { formatDateTime } from '@/lib/api/format';
import { useTransfer, useTransferAction, useReceiveTransfer } from '@/hooks/api/use-operations';

export default function TransferDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const confirmUi = useConfirm();

  const transfer = useTransfer(id);
  const dispatch = useTransferAction(id, 'dispatch');
  const cancelT = useTransferAction(id, 'cancel');
  const receiveTransfer = useReceiveTransfer(id);
  const [error, setError] = useState<string | null>(null);

  if (transfer.isLoading) return <LoadingView message="Loading transfer…" />;
  if (transfer.error) return <ErrorView error={transfer.error} retry={() => transfer.refetch()} />;
  const t = transfer.data!.data;
  const outstandingItems = (t.items ?? []).filter((i: any) => i.receivedQty < i.quantity);
  const outstandingDevices = (t.devices ?? []).filter((d: any) => d.receivedAt === null);

  const run = async (mut: any, ok: boolean, successText: string) => {
    if (!ok) return;
    setError(null);
    try {
      await mut.mutateAsync();
      show(successText, 'success');
      transfer.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    }
  };

  return (
    <Screen title={t.transferNumber} subtitle={`${t.fromWarehouse.name} → ${t.toWarehouse.name}`} back>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <ApiStatusBadge status={t.status} />
          {t.dispatchedAt ? <Text style={styles.meta}>Dispatched {formatDateTime(t.dispatchedAt)}</Text> : null}
        </View>
      </Card>

      <SectionHeader title="Accessory lines" />
      {(t.items ?? []).length === 0 && <Card><Text style={styles.meta}>No accessory lines.</Text></Card>}
      {(t.items ?? []).map((i: any) => (
        <Card key={i.id}>
          <Text style={styles.name}>{i.variant.sku}</Text>
          <Text style={styles.meta}>{i.receivedQty} / {i.quantity} received</Text>
        </Card>
      ))}

      <SectionHeader title="Devices" />
      {(t.devices ?? []).length === 0 && <Card><Text style={styles.meta}>No devices on this transfer.</Text></Card>}
      {(t.devices ?? []).map((d: any) => (
        <Card key={d.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[styles.name, { flex: 1 }]}>{d.device.imei1}</Text>
            <ApiStatusBadge status={d.receivedAt ? 'AVAILABLE' : 'IN_TRANSIT'} label={d.receivedAt ? 'Received' : 'In transit'} />
          </View>
        </Card>
      ))}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.actions}>
        {t.status === 'DRAFT' && (
          <Button text="Dispatch (stock leaves source)" onPress={() =>
            confirmUi({
              title: 'Dispatch transfer?',
              message: 'Accessories and devices leave the source warehouse now. They are IN TRANSIT until received.',
              actionLabel: 'Dispatch',
            }).then((ok) => run(dispatch, ok, 'Dispatched — stock is now in transit'))} />
        )}
        {['DISPATCHED', 'PARTIALLY_RECEIVED'].includes(t.status) && (outstandingItems.length > 0 || outstandingDevices.length > 0) && (
          <Button text={`Receive everything (${outstandingItems.length} lines, ${outstandingDevices.length} devices)`} onPress={() =>
            confirmUi({
              title: 'Receive everything?',
              message: ' Confirms all outstanding accessories and in-transit devices into the destination warehouse.',
              actionLabel: 'Receive all',
            }).then((ok) => {
              if (ok) run(receiveTransfer, true, 'Receipt recorded');
            })} />
        )}
        {t.status === 'RECEIVED' && <Text style={styles.done}>All goods received ✓</Text>}
        {['DRAFT', 'DISPATCHED', 'PARTIALLY_RECEIVED'].includes(t.status) && (
          <Button text="Cancel transfer" variant="danger" onPress={() =>
            confirmUi({
              title: 'Cancel transfer?',
              message: 'Un-received goods return to the source warehouse and are recorded in the ledger.',
              actionLabel: 'Cancel transfer',
              danger: true,
            }).then((ok) => run(cancelT, ok, 'Transfer cancelled'))} />
        )}
      </View>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    meta: { fontSize: Typography.sizes.xs, color: colors.textSecondary, marginTop: 2 },
    name: { fontSize: Typography.sizes.sm, fontWeight: Typography.weights.medium, color: colors.text },
    error: { color: colors.danger, fontSize: Typography.sizes.sm, padding: Spacing.md },
    done: { color: colors.success, fontWeight: Typography.weights.semibold, textAlign: 'center', padding: Spacing.md },
    actions: { marginTop: Spacing.lg, gap: Spacing.sm },
  });

