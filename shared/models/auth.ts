import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // SCHEMA-05: email is nullable (Replit-auth users may not provide one).
  // The standard UNIQUE constraint correctly allows multiple NULLs in
  // PostgreSQL while still preventing duplicate non-null emails.
  // A partial unique index (WHERE email IS NOT NULL) is added in the SQL
  // migration file as explicit documentation of intent; the behavior is
  // identical to the standard constraint for non-null values.
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Password credentials for the standalone (non-Replit) auth flow.
// The hash column stores the full encoded hash string (e.g. an argon2id
// PHC string like "$argon2id$v=19$m=19456,t=2,p=1$..."). For backwards
// compatibility it may also contain a legacy "salt:sha256hex" value,
// which is transparently upgraded to argon2 on next login.
export const userPasswords = pgTable("user_passwords", {
  userId: varchar("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type UserPassword = typeof userPasswords.$inferSelect;

// Tokens for the password-reset flow.
// The raw token is sent to the user's email; only the SHA-256 hash is stored.
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
