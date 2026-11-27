import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const host = process.env.DATABASE_URL?.match(/@([^/:?]+)/)?.[1] ?? 'unknown';
console.log('target host:', host, '| pooled:', /-pooler\./.test(process.env.DATABASE_URL ?? ''));

const t0 = Date.now();
try {
  const res = await prisma.$transaction(async (tx) => {
    const out = [];
    for (let i = 1; i <= 60; i++) {
      const r = await tx.$queryRaw`select ${i}::int as n`;
      out.push(r[0].n);
      if (i % 10 === 0) console.log(`  ...${i} queries, ${Date.now() - t0}ms`);
    }
    return out.length;
  }, { timeout: 30000, maxWait: 15000 });
  console.log('interactive tx OK, queries:', res, 'elapsed', Date.now() - t0, 'ms');
} catch (err) {
  console.log('FAILED after', Date.now() - t0, 'ms ->', err.code ?? '', err.message?.slice(0, 160));
} finally {
  await prisma.$disconnect();
}
