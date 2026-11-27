import { createApp } from './app.js';
import { config } from './config.js';
import { prisma } from './db.js';
import { seed, disconnectSeed } from '../prisma/seed.js';

const app = createApp();

// Demo convenience: a brand-new deployment gets sample data automatically, so
// the public link works without a manual `npm run seed` step. The seed is a
// no-op once any business exists, and can be disabled with SEED_ON_EMPTY_DB=false.
const maybeSeedEmptyDatabase = async () => {
  if (process.env.SEED_ON_EMPTY_DB === 'false') return;
  try {
    const businesses = await prisma.business.count();
    if (businesses > 0) return;
    console.log('Empty database detected — seeding demo data...');
    await seed();
    await disconnectSeed();
  } catch (err) {
    // Never block startup on seeding: the API is still fully usable without demo data.
    console.error(`Auto-seed skipped: ${err.message}`);
  }
};

await maybeSeedEmptyDatabase();

app.listen(config.port, () => {
  console.log(`Stoku API listening on http://localhost:${config.port}`);
});
