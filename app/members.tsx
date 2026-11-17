/**
 * Team members — invite users with roles (OWNER/ADMIN only; the API enforces
 * `users:manage`), change roles, re-enable/disable accounts.
 */
import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Chip } from '@/components/ui/chip';
import { useToast, ErrorView, LoadingView } from '@/components/ui/feedback';
import { Spacing, Typography, type ThemeColors } from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';
import { useMembers, useInviteMember, useUpdateMember } from '@/hooks/api/use-meta';
import { ApiClientError } from '@/lib/api/client';

const ROLES = ['SALES_MANAGER', 'SALES_REP', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'CASHIER', 'ADMIN'];

export default function MembersScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const members = useMembers();
  const invite = useInviteMember();
  const update = useUpdateMember();

  const [form, setForm] = useState({ email: '', fullName: '', password: '', role: 'SALES_REP' });
  const [error, setError] = useState<string | null>(null);

  const submitInvite = async () => {
    setError(null);
    try {
      await invite.mutateAsync(form);
      show('Member added — they can sign in immediately', 'success');
      setForm({ email: '', fullName: '', password: '', role: 'SALES_REP' });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : (err as Error).message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Team</Text>
        <Text style={styles.subtitle}>Roles are enforced by the API, not the navigation.</Text>
      </View>
      {members.isLoading && <LoadingView />}
      {members.error && <ErrorView error={members.error} retry={() => members.refetch()} />}
      {members.data && (
        <FlatList
          data={members.data.data}
          keyExtractor={(m: any) => m.membershipId}
          contentContainerStyle={{ paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'] }}
          renderItem={({ item }) => (
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.fullName} {item.isActive ? '' : '(disabled)'}</Text>
                  <Text style={styles.meta}>{item.email} · {item.role}</Text>
                </View>
                {item.role !== 'OWNER' && (
                  <View style={{ gap: 6 }}>
                    <Chip label="→ Cashier" active={false} onPress={() =>
                      update.mutate({ membershipId: item.membershipId, role: 'CASHIER' }, { onSuccess: () => show('Role updated', 'success'), onError: (e: any) => show(e.message, 'error') })} />
                    <Button
                      text={item.isActive ? 'Disable' : 'Enable'} size="sm" variant="danger"
                      onPress={() => update.mutate({ membershipId: item.membershipId, isActive: !item.isActive },
                        { onSuccess: () => show('Saved', 'success'), onError: (e: any) => show(e.message, 'error') })}
                    />
                  </View>
                )}
              </View>
            </Card>
          )}
          ListFooterComponent={
            <View>
              <Text style={styles.section}>Invite a teammate</Text>
              <Card>
                <Input placeholder="Email" autoCapitalize="none" value={form.email} onChangeText={(v) => setForm((f) => ({ ...f, email: v }))} />
                <Input placeholder="Full name" value={form.fullName} onChangeText={(v) => setForm((f) => ({ ...f, fullName: v }))} />
                <Input placeholder="Temporary password (min 8 chars)" secureTextEntry value={form.password} onChangeText={(v) => setForm((f) => ({ ...f, password: v }))} />
                <Text style={styles.label}>Role</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {ROLES.map((r) => (
                    <Chip key={r} label={r.replace('_', ' ')} active={form.role === r} onPress={() => setForm((f) => ({ ...f, role: r }))} />
                  ))}
                </View>
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Button text={invite.isPending ? 'Inviting…' : 'Invite member'} onPress={submitInvite} disabled={invite.isPending} />
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
    section: { fontSize: Typography.sizes.base, fontWeight: Typography.weights.semibold, color: colors.text, marginVertical: 6 },
    name: { fontSize: Typography.sizes.base, fontWeight: Typography.weights.semibold, color: colors.text },
    meta: { fontSize: Typography.sizes.xs, color: colors.textSecondary, marginTop: 2 },
    label: { fontSize: Typography.sizes.sm, fontWeight: Typography.weights.semibold, color: colors.textSecondary, marginVertical: 4 },
    error: { color: colors.danger, fontSize: Typography.sizes.xs, marginBottom: 8 },
  });

