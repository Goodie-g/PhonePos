/**
 * Role-based permission map.
 *
 * Permissions are named `area:action`. Route handlers declare the permission
 * they need via requirePermission('orders:create'); the middleware resolves
 * the caller's role from their membership of the *current business* — never
 * from a client-supplied role.
 *
 * Design note: keep this map flat and explicit. It is read by humans far more
 * often than it is edited, and an explicit list makes access reviews easy.
 */
export const PERMISSIONS = {
  OWNER: ['*'],
  ADMIN: ['*'],
  SALES_MANAGER: [
    'products:read',
    'inventory:read',
    'devices:read',
    'customers:read',
    'customers:manage',
    'pricelists:read',
    'pricelists:manage',
    'orders:read',
    'orders:create',
    'orders:manage',
    'invoices:read',
    'invoices:create',
    'payments:read',
    'payments:record',
    'shipments:read',
    'returns:read',
    'returns:manage',
    'reports:read',
  ],
  SALES_REP: [
    'products:read',
    'inventory:read',
    'customers:read',
    'customers:manage',
    'pricelists:read',
    'orders:read',
    'orders:create',
    'invoices:read',
    'reports:read',
  ],
  WAREHOUSE_MANAGER: [
    'products:read',
    'products:manage',
    'devices:read',
    'devices:manage',
    'suppliers:read',
    'suppliers:manage',
    'purchases:read',
    'purchases:manage',
    'purchases:receive',
    'warehouses:manage',
    'inventory:read',
    'inventory:adjust',
    'transfers:read',
    'transfers:manage',
    'transfers:dispatch',
    'transfers:receive',
    'orders:read',
    'shipments:read',
    'shipments:manage',
    'shipments:dispatch',
    'shipments:deliver',
    'returns:read',
    'returns:manage',
    'returns:inspect',
    'reports:read',
    'audit:read',
  ],
  WAREHOUSE_STAFF: [
    'products:read',
    'devices:read',
    'devices:manage',
    'suppliers:read',
    'purchases:read',
    'purchases:receive',
    'inventory:read',
    'transfers:read',
    'transfers:dispatch',
    'transfers:receive',
    'orders:read',
    'shipments:read',
    'shipments:manage',
    'shipments:dispatch',
  ],
  CASHIER: [
    'customers:read',
    'orders:read',
    'invoices:read',
    'payments:read',
    'payments:record',
    'reports:read',
  ],
};

export const roleAllows = (role, permission) => {
  const grants = PERMISSIONS[role] ?? [];
  return grants.includes('*') || grants.includes(permission);
};
