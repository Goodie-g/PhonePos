import 'dotenv/config';

// Fail fast on missing/invalid configuration rather than misbehaving later.
const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtAccessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
  refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30),
  port: (() => {
    const raw = process.env.PORT;
    const n = raw ? Number(raw) : NaN;
    // Guard against empty strings / "0" / NaN — those would bind to a random
    // ephemeral port (port 0) and break hosts like Render that detect the port.
    return Number.isFinite(n) && n > 0 ? n : 4000;
  })(),
  // Browser origins allowed to call the API. CORS_ORIGINS *adds* to the
  // defaults instead of replacing them, so a misconfigured deployment can't
  // lock the web client out of its own API.
  corsOrigins: [
    'http://localhost:8081', // Expo web dev server
    'http://localhost:19006', // Expo web (legacy port)
    'https://phone-pos.vercel.app', // deployed demo frontend
    ...(process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  ].filter((origin, index, all) => all.indexOf(origin) === index),
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 10),
};
