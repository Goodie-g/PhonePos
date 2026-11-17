/**
 * Invoice detail — payments history + record-payment form (idempotent via
 * Idempotency-Key header), outstanding balance shown everywhere.
 */
import { useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Chip } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { ApiStatusBadge } from '@/components/ui/api-status-badge';
import { ErrorView, LoadingView, useToast, useConfirm } from '@/components/ui/feedback';
import { Spacing, Typography, type ThemeColors } from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';
import { formatDate, formatDateTime, formatMoney } from '@/lib/api/format';
import { useInvoice, useRecordPayment } from '@/hooks/api/use-commerce';

const METHODS = ['CASH', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CARD', 'OTHER'];

function validateTzsAmount(value: string, outstanding: number): number | null {
  const n = Number(value);
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  if (n <= 0 || n > outstanding) return null;
  return n;
}

export default function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const confirmUi = useConfirm();

  const invoice = useInvoice(id);
  const recordPayment = useRecordPayment(id);

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  if (invoice.isLoading) return <LoadingView message="Loading invoice…" />;
  if (invoice.error) return <ErrorView error={invoice.error} retry={() => invoice.refetch()} />;
  const inv = invoice.data!.data;
  const outstanding = Number(inv.total) - Number(inv.amountPaid);
  const payments = inv.payments ?? [];

  const pay = async () => {
    setFormError(null);
    const value = validateTzsAmount(amount, outstanding);
    if (value == null) {
      setFormError(`Enter an amount between 0 and the outstanding ${formatMoney(outstanding)}`);
      return;
    }
    const ok = await confirmUi({
      title: 'Record payment?',
      message: `${formatMoney(value)} via ${method}. Make sure every reference matches their payment proof before recording.`,
      actionLabel: 'Record payment',
    });
    if (!ok) return;
    setPaying(true);
    try {
      await recordPayment.mutateAsync({
        amount: value, method,
        reference: reference || undefined,
      });
      show('Payment recorded', 'success');
      setAmount(''); setReference('');
      invoice.refetch();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setPaying(false);
    }
  };

  return (
    <Screen title={inv.invoiceNumber} subtitle={`${inv.customer.name} · ${formatDate(inv.issuedAt)}`} back>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <ApiStatusBadge status={inv.status} />
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.total}>{formatMoney(inv.total)}</Text>
            <Text style={styles.meta}>Outstanding {formatMoney(outstanding)}</Text>
          </View>
        </View>
        <Text style={[styles.meta, { marginTop: 4 }]}>
          Subtotal {formatMoney(inv.subtotal)} · VAT {formatMoney(inv.taxTotal)} · Paid {formatMoney(inv.amountPaid)} · Due {formatDate(inv.dueAt)}
        </Text>
        <Text style={[styles.meta, { marginTop: 4 }]}>Order {inv.salesOrder.orderNumber}</Text>
      </Card>

      <SectionHeader title="Payments" />
      {payments.length === 0 ? (
        <Card><Text style={styles.meta}>No payments recorded yet.</Text></Card>
      ) : (
        payments.map((p: any) => (
          <Card key={p.id}>
            <Text style={styles.paymentAmount}>{formatMoney(p.amount)}</Text>
            <Text style={styles.meta}>{p.method} · {formatDateTime(p.receivedAt)}</Text>
            {p.reference ? <Text style={styles.meta}>Ref: {p.reference}</Text> : null}
          </Card>
        ))
      )}

      {inv.status !== 'PAID' && inv.status !== 'VOID' && (
        <>
          <SectionHeader title="Record a payment" />
          <Card>
            <Text style={styles.label}>Amount (TZS)</Text>
            <Input placeholder={`Max ${outstanding}`} keyboardType="numeric" value={amount} onChangeText={setAmount} />
            <Text style={styles.label}>Method</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {METHODS.map((m) => <Chip key={m} label={m.replace('_', ' ')} active={method === m} onPress={() => setMethod(m)} />)}
            </View>
            <Input placeholder="Reference (e.g. mobile money txn id)" value={reference} onChangeText={setReference} />
            {formError ? <Text style={styles.error}>{formError}</Text> : null}
            <Button text={paying ? 'Saving…' : 'Record payment'} onPress={pay} disabled={paying} />
          </Card>
        </>
      )}
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    total: { fontSize: Typography.sizes.base, fontWeight: Typography.weights.bold, color: colors.text },
    meta: { fontSize: Typography.sizes.xs, color: colors.textSecondary, marginTop: 2 },
    section: { marginTop: Spacing.lg, marginBottom: 6, fontWeight: Typography.weights.semibold, color: colors.textSecondary },
    paymentAmount: { fontSize: Typography.sizes.base, fontWeight: Typography.weights.semibold, color: colors.success },
    label: {
      fontSize: Typography.sizes.sm, fontWeight: Typography.weights.semibold,
      color: colors.textSecondary, marginBottom: 4,
    },
    error: { color: colors.danger, fontSize: Typography.sizes.xs, marginBottom: 8 },
  });

