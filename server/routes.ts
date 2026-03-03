import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { createHash, randomBytes } from "crypto";
import { z } from "zod";

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function generateApiKey(): string {
  return "csd_" + randomBytes(32).toString("hex");
}

const createApiKeySchema = z.object({
  name: z.string().min(1, "Key name is required").max(100, "Key name too long"),
});

async function authenticateApiKey(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  const apiKeyRaw = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!apiKeyRaw) {
    return res.status(401).json({ error: "API key required. Provide via Authorization: Bearer <key> header." });
  }

  const keyHash = hashApiKey(apiKeyRaw);
  const apiKey = await storage.getApiKeyByHash(keyHash);

  if (!apiKey) {
    return res.status(401).json({ error: "Invalid API key." });
  }

  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return res.status(401).json({ error: "API key has expired." });
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
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);

  app.get("/api/v1/counties", authenticateApiKey, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const offset = parseInt(req.query.offset as string) || 0;
      const [data, total] = await Promise.all([
        storage.getCounties(limit, offset),
        storage.getCountiesCount(),
      ]);
      res.json({ data, pagination: { total, limit, offset, hasMore: offset + limit < total } });
    } catch (e) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/v1/counties/:code", authenticateApiKey, async (req, res) => {
    try {
      const county = await storage.getCountyByCode(req.params.code);
      if (!county) return res.status(404).json({ error: "County not found" });
      res.json({ data: county });
    } catch (e) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/v1/districts", authenticateApiKey, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const offset = parseInt(req.query.offset as string) || 0;
      const countyId = req.query.county_id ? parseInt(req.query.county_id as string) : undefined;
      const search = req.query.search as string | undefined;
      const [data, total] = await Promise.all([
        storage.getDistricts(countyId, limit, offset, search),
        storage.getDistrictsCount(countyId, search),
      ]);
      res.json({ data, pagination: { total, limit, offset, hasMore: offset + limit < total } });
    } catch (e) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/v1/districts/:code", authenticateApiKey, async (req, res) => {
    try {
      const district = await storage.getDistrictByCode(req.params.code);
      if (!district) return res.status(404).json({ error: "District not found" });
      res.json({ data: district });
    } catch (e) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/v1/schools", authenticateApiKey, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const offset = parseInt(req.query.offset as string) || 0;
      const districtId = req.query.district_id ? parseInt(req.query.district_id as string) : undefined;
      const countyId = req.query.county_id ? parseInt(req.query.county_id as string) : undefined;
      const search = req.query.search as string | undefined;
      const [data, total] = await Promise.all([
        storage.getSchools(districtId, countyId, limit, offset, search),
        storage.getSchoolsCount(districtId, countyId, search),
      ]);
      res.json({ data, pagination: { total, limit, offset, hasMore: offset + limit < total } });
    } catch (e) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/v1/schools/:code", authenticateApiKey, async (req, res) => {
    try {
      const school = await storage.getSchoolByCode(req.params.code);
      if (!school) return res.status(404).json({ error: "School not found" });
      res.json({ data: school });
    } catch (e) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/v1/indicators", authenticateApiKey, async (req, res) => {
    try {
      const data = await storage.getIndicators();
      res.json({ data });
    } catch (e) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/v1/student-groups", authenticateApiKey, async (req, res) => {
    try {
      const data = await storage.getStudentGroups();
      res.json({ data });
    } catch (e) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/v1/performance", authenticateApiKey, async (req, res) => {
    try {
      const filters = {
        schoolId: req.query.school_id ? parseInt(req.query.school_id as string) : undefined,
        districtId: req.query.district_id ? parseInt(req.query.district_id as string) : undefined,
        countyId: req.query.county_id ? parseInt(req.query.county_id as string) : undefined,
        indicatorId: req.query.indicator_id ? parseInt(req.query.indicator_id as string) : undefined,
        studentGroupId: req.query.student_group_id ? parseInt(req.query.student_group_id as string) : undefined,
        academicYear: req.query.academic_year as string | undefined,
        limit: Math.min(parseInt(req.query.limit as string) || 100, 500),
        offset: parseInt(req.query.offset as string) || 0,
      };
      const [data, total] = await Promise.all([
        storage.getPerformanceData(filters),
        storage.getPerformanceDataCount(filters),
      ]);
      res.json({ data, pagination: { total, limit: filters.limit, offset: filters.offset, hasMore: filters.offset + filters.limit < total } });
    } catch (e) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/v1/overview", authenticateApiKey, async (req, res) => {
    try {
      const stats = await storage.getOverviewStats();
      res.json({ data: stats });
    } catch (e) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/keys", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const parsed = createApiKeySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid input" });
      }
      const { name } = parsed.data;

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
      res.status(500).json({ error: "Failed to create API key" });
    }
  });

  app.get("/api/keys", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const keys = await storage.getApiKeysByUser(userId);
      res.json({ data: keys.map(k => ({ id: k.id, name: k.name, keyPrefix: k.keyPrefix, isActive: k.isActive, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt })) });
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch API keys" });
    }
  });

  app.delete("/api/keys/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);
      await storage.deactivateApiKey(id, userId);
      res.json({ message: "API key deactivated" });
    } catch (e) {
      res.status(500).json({ error: "Failed to deactivate API key" });
    }
  });

  app.get("/api/usage", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const days = parseInt(req.query.days as string) || 30;
      const [stats, daily] = await Promise.all([
        storage.getApiUsageStats(userId, new Date(Date.now() - days * 86400000)),
        storage.getDailyUsage(userId, days),
      ]);
      res.json({ data: { ...stats, daily } });
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch usage data" });
    }
  });

  app.get("/api/platform/stats", async (req, res) => {
    try {
      const stats = await storage.getOverviewStats();
      res.json({ data: stats });
    } catch (e) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/ingestion/logs", isAuthenticated, async (req, res) => {
    try {
      const logs = await storage.getIngestionLogs();
      res.json({ data: logs });
    } catch (e) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return httpServer;
}
