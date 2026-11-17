/**
 * Commerce hooks: customers, orders, invoices, payments.
 * All mutations include an Idempotency-Key (uuid) so retrying a double-tap
 * or a flaky network cannot create two orders / two payments.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, qs } from '../../lib/api/client';
import { cryptoUUID } from '../uuid';

/** Stable per-attempt headers. Called fresh for every new attempt. */
export const idempotencyHeaders = () => ({ 'Idempotency-Key': cryptoUUID() });

export const idempotentPost = <T>(path: string, body: unknown) =>
  apiFetch<T>(path, { method: 'POST', body, headers: idempotencyHeaders(), });

export const useCustomers = (params: { search?: string; status?: string; page?: number; pageSize?: number }) =>
  useQuery({
    queryKey: ['customers', params],
    queryFn: () => apiFetch(`/api/customers${qs(params)}`),
  });

export const useCustomer = (id: string) =>
  useQuery({
    queryKey: ['customers', id],
    queryFn: () => apiFetch(`/api/customers/${id}`),
    enabled: Boolean(id),
  });

export const useCustomerStatement = (id: string) =>
  useQuery({
    queryKey: ['customers', id, 'statement'],
    queryFn: () => apiFetch(`/api/customers/${id}/statement`),
    enabled: Boolean(id),
  });

export const useCreateCustomer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => {
      // Creating a customer only assigns a code — no side effects that need
      // idempotency beyond the unique name, but we still use the pattern.
      return apiFetch('/api/customers', { method: 'POST', body });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
};

export const useUpdateCustomer = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch(`/api/customers/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customers', id] });
      qc.invalidateQueries({ queryKey: ['customers', id, 'statement'] });
    },
  });
};

export const useOrders = (params: { status?: string; customerId?: string; page?: number; pageSize?: number }) =>
  useQuery({
    queryKey: ['orders', params],
    queryFn: () => apiFetch(`/api/orders${qs(params)}`),
  });

export const useOrder = (id: string) =>
  useQuery({
    queryKey: ['orders', 'detail', id],
    queryFn: () => apiFetch(`/api/orders/${id}`),
    enabled: Boolean(id),
  });

export const useCreateOrder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { customerId: string; warehouseId: string; notes?: string; items: { variantId: string; quantity: number }[] }) =>
      idempotentPost('/api/orders', body),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.setQueryData(['orders', 'detail', (data as any).data.id], data);
    },
  });
};

export const useOrderAction = (id: string, action: 'submit' | 'confirm' | 'cancel') => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch(`/api/orders/${id}/${action}`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
};

export const useFulfilOrder = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { items: { orderItemId: string; quantity?: number; deviceIds?: string[] }[] }) =>
      apiFetch(`/api/orders/${id}/fulfil`, { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['devices'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
};

export const useInvoices = (params: { status?: string; customerId?: string; overdue?: boolean; page?: number; pageSize?: number }) =>
  useQuery({
    queryKey: ['invoices', params],
    queryFn: () => apiFetch(`/api/invoices${qs(params)}`),
  });

export const useInvoice = (id: string) =>
  useQuery({
    queryKey: ['invoices', 'detail', id],
    queryFn: () => apiFetch(`/api/invoices/${id}`),
    enabled: Boolean(id),
  });

export const useCreateInvoice = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { salesOrderId: string }) => apiFetch('/api/invoices', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
};

export const useRecordPayment = (invoiceId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { amount: number; method: string; reference?: string; note?: string }) =>
      idempotentPost(`/api/invoices/${invoiceId}/payments`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['reports'] });
    },
  });
};
