import type { Express, RequestHandler } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { createHash, randomBytes } from "crypto";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { users } from "@shared/schema";

function isReplitEnvironment(): boolean {
  return !!process.env.REPL_ID && !!process.env.ISSUER_URL;
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

  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
    ttl: 7 * 24 * 60 * 60,
    tableName: "sessions",
  });

  app.use(
    session({
      secret: process.env.SESSION_SECRET!,
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 7 * 24 * 60 * 60 * 1000,
        sameSite: "lax",
      },
    })
  );

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, firstName, lastName } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      const existing = await db.select().from(users).where(eq(users.email, email));
      if (existing.length > 0) {
        return res.status(409).json({ error: "An account with this email already exists" });
      }

      const salt = randomBytes(16).toString("hex");
      const hash = createHash("sha256").update(password + salt).digest("hex");
      const passwordHash = `${salt}:${hash}`;

      const [user] = await db
        .insert(users)
        .values({
          email,
          firstName: firstName || null,
          lastName: lastName || null,
          profileImageUrl: null,
        })
        .returning();

      await db.execute(
        `CREATE TABLE IF NOT EXISTS user_passwords (user_id VARCHAR PRIMARY KEY REFERENCES users(id), password_hash TEXT NOT NULL)`
      );
      await db.execute(
        `INSERT INTO user_passwords (user_id, password_hash) VALUES ('${user.id}', '${passwordHash}') ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash`
      );

      (req.session as any).userId = user.id;
      (req.session as any).claims = { sub: user.id, email: user.email, first_name: user.firstName, last_name: user.lastName };
      (req as any).user = { claims: (req.session as any).claims };

      res.status(201).json({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName });
    } catch (e: any) {
      console.error("Registration error:", e);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      const [user] = await db.select().from(users).where(eq(users.email, email));
      if (!user) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const result = await db.execute(`SELECT password_hash FROM user_passwords WHERE user_id = '${user.id}'`);
      const rows = result.rows as any[];
      if (!rows || rows.length === 0) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const storedHash = rows[0].password_hash;
      const [salt, hash] = storedHash.split(":");
      const attemptHash = createHash("sha256").update(password + salt).digest("hex");

      if (hash !== attemptHash) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      (req.session as any).userId = user.id;
      (req.session as any).claims = { sub: user.id, email: user.email, first_name: user.firstName, last_name: user.lastName };
      (req as any).user = { claims: (req.session as any).claims };

      res.json({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName });
    } catch (e: any) {
      console.error("Login error:", e);
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.get("/api/auth/user", (req, res) => {
    const session = req.session as any;
    if (!session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    res.json({
      id: session.userId,
      email: session.claims?.email,
      firstName: session.claims?.first_name,
      lastName: session.claims?.last_name,
    });
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
    return res.status(401).json({ message: "Unauthorized" });
  }
  (req as any).user = { claims: session.claims };
  next();
};
