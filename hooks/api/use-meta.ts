/**
 * Container-meta hooks: warehouses, suppliers, users, price lists, audit.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, qs } from '../../lib/api/client';

const OPTIONS_STALE = { refetchOnWindowFocus: true } as const;

export const useWarehouses = () =>
  useQuery({
    queryKey: ['warehouses'],
    queryFn: () => apiFetch('/api/warehouses'),
    staleTime: 60_000,
    ...OPTIONS_STALE,
  });

export const useCreateWarehouse = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; code: string; address?: string }) =>
      apiFetch('/api/warehouses', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['warehouses'] }),
  });
};

export const useSuppliers = () =>
  useQuery({
    queryKey: ['suppliers'],
    queryFn: () => apiFetch('/api/suppliers'),
    staleTime: 60_000,
  });

export const useCreateSupplier = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; phone?: string; email?: string; address?: string }) =>
      apiFetch('/api/suppliers', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });
};

export const useMembers = () =>
  useQuery({
    queryKey: ['members'],
    queryFn: () => apiFetch('/api/users'),
    staleTime: 60_000,
  });

export const useInviteMember = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; fullName: string; password: string; role: string }) =>
      apiFetch('/api/users/invite', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members'] }),
  });
};

export const useUpdateMember = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ membershipId, ...body }: { membershipId: string; role?: string; isActive?: boolean }) =>
      apiFetch(`/api/users/${membershipId}`, { method: 'PATCH', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members'] }),
  });
};

export const usePriceLists = () =>
  useQuery({
    queryKey: ['price-lists'],
    queryFn: () => apiFetch('/api/price-lists'),
    staleTime: 60_000,
  });

export const useSetPriceTier = (priceListId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { variantId: string; minQty: number; unitPrice: number }) =>
      apiFetch(`/api/price-lists/${priceListId}/items`, { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['price-lists'] }),
  });
};

export interface AuditFilters {
  entityType?: string;
  entityId?: string;
  page?: number;
  pageSize?: number;
}
export const useAuditTrail = (filters: AuditFilters) =>
  useQuery({
    queryKey: ['audit', filters],
    queryFn: () => apiFetch(`/api/audit${qs(filters)}`),
  });
