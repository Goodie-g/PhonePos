// Runs before any test file (and before src/config.js is imported).
// Point the app at the dedicated TEST database and use cheap hashing so the
// suite stays fast.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://stoku:stoku@localhost:5433/stoku_test?schema=public';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';
process.env.BCRYPT_ROUNDS = '4';
process.env.NODE_ENV = 'test';
