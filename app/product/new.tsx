/**
 * Create product (+ optional first variant) — posts to the real API.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Screen } from '@/components/ui/screen';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Chip } from '@/components/ui/chip';
import { useToast } from '@/components/ui/feedback';
import { Spacing, Typography, type ThemeColors } from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';
import { useBrands, useCategories, useCreateProduct, useCreateVariant } from '@/hooks/api/use-catalogue';
import { ApiClientError, apiFetch } from '@/lib/api/client';

export default function NewProductScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const brands = useBrands();
  const categories = useCategories();
  const createProduct = useCreateProduct();
  const createVariant = useCreateVariant(''); // set after product exists

  const [type, setType] = useState<'PHONE' | 'ACCESSORY'>('PHONE');
  const [brandId, setBrandId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [newBrand, setNewBrand] = useState('');
  const [variant, setVariant] = useState({ sku: '', storageGb: '', ramGb: '', color: '', costPrice: '', sellPrice: '' });
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async () => {
    setFormError(null);
    try {
      let effectiveBrandId = brandId;
      if (!effectiveBrandId && newBrand.trim()) {
        const created = await apiFetch('/api/products/brands', { method: 'POST', body: { name: newBrand.trim() } });
        effectiveBrandId = (created as any).data.id;
      }
      if (!effectiveBrandId) throw new Error('Choose or enter a brand');
      const product = await createProduct.mutateAsync({
        brandId: effectiveBrandId,
        categoryId: categoryId ?? undefined,
        name: name.trim(),
        type,
        description: description || undefined,
      });
      const productId = (product as any).data.id;
      if (variant.sku.trim() && variant.sellPrice) {
        await apiFetch(`/api/products/${productId}/variants`, {
          method: 'POST',
          body: {
            sku: variant.sku.trim(),
            storageGb: variant.storageGb ? Number(variant.storageGb) : undefined,
            ramGb: variant.ramGb ? Number(variant.ramGb) : undefined,
            color: variant.color || undefined,
            costPrice: Number(variant.costPrice || 0),
            sellPrice: Number(variant.sellPrice),
          },
        });
      }
      show('Product created', 'success');
      router.back();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : (err as Error).message);
    }
  };

  return (
    <Screen title="New product" subtitle="A product MODEL with one or more sellable variants" back>
      <Card>
        <Text style={styles.label}>Type</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          <Chip label="Phone (IMEI-tracked)" active={type === 'PHONE'} onPress={() => setType('PHONE')} />
          <Chip label="Accessory (quantity)" active={type === 'ACCESSORY'} onPress={() => setType('ACCESSORY')} />
        </View>

        <Text style={styles.label}>Model name</Text>
        <Input placeholder="e.g. Galaxy A15" value={name} onChangeText={setName} />

        <Text style={styles.label}>Brand</Text>
        {brands.isLoading ? null : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {(brands.data?.data ?? []).map((b: any) => (
              <Chip key={b.id} label={b.name} active={brandId === b.id} onPress={() => setBrandId(b.id)} />
            ))}
          </View>
        )}
        <Input placeholder="…or type a new brand" value={newBrand} onChangeText={setNewBrand} />

        {type === 'ACCESSORY' && categories.data && (
          <>
            <Text style={styles.label}>Category</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {(categories.data.data ?? []).map((c: any) => (
                <Chip key={c.id} label={c.name} active={categoryId === c.id} onPress={() => setCategoryId(c.id)} />
              ))}
            </View>
          </>
        )}

        <Text style={styles.label}>Description (optional)</Text>
        <Input placeholder="Notes…" value={description} onChangeText={setDescription} />
      </Card>

      <Card>
        <Text style={styles.sectionLabel}>First variant (optional but recommended)</Text>
        <Input placeholder="SKU" value={variant.sku} onChangeText={(v) => setVariant((f) => ({ ...f, sku: v }))} />
        {type === 'PHONE' && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Input placeholder="Storage GB" keyboardType="numeric" value={variant.storageGb} onChangeText={(v) => setVariant((f) => ({ ...f, storageGb: v }))} />
            </View>
            <View style={{ flex: 1 }}>
              <Input placeholder="RAM GB" keyboardType="numeric" value={variant.ramGb} onChangeText={(v) => setVariant((f) => ({ ...f, ramGb: v }))} />
            </View>
          </View>
        )}
        {type === 'PHONE' && (
          <Input placeholder="Colour" value={variant.color} onChangeText={(v) => setVariant((f) => ({ ...f, color: v }))} />
        )}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Input placeholder="Cost price (TZS)" keyboardType="numeric" value={variant.costPrice} onChangeText={(v) => setVariant((f) => ({ ...f, costPrice: v }))} />
          </View>
          <View style={{ flex: 1 }}>
            <Input placeholder="Sell price (TZS)" keyboardType="numeric" value={variant.sellPrice} onChangeText={(v) => setVariant((f) => ({ ...f, sellPrice: v }))} />
          </View>
        </View>
      </Card>

      {formError ? <Text style={styles.error}>{formError}</Text> : null}
      <Button
        text={createProduct.isPending ? 'Saving…' : 'Create product'}
        onPress={submit}
        disabled={createProduct.isPending}
      />
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    label: {
      fontSize: Typography.sizes.sm,
      fontWeight: Typography.weights.semibold,
      color: colors.textSecondary,
      marginVertical: Spacing.xs,
    },
    sectionLabel: {
      fontSize: Typography.sizes.base,
      fontWeight: Typography.weights.semibold,
      color: colors.text,
      marginBottom: Spacing.sm,
    },
    error: { color: colors.danger, fontSize: Typography.sizes.sm, marginBottom: 8 },
  });

