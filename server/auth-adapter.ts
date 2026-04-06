import type { Express, RequestHandler } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { createHash, randomBytes } from "crypto";
import argon2 from "argon2";
import { z } from "zod";
import { db } from "./db";
import { eq, sql, and, gt, isNull } from "drizzle-orm";
import { users, userPasswords, passwordResetTokens } from "@shared/schema";
import { env } from "./env";
import { sendPasswordResetEmail } from "./email";

// Strict password policy for new registrations / rotations.
const credentialsSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(254)
    .email("Invalid email format"),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .max(1024, "Password too long"),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
});

const loginSchema = credentialsSchema.pick({ email: true, password: true }).extend({
  // Login allows pre-existing shorter passwords too, so relax min-length.
  password: z.string().min(1).max(1024),
});

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const satisfies argon2.Options;

function isReplitEnvironment(): boolean {
  return !!env.REPL_ID && !!env.ISSUER_URL;
}

// Legacy hash format produced by the previous SHA-256 code is "salt:hex".
// We detect and migrate it transparently on successful login.
function isLegacyHash(hash: string): boolean {
  return !hash.startsWith("$argon2");
}

function verifyLegacyHash(storedHash: string, password: string): boolean {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const attempt = createHash("sha256").update(password + salt).digest("hex");
  // Timing-safe-ish comparison (lengths are fixed for sha256 hex).
  if (attempt.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < attempt.length; i++) {
    diff |= attempt.charCodeAt(i) ^ hash.charCodeAt(i);
  }
  return diff === 0;
}

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  if (isLegacyHash(storedHash)) {
    return verifyLegacyHash(storedHash, password);
  }
  try {
    return await argon2.verify(storedHash, password);
  } catch {
    return false;
  }
}

