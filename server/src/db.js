import { PrismaClient } from '@prisma/client';

// Single shared Prisma client for the process.
// In tests a dedicated client per test file is created instead (see tests/helpers).
export const prisma = new PrismaClient();

// Interactive transactions default to a 2s wait / 5s run limit, which is too
// tight against a managed Postgres: every statement is a network round trip, and
// receiving 30 handsets or fulfilling a large order can legitimately take longer.
export const withTransaction = (fn) =>
  prisma.$transaction(fn, { maxWait: 15000, timeout: 30000 });
