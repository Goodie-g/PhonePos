import { PrismaClient } from '@prisma/client';

// Single shared Prisma client for the process.
// In tests a dedicated client per test file is created instead (see tests/helpers).
export const prisma = new PrismaClient();
