/** Return detail — inspection outcomes (RESTOCK/QUARANTINE) + refund recording. */
import { useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiStatusBadge } from '@/components/ui/api-status-badge';
import { ErrorView, LoadingView, useToast, useConfirm } from '@/components/ui/feedback';
import { Spacing, Typography, type ThemeColors } from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';
import { formatDateTime, formatMoney } from '@/lib/api/format';
import { useReturn, useInspectReturn, useRefundReturn } from '@/hooks/api/use-operations';

export default function ReturnDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const confirmUi = useConfirm();

  const query = useReturn(id);
  const inspect = useInspectReturn(id);
  const refund = useRefundReturn(id);

  const [refundAmount, setRefundAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (query.isLoading) return <LoadingView message="Loading return…" />;
  if (query.error) return <ErrorView error={query.error} retry={() => query.refetch()} />;
  const r = query.data!.data;
  const pendingItems = r.items.filter((i: any) => i.inspectionOutcome === 'PENDING');

  const inspectItem = (itemId: string, outcome: 'RESTOCK' | 'QUARANTINE') => async () => {
    setError(null);
    try {
      await inspect.mutateAsync({ items: [{ returnItemId: itemId, outcome }] });
      show(outcome === 'RESTOCK' ? 'Restocked — now sellable' : 'Quarantined — kept out of stock', 'success');
      query.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Inspection failed');
    }
  };

  const recordRefund = async () => {
    setError(null);
    const amount = Number(refundAmount);
    if (!(amount > 0)) return setError('Enter a positive refund amount');
    const ok = await confirmUi({
      title: 'Record refund?',
      message: `${formatMoney(amount)} will be recorded (bookkeeping record — no payment processing happens here).`,
      actionLabel: 'Record refund',
    });
    if (!ok) return;
    try {
      await refund.mutateAsync({ amount });
      show('Refund recorded', 'success');
      setRefundAmount('');
      query.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refund failed');
    }
  };

  return (
    <Screen title={r.returnNumber} subtitle={`${r.customer.name} · ${formatDateTime(r.createdAt)}`} back>
      <Card>
        <ApiStatusBadge status={r.status} />
        <Text style={[styles.meta, { marginTop: 6 }]}>Reason: {r.reason}</Text>
        <Text style={styles.meta}>Order {r.salesOrder.orderNumber}</Text>
        {r.refundAmount ? <Text style={styles.refund}>Refunded {formatMoney(r.refundAmount)}</Text> : null}
      </Card>

      <SectionHeader title="Items" />
      {r.items.map((item: any) => (
        <Card key={item.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>
                {item.device ? item.device.imei1 : `${item.quantity} × ${item.orderItem.variant.sku}`}
              </Text>
              <Text style={styles.meta}>
                {item.inspectionOutcome === 'PENDING' ? 'Awaiting inspection' : item.inspectionOutcome}
              </Text>
            </View>
            {item.inspectionOutcome === 'PENDING' ? (
              <View style={{ gap: 6 }}>
                <Button text="Restock" size="sm" onPress={inspectItem(item.id, 'RESTOCK')} disabled={inspect.isPending} />
                <Button text="Quarantine" size="sm" variant="danger" onPress={inspectItem(item.id, 'QUARANTINE')} disabled={inspect.isPending} />
              </View>
            ) : (
              <ApiStatusBadge
                status={item.inspectionOutcome === 'RESTOCK' ? 'AVAILABLE' : 'QUARANTINED'}
                label={item.inspectionOutcome}
              />
            )}
          </View>
        </Card>
      ))}

      {r.status !== 'CLOSED' && !r.refundAmount && (
        <>
          <SectionHeader title="Refund" />
          <Card>
            <Input placeholder="Refund amount (TZS)" keyboardType="numeric" value={refundAmount} onChangeText={setRefundAmount} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button text={refund.isPending ? 'Saving…' : 'Record refund'} onPress={recordRefund} disabled={refund.isPending} />
          </Card>
        </>
      )}
      {error && r.refundAmount ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    meta: { fontSize: Typography.sizes.xs, color: colors.textSecondary, marginTop: 2 },
    name: { fontSize: Typography.sizes.sm, fontWeight: Typography.weights.medium, color: colors.text },
    refund: { color: colors.success, fontSize: Typography.sizes.sm, fontWeight: Typography.weights.semibold, marginTop: 4 },
    error: { color: colors.danger, fontSize: Typography.sizes.xs, marginBottom: 8 },
  });
