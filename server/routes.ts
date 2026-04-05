import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuthAdapter, getIsAuthenticated } from "./auth-adapter";
import { createHash, randomBytes } from "crypto";
import { z, ZodError } from "zod";
import rateLimit from "express-rate-limit";

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function generateApiKey(): string {
  return "csd_" + randomBytes(32).toString("hex");
}

// Standardised error envelope.
function errorResponse(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  return res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
}

function zodError(res: Response, err: ZodError) {
  return errorResponse(res, 400, "invalid_input", err.issues[0]?.message ?? "Invalid input", {
    issues: err.issues.map((i) => ({ path: i.path, message: i.message })),
  });
}

// Reusable query param schemas. z.coerce.number handles parseInt+NaN correctly.
const intId = z.coerce.number().int().positive();
const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

const listCountiesSchema = paginationSchema;

const listDistrictsSchema = paginationSchema.extend({
  county_id: intId.optional(),
  search: z.string().trim().min(1).max(200).optional(),
});

const listSchoolsSchema = paginationSchema.extend({
  district_id: intId.optional(),
  county_id: intId.optional(),
  search: z.string().trim().min(1).max(200).optional(),
});

const listPerformanceSchema = paginationSchema.extend({
  school_id: intId.optional(),
  district_id: intId.optional(),
  county_id: intId.optional(),
  indicator_id: intId.optional(),
  student_group_id: intId.optional(),
  academic_year: z
    .string()
    .trim()
    .regex(/^\d{4}(-\d{2,4})?$/, "academic_year must match YYYY or YYYY-YY")
    .optional(),
});

const usageQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

const createApiKeySchema = z.object({
  name: z.string().trim().min(1, "Key name is required").max(100, "Key name too long"),
});

const idParamSchema = z.object({ id: intId });

// Rate limiters. Keyed by IP for anon endpoints, by API key id for /api/v1/*.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts / 15min / IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "rate_limited", message: "Too many auth attempts. Try again later." } },
});

const keyMgmtLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as any).user?.claims?.sub ?? req.ip ?? "anon",
  message: { error: { code: "rate_limited", message: "Too many key management requests." } },
});

const publicApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 120 req/min per api key
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as any).apiKeyRecord?.id?.toString() ?? req.ip ?? "anon",
  message: { error: { code: "rate_limited", message: "Rate limit exceeded for API key." } },
});

