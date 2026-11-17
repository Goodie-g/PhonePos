/** Presentation helpers for API data. */

const tzs = new Intl.NumberFormat('en-TZ', {
  style: 'currency',
  currency: 'TZS',
  maximumFractionDigits: 0,
});

/** 1234567.89 -> "TZS 1,234,568" */
export const formatMoney = (value: string | number | null | undefined): string => {
  const n = Number(value ?? 0);
  if (Number.isNaN(n)) return '—';
  return tzs.format(n);
};

export const formatDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export const formatDateTime = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

export type StatusKind = 'success' | 'warning' | 'danger' | 'info' | 'muted';

const STATUS_MAP: Record<string, { label: string; kind: StatusKind }> = {
  // orders
  DRAFT: { label: 'Draft', kind: 'muted' },
  SUBMITTED: { label: 'Submitted', kind: 'info' },
  CONFIRMED: { label: 'Confirmed', kind: 'info' },
  PARTIALLY_FULFILLED: { label: 'Part-fulfilled', kind: 'warning' },
  FULFILLED: { label: 'Fulfilled', kind: 'success' },
  INVOICED: { label: 'Invoiced', kind: 'success' },
  CANCELLED: { label: 'Cancelled', kind: 'danger' },
  // invoices
  ISSUED: { label: 'Issued', kind: 'info' },
  PARTIALLY_PAID: { label: 'Part-paid', kind: 'warning' },
  PAID: { label: 'Paid', kind: 'success' },
  VOID: { label: 'Void', kind: 'danger' },
  // devices
  RECEIVED: { label: 'Received', kind: 'muted' },
  AVAILABLE: { label: 'Available', kind: 'success' },
  RESERVED: { label: 'Reserved', kind: 'warning' },
  SOLD: { label: 'Sold', kind: 'info' },
  RETURNED: { label: 'Returned', kind: 'warning' },
  UNDER_INSPECTION: { label: 'Under inspection', kind: 'warning' },
  QUARANTINED: { label: 'Quarantined', kind: 'danger' },
  IN_TRANSIT: { label: 'In transit', kind: 'info' },
  // POs
  PARTIALLY_RECEIVED: { label: 'Part-received', kind: 'warning' },
  // transfers & shipments
  DISPATCHED: { label: 'Dispatched', kind: 'info' },
  PICKING: { label: 'Picking', kind: 'warning' },
  DELIVERED: { label: 'Delivered', kind: 'success' },
  // returns
  CLOSED: { label: 'Closed', kind: 'success' },
  REJECTED: { label: 'Rejected', kind: 'danger' },
  // customers
  ACTIVE: { label: 'Active', kind: 'success' },
  SUSPENDED: { label: 'Suspended', kind: 'warning' },
  BLOCKED: { label: 'Blocked', kind: 'danger' },
};

export const statusInfo = (status: string): { label: string; kind: StatusKind } =>
  STATUS_MAP[status] ?? { label: status, kind: 'muted' };

/** Compact variant spec line, e.g. "128GB · 4GB RAM · Black" */
export const variantSpec = (v: { storageGb?: number | null; ramGb?: number | null; color?: string | null }): string =>
  [v.storageGb ? `${v.storageGb}GB` : null, v.ramGb ? `${v.ramGb}GB RAM` : null, v.color ?? null]
    .filter(Boolean)
    .join(' · ');