// Ensures the user_passwords table exists at boot. Production deployments
// should own this via drizzle-kit migrations; this is a safety net for
// environments (Replit, fresh dev DBs) that haven't run migrations yet.
async function ensureUserPasswordsTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_passwords (
      user_id VARCHAR PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      password_hash TEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `);
}

export async function setupAuthAdapter(app: Express) {
  if (isReplitEnvironment()) {
    const { setupAuth, registerAuthRoutes, isAuthenticated } = await import("./replit_integrations/auth");
    await setupAuth(app);
    registerAuthRoutes(app);
    setIsAuthenticated(isAuthenticated);
    return;
  }

  app.set("trust proxy", 1);

  await ensureUserPasswordsTable();

  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: env.DATABASE_URL,
    createTableIfMissing: true,
    ttl: 7 * 24 * 60 * 60,
    tableName: "sessions",
  });

  app.use(
    session({
      secret: env.SESSION_SECRET,
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        maxAge: 7 * 24 * 60 * 60 * 1000,
        sameSite: "lax",
      },
    }),
  );

  app.post("/api/auth/register", async (req, res) => {
    try {
      const parsed = credentialsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { code: "invalid_input", message: parsed.error.issues[0]?.message ?? "Invalid input" },
        });
      }
      const { email, password, firstName, lastName } = parsed.data;

      const existing = await db.select().from(users).where(eq(users.email, email));
      if (existing.length > 0) {
        return res.status(409).json({
          error: { code: "email_taken", message: "An account with this email already exists" },
        });
      }

      const passwordHash = await hashPassword(password);

      const [user] = await db
        .insert(users)
        .values({
          email,
          firstName: firstName || null,
          lastName: lastName || null,
          profileImageUrl: null,
        })
        .returning();

      await db
        .insert(userPasswords)
        .values({ userId: user.id, passwordHash })
        .onConflictDoUpdate({
          target: userPasswords.userId,
          set: { passwordHash, updatedAt: new Date() },
        });

      (req.session as any).userId = user.id;
      (req.session as any).claims = {
        sub: user.id,
        email: user.email,
        first_name: user.firstName,
        last_name: user.lastName,
      };
      (req as any).user = { claims: (req.session as any).claims };

      res.status(201).json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      });
    } catch (e: any) {
      console.error("Registration error:", e?.message ?? e);
      res.status(500).json({ error: { code: "internal", message: "Registration failed" } });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { code: "invalid_input", message: "Email and password are required" },
        });
      }
      const { email, password } = parsed.data;

      const [user] = await db.select().from(users).where(eq(users.email, email));
      if (!user) {
        return res.status(401).json({
          error: { code: "invalid_credentials", message: "Invalid email or password" },
        });
      }

      const [credential] = await db
        .select()
        .from(userPasswords)
        .where(eq(userPasswords.userId, user.id));

      if (!credential) {
        return res.status(401).json({
          error: { code: "invalid_credentials", message: "Invalid email or password" },
        });
      }

      const ok = await verifyPassword(credential.passwordHash, password);
      if (!ok) {
        return res.status(401).json({
          error: { code: "invalid_credentials", message: "Invalid email or password" },
        });
      }

      // Upgrade legacy SHA-256 hashes to argon2id on successful login.
      if (isLegacyHash(credential.passwordHash)) {
        try {
          const upgraded = await hashPassword(password);
          await db
            .update(userPasswords)
            .set({ passwordHash: upgraded, updatedAt: new Date() })
            .where(eq(userPasswords.userId, user.id));
        } catch (e) {
          // Non-fatal: login still succeeds, upgrade will retry next time.
          console.error("Password hash upgrade failed:", (e as any)?.message ?? e);
        }
      }

      (req.session as any).userId = user.id;
      (req.session as any).claims = {
        sub: user.id,
        email: user.email,
        first_name: user.firstName,
        last_name: user.lastName,
      };
      (req as any).user = { claims: (req.session as any).claims };

      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      });
    } catch (e: any) {
      console.error("Login error:", e?.message ?? e);
      res.status(500).json({ error: { code: "internal", message: "Login failed" } });
    }
  });

  app.get("/api/auth/user", (req, res) => {
    const session = req.session as any;
    if (!session.userId) {
      return res
        .status(401)
        .json({ error: { code: "unauthorized", message: "Unauthorized" } });
    }
    res.json({
      id: session.userId,
      email: session.claims?.email,
      firstName: session.claims?.first_name,
      lastName: session.claims?.last_name,
    });
  });

  // Ensure the password_reset_tokens table exists at boot.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      used_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `);

  app.post("/api/auth/forgot-password", async (req, res) => {
    // Always return the same neutral response to prevent email enumeration.
    const NEUTRAL = { message: "If an account with that email exists, you will receive a reset link shortly." };

    try {
      const parsed = z.object({ email: z.string().trim().toLowerCase().email() }).safeParse(req.body);
      if (!parsed.success) return res.json(NEUTRAL);

      const { email } = parsed.data;
      const [user] = await db.select().from(users).where(eq(users.email, email));
      if (!user) return res.json(NEUTRAL);

      // Generate a cryptographically random token.
      const rawToken = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      await db.insert(passwordResetTokens).values({ userId: user.id, tokenHash, expiresAt });

      // Build the reset URL. In production use the request origin; fall back to localhost.
      const origin = env.NODE_ENV === "production"
        ? `${req.protocol}://${req.get("host")}`
        : "http://localhost:5000";
      const resetUrl = `${origin}/reset-password?token=${rawToken}`;

      await sendPasswordResetEmail(email, resetUrl).catch((e) => {
        console.error("[Auth] Failed to send reset email:", e?.message ?? e);
      });

      return res.json(NEUTRAL);
    } catch (e: any) {
      console.error("Forgot-password error:", e?.message ?? e);
      return res.json({ message: "If an account with that email exists, you will receive a reset link shortly." });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const parsed = z
        .object({
          token: z.string().min(1),
          password: z.string().min(12, "Password must be at least 12 characters").max(1024),
        })
        .safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          error: { code: "invalid_input", message: parsed.error.issues[0]?.message ?? "Invalid input" },
        });
      }

      const { token, password } = parsed.data;
      const tokenHash = createHash("sha256").update(token).digest("hex");

      const [record] = await db
        .select()
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.tokenHash, tokenHash),
            isNull(passwordResetTokens.usedAt),
            gt(passwordResetTokens.expiresAt, new Date()),
          ),
        );

      if (!record) {
        return res.status(400).json({
          error: { code: "invalid_token", message: "This reset link is invalid or has expired. Please request a new one." },
        });
      }

      const passwordHash = await hashPassword(password);

      await db
        .insert(userPasswords)
        .values({ userId: record.userId, passwordHash })
        .onConflictDoUpdate({
          target: userPasswords.userId,
          set: { passwordHash, updatedAt: new Date() },
        });

      // Mark token as used so it can't be replayed.
      await db
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, record.id));

      return res.json({ message: "Password updated successfully. You can now sign in." });
    } catch (e: any) {
      console.error("Reset-password error:", e?.message ?? e);
      return res.status(500).json({ error: { code: "internal", message: "Password reset failed. Please try again." } });
    }
  });

  app.get("/api/login", (_req, res) => {
    res.redirect("/auth");
  });

  app.get("/api/logout", (req, res) => {
    req.session.destroy(() => {
      res.redirect("/");
    });
  });
}

let cachedIsAuthenticated: RequestHandler | null = null;

export function setIsAuthenticated(handler: RequestHandler) {
  cachedIsAuthenticated = handler;
}

export function getIsAuthenticated(): RequestHandler {
  return cachedIsAuthenticated || standaloneIsAuthenticated;
}

const standaloneIsAuthenticated: RequestHandler = (req, res, next) => {
  const session = req.session as any;
  if (!session.userId) {
    return res
      .status(401)
      .json({ error: { code: "unauthorized", message: "Unauthorized" } });
  }
  (req as any).user = { claims: session.claims };
  next();
};
