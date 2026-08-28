import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://postgres:1234@localhost:5432/kora2',
  },
  verbose: true,
  strict: true,
});
