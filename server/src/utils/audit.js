/**
 * Writes an audit-log row. Pass the transaction client (tx) when the audited
 * change happens inside a transaction so the log is committed atomically with
 * the change itself.
 */
export const writeAudit = async (
  db,
  { businessId, userId = null, action, entityType, entityId, before = null, after = null, meta = null }
) =>
  db.auditLog.create({
    data: { businessId, userId, action, entityType, entityId, before, after, meta },
  });
