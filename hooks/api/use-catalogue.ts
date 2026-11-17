/**
 * Catalogue hooks: products, variants, devices, inventory balances/movements.
 * List hooks pass query params straight through — the API does searching,
 * filtering, sorting and pagination (never filter the whole business's data
 * in the browser).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, qs } from '../../lib/api/client';

export interface ListParams { search?: string; status?: string; type?: string; brandId?: string; warehouseId?: string; variantId?: string; imei?: string; page?: number; pageSize?: number; sort?: string; }

export const useProducts = (params: ListParams) =>
  useQuery({
    queryKey: ['products', params],
    queryFn: () => apiFetch(`/api/products${qs(params)}`),
  });

export const useProduct = (id: string) =>
  useQuery({
    queryKey: ['products', 'detail', id],
    queryFn: () => apiFetch(`/api/products/${id}`),
    enabled: Boolean(id),
  });

export const useBrands = () =>
  useQuery({
    queryKey: ['brands'],
    queryFn: () => apiFetch('/api/products/brands'),
    staleTime: 300_000,
  });

export const useCategories = () =>
  useQuery({
    queryKey: ['categories'],
    queryFn: () => apiFetch('/api/products/categories'),
    staleTime: 300_000,
  });

export const useCreateProduct = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { brandId: string; categoryId?: string; name: string; type: string; description?: string }) =>
      apiFetch('/api/products', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
};

export const useCreateVariant = (productId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch(`/api/products/${productId}/variants`, { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['products', 'detail'] });
    },
  });
};

export const useUpdateProduct = (productId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch(`/api/products/${productId}`, { method: 'PATCH', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['products', 'detail'] });
    },
  });
};

export const useDevices = (params: ListParams) =>
  useQuery({
    queryKey: ['devices', params],
    queryFn: () => apiFetch(`/api/devices${qs(params)}`),
  });

export const useMarkAvailable = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deviceId: string) =>
      apiFetch(`/api/devices/${deviceId}/mark-available`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['purchase'] });
    },
  });
};

export const useBalances = (params: ListParams) =>
  useQuery({
    queryKey: ['inventory', 'balances', params],
    queryFn: () => apiFetch(`/api/inventory/balances${qs(params)}`),
  });

export const useMovements = (params: ListParams) =>
  useQuery({
    queryKey: ['inventory', 'movements', params],
    queryFn: () => apiFetch(`/api/inventory/movements${qs(params)}`),
  });

export const useAdjustStock = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { warehouseId: string; variantId: string; delta: number; reason: string }) =>
      apiFetch('/api/inventory/adjustments', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
};
