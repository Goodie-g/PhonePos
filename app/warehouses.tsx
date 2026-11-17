/** Warehouses — list + create (`warehouses:manage` enforced by the API). */
import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast, ErrorView, LoadingView } from '@/components/ui/feedback';
import { Spacing, Typography, type ThemeColors } from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';
import { useWarehouses, useCreateWarehouse } from '@/hooks/api/use-meta';
import { ApiClientError } from '@/lib/api/client';

export default function WarehousesScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const warehouses = useWarehouses();
  const create = useCreateWarehouse();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!name.trim() || !code.trim()) return setError('Name and code are required');
    try {
      await create.mutateAsync({ name: name.trim(), code: code.trim(), address: address || undefined });
      show('Warehouse created', 'success');
      setName(''); setCode(''); setAddress('');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to create warehouse');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Warehouses</Text>
        <Text style={styles.subtitle}>One warehouse is enough; add more as you expand.</Text>
      </View>
      {warehouses.isLoading && <LoadingView />}
      {warehouses.error && <ErrorView error={warehouses.error} retry={() => warehouses.refetch()} />}
      {warehouses.data && (
        <FlatList
          data={warehouses.data.data}
          keyExtractor={(w: any) => w.id}
          contentContainerStyle={{ paddingHorizontal: Spacing.lg }}
          renderItem={({ item }) => (
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.meta}>{item.code}{item.address ? ` · ${item.address}` : ''}</Text>
                </View>
                <Text style={[styles.meta, { color: item.isActive ? colors.success : colors.danger }]}>
                  {item.isActive ? 'Active' : 'Inactive'}
                </Text>
              </View>
            </Card>
          )}
          ListFooterComponent={
            <View style={{ marginTop: Spacing.lg }}>
              <Text style={styles.section}>Add warehouse</Text>
              <Card>
                <Input placeholder="Name (e.g. Mwanza Depot)" value={name} onChangeText={setName} />
                <Input placeholder="Short code (e.g. MWZ)" value={code} onChangeText={(v) => setCode(v.toUpperCase())} />
                <Input placeholder="Address (optional)" value={address} onChangeText={setAddress} />
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Button text={create.isPending ? 'Creating…' : 'Create warehouse'} onPress={submit} disabled={create.isPending} />
              </Card>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.backgroundSecondary },
    header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
    title: { fontSize: Typography.sizes['2xl'], fontWeight: Typography.weights.bold, color: colors.text },
    subtitle: { fontSize: Typography.sizes.xs, color: colors.textSecondary, marginTop: 2 },
    section: { fontSize: Typography.sizes.base, fontWeight: Typography.weights.semibold, color: colors.text, marginBottom: 6 },
    name: { fontSize: Typography.sizes.base, fontWeight: Typography.weights.semibold, color: colors.text },
    meta: { fontSize: Typography.sizes.xs, color: colors.textSecondary, marginTop: 2 },
    error: { color: colors.danger, fontSize: Typography.sizes.xs, marginBottom: 8 },
  });
