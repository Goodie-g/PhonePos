/** Warehouse filter hook shared by report screens. */
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Chip } from '@/components/ui/chip';
import { useWarehouses } from './api/use-meta';

export interface WarehousePickerResult {
  warehouseId: string | undefined;
  picker: React.ReactNode;
}

export const useWarehouseFilter = (): WarehousePickerResult => {
  const warehouses = useWarehouses();
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const picker = useMemo(
    () => (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16 }}>
        <Chip label="All warehouses" active={warehouseId === null} onPress={() => setWarehouseId(null)} />
        {(warehouses.data?.data ?? []).map((w: any) => (
          <Chip key={w.id} label={w.name} active={warehouseId === w.id} onPress={() => setWarehouseId(w.id)} />
        ))}
      </View>
    ),
    [warehouseId, warehouses.data]
  );
  return { warehouseId: warehouseId ?? undefined, picker };
};
