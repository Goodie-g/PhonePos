/** Customer detail + statement (invoices, payments, outstanding, overdue). */
import { useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { ApiStatusBadge } from '@/components/ui/api-status-badge';
import { ErrorView, LoadingView, useToast } from '@/components/ui/feedback';
import { Spacing, Typography, type ThemeColors } from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';
import { formatDate, formatMoney } from '@/lib/api/format';
import { useCustomer, useCustomerStatement, useUpdateCustomer } from '@/hooks/api/use-commerce';

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const customer = useCustomer(id);
  const statement = useCustomerStatement(id);
  const update = useUpdateCustomer((id as string) ?? '');

  const [tab, setTab] = useState<'summary' | 'statement'>('summary');
  const [error, setError] = useState<string | null>(null);

  const setStatus = async (status: string) => {
    setError(null);
    try {
      await update.mutateAsync({ status });
      show(`Customer marked ${status.toLowerCase()}`, 'success');
      statement.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  };

  if (customer.isLoading) return <LoadingView />;
  if (customer.error) return <ErrorView error={customer.error} retry={() => customer.refetch()} />;
  const c = customer.data!.data;
  const s = statement.data?.data;

  return (
    <Screen title={c.name} subtitle={`${c.code}${c.phone ? ` · ${c.phone}` : ''}`} back>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        <Chip label="Summary" active={tab === 'summary'} onPress={() => setTab('summary')} />
        <Chip label="Statement" active={tab === 'statement'} onPress={() => setTab('statement')} />
      </View>

      {tab === 'summary' && (
        <>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <ApiStatusBadge status={c.status} />
              <Text style={styles.big}>{formatMoney(s?.totalOutstanding ?? 0)} outstanding</Text>
            </View>
            <Text style={styles.meta}>
              Credit limit {formatMoney(c.creditLimit)} · Terms {c.paymentTermsDays} day(s)
            </Text>
            {c.priceList ? <Text style={styles.meta}>Price list: {c.priceList.name}</Text> : null}
            {c.contactName ? <Text style={[styles.meta, { marginTop: 6 }]}>Contact: {c.contactName}</Text> : null}
          </Card>

          <View style={styles.actions}>
            <Text style={styles.label}>Account actions</Text>
            {c.status !== 'ACTIVE' && (
              <Button text="Re-activate" onPress={() => setStatus('ACTIVE')} />
            )}
            {c.status === 'ACTIVE' && (
              <Button text="Suspend (pause new credit)" variant="secondary" onPress={() => setStatus('SUSPENDED')} />
            )}
            <Button text="Block" variant="danger" onPress={() => setStatus('BLOCKED')} />
          </View>
        </>
      )}

      {tab === 'statement' && (
        statement.isLoading ? <LoadingView /> : statement.error ? <ErrorView error={statement.error} retry={() => statement.refetch()} /> : (
          <>
            <SectionHeader title="Invoices" />
            {(s?.lines ?? []).length === 0 ? (
              <Card><Text style={styles.meta}>No invoices yet.</Text></Card>
            ) : (
              s.lines.map((line: any) => (
                <Card key={line.invoiceId}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={styles.plain}>{line.invoiceNumber} · {formatDate(line.issuedAt)}</Text>
                    {line.overdue ? <ApiStatusBadge kind="danger" label="Overdue" /> : null}
                  </View>
                  <Text style={styles.meta}>
                    Total {formatMoney(line.total)} · Paid {formatMoney(line.amountPaid)}
                  </Text>
                  <Text style={[styles.meta, { color: colors.primary }]}>Outstanding {formatMoney(line.outstanding)}</Text>
                  {line.payments.map((p: any) => (
                    <Text key={p.id} style={styles.meta}>+ {formatMoney(p.amount)} {p.method} {formatDate(p.receivedAt)}</Text>
                  ))}
                </Card>
              ))
            )}
          </>
        )
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    big: { fontSize: Typography.sizes.base, fontWeight: Typography.weights.bold, color: colors.text },
    meta: { fontSize: Typography.sizes.xs, color: colors.textSecondary, marginTop: 2 },
    plain: { fontSize: Typography.sizes.sm, color: colors.text, fontWeight: Typography.weights.semibold },
    actions: { marginTop: Spacing.lg, gap: Spacing.sm, marginBottom: 16 },
    label: { fontSize: Typography.sizes.sm, fontWeight: Typography.weights.semibold, color: colors.textSecondary, marginBottom: 6 },
    error: { color: colors.danger, fontSize: Typography.sizes.sm, padding: Spacing.md },
  });

