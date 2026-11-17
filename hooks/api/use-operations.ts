/**
 * Operations hooks: purchases, transfers, shipments, returns, reports.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, qs } from '../../lib/api/client';
import { idempotentPost } from './use-commerce';

export const usePurchases = (params: { status?: string; supplierId?: string; page?: number; pageSize?: number }) =>
  useQuery({
    queryKey: ['purchases', params],
    queryFn: () => apiFetch(`/api/purchases${qs(params)}`),
  });

export const usePurchase = (id: string) =>
  useQuery({
    queryKey: ['purchase', 'detail', id],
    queryFn: () => apiFetch(`/api/purchases/${id}`),
    enabled: Boolean(id),
  });

export const useCreatePurchaseOrder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { supplierId: string; notes?: string; items: { variantId: string; quantity: number; unitCost: number }[] }) =>
      apiFetch('/api/purchases', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchases'] }),
  });
};

export const usePurchaseAction = (id: string, action: 'submit' | 'cancel') => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch(`/api/purchases/${id}/${action}`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['purchase', 'detail'] });
    },
  });
};

export const useReceiveGoods = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      warehouseId: string;
      note?: string;
      items: { purchaseOrderItemId: string; quantity: number }[];
      devices: { purchaseOrderItemId: string; imei1: string; imei2?: string; serialNumber?: string; warrantyMonths?: number }[];
    }) => idempotentPost(`/api/purchases/${id}/receive`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['purchase', 'detail'] });
      qc.invalidateQueries({ queryKey: ['devices'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['reports'] });
    },
  });
};

export const useTransfers = (params: { status?: string; page?: number; pageSize?: number }) =>
  useQuery({
    queryKey: ['transfers', params],
    queryFn: () => apiFetch(`/api/transfers${qs(params)}`),
  });

export const useTransfer = (id: string) =>
  useQuery({
    queryKey: ['transfer', 'detail', id],
    queryFn: () => apiFetch(`/api/transfers/${id}`),
    enabled: Boolean(id),
  });

export const useCreateTransfer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { fromWarehouseId: string; toWarehouseId: string; note?: string; items: { variantId: string; quantity: number }[]; deviceIds: string[] }) =>
      apiFetch('/api/transfers', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transfers'] });
      qc.invalidateQueries({ queryKey: ['transfer', 'detail'] });
    },
  });
};

export const useTransferAction = (id: string, action: 'dispatch' | 'cancel') => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch(`/api/transfers/${id}/${action}`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transfers'] });
      qc.invalidateQueries({ queryKey: ['transfer', 'detail'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['devices'] });
    },
  });
};

export const useReceiveTransfer = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { items: { variantId: string; quantity: number }[]; deviceIds: string[] }) =>
      apiFetch(`/api/transfers/${id}/receive`, { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transfers'] });
      qc.invalidateQueries({ queryKey: ['transfer', 'detail'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['devices'] });
    },
  });
};

export const useShipments = (params: { salesOrderId?: string; status?: string; page?: number; pageSize?: number }) =>
  useQuery({
    queryKey: ['shipments', params],
    queryFn: () => apiFetch(`/api/shipments${qs(params)}`),
  });

export const useCreateShipment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { salesOrderId: string; carrier?: string; items: { orderItemId: string; quantity: number }[]; deviceIds: string[] }) =>
      apiFetch('/api/shipments', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shipments'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
};

export const useShipmentAction = (id: string, action: 'dispatch' | 'deliver' | 'cancel') => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body?: Record<string, unknown>) =>
      apiFetch(`/api/shipments/${id}/${action}`, { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shipments'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
};

export const useReturns = (params: { status?: string; page?: number; pageSize?: number }) =>
  useQuery({
    queryKey: ['returns', params],
    queryFn: () => apiFetch(`/api/returns${qs(params)}`),
  });

export const useReturn = (id: string) =>
  useQuery({
    queryKey: ['return', 'detail', id],
    queryFn: () => apiFetch(`/api/returns/${id}`),
    enabled: Boolean(id),
  });

export const useCreateReturn = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { salesOrderId: string; reason: string; items: { orderItemId: string; quantity: number; deviceId?: string }[] }) =>
      apiFetch('/api/returns', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['returns'] });
      qc.invalidateQueries({ queryKey: ['devices'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
};

export const useInspectReturn = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { items: { returnItemId: string; outcome: string }[] }) =>
      apiFetch(`/api/returns/${id}/inspect`, { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['returns'] });
      qc.invalidateQueries({ queryKey: ['return', 'detail'] });
      qc.invalidateQueries({ queryKey: ['devices'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
};

export const useRefundReturn = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { amount: number }) => apiFetch(`/api/returns/${id}/refund`, { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['returns'] });
      qc.invalidateQueries({ queryKey: ['return', 'detail'] });
    },
  });
};

export const useDashboard = () =>
  useQuery({
    queryKey: ['reports', 'dashboard'],
    queryFn: () => apiFetch('/api/reports/dashboard'),
  });

export const useStockReport = (warehouseId?: string) =>
  useQuery({
    queryKey: ['reports', 'stock', { warehouseId }],
    queryFn: () => apiFetch(`/api/reports/stock${qs({ warehouseId })}`),
  });

export const useOutstandingReport = () =>
  useQuery({
    queryKey: ['reports', 'outstanding'],
    queryFn: () => apiFetch('/api/reports/outstanding'),
  });

export const useBestSellers = () =>
  useQuery({
    queryKey: ['reports', 'best-sellers'],
    queryFn: () => apiFetch('/api/reports/best-sellers'),
  });
