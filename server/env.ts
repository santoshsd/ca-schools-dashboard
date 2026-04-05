import { z } from "zod";

// Validated environment. Import from here instead of reading process.env directly.
// This runs once at module load; a failure fast-fails the process with a
// descriptive error listing every missing/invalid variable.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Postgres connection string. Required.
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine(
      (v) => v.startsWith("postgres://") || v.startsWith("postgresql://"),
      "DATABASE_URL must be a postgres:// or postgresql:// URL",
    ),

  // Session cookie signing key. Must be long enough to resist brute force.
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters"),

  // Optional port override.
  PORT: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 5000))
    .refine((v) => Number.isFinite(v) && v > 0 && v < 65536, "PORT must be a valid port number"),

  // Replit-managed auth. Optional; presence of both switches us to Replit auth mode.
  REPL_ID: z.string().optional(),
  ISSUER_URL: z.string().url().optional(),

  // Comma-separated list of CORS origins for the authenticated dashboard.
  // The public /api/v1/* endpoints use Bearer auth and are exempt.
  CORS_ALLOWED_ORIGINS: z.string().optional(),

  // Admin secret for the data ingestion trigger endpoint.
  // If not set, the /api/admin/* endpoints are disabled (503).
  ADMIN_SECRET: z.string().min(8, "ADMIN_SECRET must be at least 8 characters").optional(),
});

function parseEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    // Fail fast, loudly.
    console.error(`\nInvalid environment configuration:\n${issues}\n`);
    throw new Error("Environment validation failed");
  }
  return parsed.data;
}

export const env = parseEnv();

export type Env = typeof env;
