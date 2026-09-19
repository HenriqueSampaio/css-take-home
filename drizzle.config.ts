import { defineConfig } from "drizzle-kit";

// Migrations run over Neon's direct (unpooled) endpoint; the app itself uses the pooled one.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local yet: `generate` works offline, only `migrate` needs a database.
}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "" },
});
