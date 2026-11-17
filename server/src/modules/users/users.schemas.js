import { z } from 'zod';

const roles = ['OWNER', 'ADMIN', 'SALES_MANAGER', 'SALES_REP', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'CASHIER'];

export const inviteSchema = z.object({
  email: z.string().email().max(255),
  fullName: z.string().min(1).max(120),
  password: z.string().min(8).max(100),
  role: z.enum(roles).refine((r) => r !== 'OWNER', 'Cannot invite another OWNER'),
});

export const updateMemberSchema = z.object({
  role: z.enum(roles).optional(),
  isActive: z.boolean().optional(),
});
