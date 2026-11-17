/** Create business customer (endpoint assigns the customer code). */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/ui/screen';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/feedback';
import { Spacing, Typography, type ThemeColors } from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';
import { useCreateCustomer } from '@/hooks/api/use-commerce';
import { ApiClientError } from '@/lib/api/client';

export default function NewCustomerScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const create = useCreateCustomer();

  const [form, setForm] = useState({
    name: '', contactName: '', phone: '', email: '', creditLimit: '', paymentTermsDays: '0',
  });
  const [error, setError] = useState<string | null>(null);

  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setError(null);
    if (!form.name.trim()) return setError('Business name is required');
    try {
      const res = await create.mutateAsync({
        name: form.name.trim(),
        contactName: form.contactName || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        creditLimit: Number(form.creditLimit || 0),
        paymentTermsDays: Number(form.paymentTermsDays || 0),
      });
      show('Customer created', 'success');
      router.replace(`/customer/${(res as any).data.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to create customer');
    }
  };

  return (
    <Screen title="New customer" subtitle="Business accounts use credit limits & payment terms" back>
      <Card>
        <Input placeholder="Business name *" value={form.name} onChangeText={set('name')} />
        <Input placeholder="Contact person" value={form.contactName} onChangeText={set('contactName')} />
        <Input placeholder="Phone" value={form.phone} onChangeText={set('phone')} />
        <Input placeholder="Email" autoCapitalize="none" value={form.email} onChangeText={set('email')} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Credit limit (TZS, 0 = none)</Text>
            <Input placeholder="0" keyboardType="numeric" value={form.creditLimit} onChangeText={set('creditLimit')} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Payment terms (days)</Text>
            <Input placeholder="0" keyboardType="numeric" value={form.paymentTermsDays} onChangeText={set('paymentTermsDays')} />
          </View>
        </View>
      </Card>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button text={create.isPending ? 'Saving…' : 'Create customer'} onPress={submit} disabled={create.isPending} />
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    label: {
      fontSize: Typography.sizes.sm, fontWeight: Typography.weights.semibold,
      color: colors.textSecondary, marginBottom: 4,
    },
    error: { color: colors.danger, fontSize: Typography.sizes.sm, marginBottom: 8 },
  });