async function authenticateApiKey(req: any, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const apiKeyRaw = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!apiKeyRaw) {
    return errorResponse(
      res,
      401,
      "api_key_required",
      "API key required. Provide via Authorization: Bearer <key> header.",
    );
  }

  const keyHash = hashApiKey(apiKeyRaw);
  const apiKey = await storage.getApiKeyByHash(keyHash);

  if (!apiKey) {
    return errorResponse(res, 401, "invalid_api_key", "Invalid API key.");
  }

  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return errorResponse(res, 401, "api_key_expired", "API key has expired.");
  }

  const startTime = Date.now();
  req.apiKeyRecord = apiKey;

  res.on("finish", async () => {
    try {
      await storage.updateApiKeyLastUsed(apiKey.id);
      await storage.logApiUsage({
        apiKeyId: apiKey.id,
        userId: apiKey.userId,
        endpoint: req.path,
        method: req.method,
        statusCode: res.statusCode,
        responseTimeMs: Date.now() - startTime,
      });
    } catch (e) {
      console.error("Failed to log API usage:", e);
    }
  });

  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  // Minimal public liveness probe. No data, no DB state leakage.
  app.get("/api/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Detailed health (DB state + counts) requires session auth — this is
  // operational metadata, not public platform stats.
  app.get("/api/health", async (_req, res) => {
    // Registered AFTER setupAuthAdapter below so isAuthenticated exists.
    // We re-register the handler after auth setup; placeholder here just
    // keeps route ordering stable if something hits it mid-boot.
    res.status(503).json({ error: { code: "unavailable", message: "Not ready" } });
  });

  await setupAuthAdapter(app);
  const isAuthenticated = getIsAuthenticated();

  // Apply auth rate limiter to all /api/auth/* endpoints registered by the adapter.
  app.use("/api/auth", authLimiter);

  // Replace placeholder /api/health with the real auth-gated handler.
  app._router?.stack?.forEach?.(() => {}); // no-op; we simply register a new route below.
  app.get("/api/health", isAuthenticated, async (_req, res) => {
    try {
      const stats = await storage.getOverviewStats();
      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        database: "connected",
        data: { counties: stats.counties, schools: stats.schools },
      });
    } catch (e) {
      res
        .status(503)
        .json({ status: "unhealthy", timestamp: new Date().toISOString(), database: "disconnected" });
    }
  });

  // Public REST API — Bearer-auth + per-key rate limit.
  const v1 = [authenticateApiKey, publicApiLimiter] as const;

  app.get("/api/v1/counties", ...v1, async (req, res) => {
    const parsed = listCountiesSchema.safeParse(req.query);
    if (!parsed.success) return zodError(res, parsed.error);
    const { limit, offset } = parsed.data;
    try {
      const [data, total] = await Promise.all([
        storage.getCounties(limit, offset),
        storage.getCountiesCount(),
      ]);
      res.json({ data, pagination: { total, limit, offset, hasMore: offset + limit < total } });
    } catch (e) {
      errorResponse(res, 500, "internal", "Internal server error");
    }
  });

  app.get("/api/v1/counties/:code", ...v1, async (req, res) => {
    try {
      const county = await storage.getCountyByCode(req.params.code as string);
      if (!county) return errorResponse(res, 404, "not_found", "County not found");
      res.json({ data: county });
    } catch (e) {
      errorResponse(res, 500, "internal", "Internal server error");
    }
  });

  app.get("/api/v1/districts", ...v1, async (req, res) => {
    const parsed = listDistrictsSchema.safeParse(req.query);
    if (!parsed.success) return zodError(res, parsed.error);
    const { limit, offset, county_id, search } = parsed.data;
    try {
      const [data, total] = await Promise.all([
        storage.getDistricts(county_id, limit, offset, search),
        storage.getDistrictsCount(county_id, search),
      ]);
      res.json({ data, pagination: { total, limit, offset, hasMore: offset + limit < total } });
    } catch (e) {
      errorResponse(res, 500, "internal", "Internal server error");
    }
  });

  app.get("/api/v1/districts/:code", ...v1, async (req, res) => {
    try {
      const district = await storage.getDistrictByCode(req.params.code as string);
      if (!district) return errorResponse(res, 404, "not_found", "District not found");
      res.json({ data: district });
    } catch (e) {
      errorResponse(res, 500, "internal", "Internal server error");
    }
  });

  app.get("/api/v1/schools", ...v1, async (req, res) => {
    const parsed = listSchoolsSchema.safeParse(req.query);
    if (!parsed.success) return zodError(res, parsed.error);
    const { limit, offset, district_id, county_id, search } = parsed.data;
    try {
      const [data, total] = await Promise.all([
        storage.getSchools(district_id, county_id, limit, offset, search),
        storage.getSchoolsCount(district_id, county_id, search),
      ]);
      res.json({ data, pagination: { total, limit, offset, hasMore: offset + limit < total } });
    } catch (e) {
      errorResponse(res, 500, "internal", "Internal server error");
    }
  });

  app.get("/api/v1/schools/:code", ...v1, async (req, res) => {
    try {
      const school = await storage.getSchoolByCode(req.params.code as string);
      if (!school) return errorResponse(res, 404, "not_found", "School not found");
      res.json({ data: school });
    } catch (e) {
      errorResponse(res, 500, "internal", "Internal server error");
    }
  });

  app.get("/api/v1/indicators", ...v1, async (_req, res) => {
    try {
      const data = await storage.getIndicators();
      res.json({ data });
    } catch (e) {
      errorResponse(res, 500, "internal", "Internal server error");
    }
  });

  app.get("/api/v1/student-groups", ...v1, async (_req, res) => {
    try {
      const data = await storage.getStudentGroups();
      res.json({ data });
    } catch (e) {
      errorResponse(res, 500, "internal", "Internal server error");
    }
  });

  app.get("/api/v1/performance", ...v1, async (req, res) => {
    const parsed = listPerformanceSchema.safeParse(req.query);
    if (!parsed.success) return zodError(res, parsed.error);
    const {
      limit,
      offset,
      school_id,
      district_id,
      county_id,
      indicator_id,
      student_group_id,
      academic_year,
    } = parsed.data;
    const filters = {
      schoolId: school_id,
      districtId: district_id,
      countyId: county_id,
      indicatorId: indicator_id,
      studentGroupId: student_group_id,
      academicYear: academic_year,
      limit,
      offset,
    };
    try {
      const [data, total] = await Promise.all([
        storage.getPerformanceData(filters),
        storage.getPerformanceDataCount(filters),
      ]);
      res.json({
        data,
        pagination: { total, limit, offset, hasMore: offset + limit < total },
      });
    } catch (e) {
      errorResponse(res, 500, "internal", "Internal server error");
    }
  });

  app.get("/api/v1/overview", ...v1, async (_req, res) => {
    try {
      const stats = await storage.getOverviewStats();
      res.json({ data: stats });
    } catch (e) {
      errorResponse(res, 500, "internal", "Internal server error");
    }
  });

  // Key management — session-auth'd, rate-limited per user.
  app.post("/api/keys", isAuthenticated, keyMgmtLimiter, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const parsed = createApiKeySchema.safeParse(req.body);
      if (!parsed.success) return zodError(res, parsed.error);
      const { name } = parsed.data;

      // Cap keys per user to limit blast radius of credential theft.
      const existing = await storage.getApiKeysByUser(userId);
      const activeCount = existing.filter((k) => k.isActive).length;
      if (activeCount >= 20) {
        return errorResponse(
          res,
          409,
          "key_limit_reached",
          "Maximum number of active API keys reached. Deactivate unused keys first.",
        );
      }

      const rawKey = generateApiKey();
      const keyHash = hashApiKey(rawKey);
      const keyPrefix = rawKey.substring(0, 11);

      const apiKey = await storage.createApiKey({
        userId,
        name,
        keyHash,
        keyPrefix,
        isActive: true,
        expiresAt: null,
      });

      res.status(201).json({
        id: apiKey.id,
        name: apiKey.name,
        key: rawKey,
        keyPrefix: apiKey.keyPrefix,
        createdAt: apiKey.createdAt,
        message: "Save this key securely. It will not be shown again.",
      });
    } catch (e) {
      errorResponse(res, 500, "internal", "Failed to create API key");
    }
  });

  app.get("/api/keys", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const keys = await storage.getApiKeysByUser(userId);
      res.json({
        data: keys.map((k) => ({
          id: k.id,
          name: k.name,
          keyPrefix: k.keyPrefix,
          isActive: k.isActive,
          createdAt: k.createdAt,
          lastUsedAt: k.lastUsedAt,
        })),
      });
    } catch (e) {
      errorResponse(res, 500, "internal", "Failed to fetch API keys");
    }
  });

  app.delete("/api/keys/:id", isAuthenticated, keyMgmtLimiter, async (req: any, res) => {
    const parsed = idParamSchema.safeParse(req.params);
    if (!parsed.success) return zodError(res, parsed.error);
    try {
      const userId = req.user.claims.sub;
      await storage.deactivateApiKey(parsed.data.id, userId);
      res.json({ message: "API key deactivated" });
    } catch (e) {
      errorResponse(res, 500, "internal", "Failed to deactivate API key");
    }
  });

  app.get("/api/usage", isAuthenticated, async (req: any, res) => {
    const parsed = usageQuerySchema.safeParse(req.query);
    if (!parsed.success) return zodError(res, parsed.error);
    try {
      const userId = req.user.claims.sub;
      const { days } = parsed.data;
      const [stats, daily] = await Promise.all([
        storage.getApiUsageStats(userId, new Date(Date.now() - days * 86400000)),
        storage.getDailyUsage(userId, days),
      ]);
      res.json({ data: { ...stats, daily } });
    } catch (e) {
      errorResponse(res, 500, "internal", "Failed to fetch usage data");
    }
  });

  // Authenticated platform stats (moved behind session auth).
  app.get("/api/platform/stats", isAuthenticated, async (_req, res) => {
    try {
      const stats = await storage.getOverviewStats();
      res.json({ data: stats });
    } catch (e) {
      errorResponse(res, 500, "internal", "Internal server error");
    }
  });

  app.get("/api/ingestion/logs", isAuthenticated, async (_req, res) => {
    try {
      const logs = await storage.getIngestionLogs();
      res.json({ data: logs });
    } catch (e) {
      errorResponse(res, 500, "internal", "Internal server error");
    }
  });

  // JSON 404 for any unmatched /api/* request — must be registered last
  // among the /api routes and before the SPA catch-all.
  app.use("/api", (_req, res) => {
    errorResponse(res, 404, "not_found", "API endpoint not found");
  });

  return httpServer;
}
