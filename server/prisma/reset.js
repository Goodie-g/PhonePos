/**
 * Empties every table while keeping the schema.
 *
 * Use for demo/development resets only:
 *   npm run db:reset     (from server/)
 * then restart the API (or `npm run seed`) to repopulate.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const tables = await prisma.$queryRawUnsafe(
  `select tablename from pg_tables where schemaname = 'public' and tablename <> '_prisma_migrations'`
);
for (const { tablename } of tables) {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${tablename}" CASCADE`);
}
console.log(`Truncated ${tables.length} tables.`);
await prisma.$disconnect();
