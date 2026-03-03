import {
  counties, districts, schools, indicators, studentGroups, performanceData,
  apiKeys, apiUsageLogs, dataIngestionLogs,
  type County, type InsertCounty,
  type District, type InsertDistrict,
  type School, type InsertSchool,
  type Indicator, type InsertIndicator,
  type StudentGroup, type InsertStudentGroup,
  type PerformanceData, type InsertPerformanceData,
  type ApiKey, type InsertApiKey,
  type ApiUsageLog, type InsertApiUsageLog,
  type DataIngestionLog, type InsertDataIngestionLog,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, sql, desc, gte, lte, count, ilike } from "drizzle-orm";

export interface IStorage {
  getCounties(limit?: number, offset?: number): Promise<County[]>;
  getCountyByCode(code: string): Promise<County | undefined>;
  getCountyById(id: number): Promise<County | undefined>;
  createCounty(data: InsertCounty): Promise<County>;
  getCountiesCount(): Promise<number>;

  getDistricts(countyId?: number, limit?: number, offset?: number, search?: string): Promise<District[]>;
  getDistrictByCode(code: string): Promise<District | undefined>;
  getDistrictById(id: number): Promise<District | undefined>;
  createDistrict(data: InsertDistrict): Promise<District>;
  getDistrictsCount(countyId?: number, search?: string): Promise<number>;

  getSchools(districtId?: number, countyId?: number, limit?: number, offset?: number, search?: string): Promise<School[]>;
  getSchoolByCode(code: string): Promise<School | undefined>;
  getSchoolById(id: number): Promise<School | undefined>;
  createSchool(data: InsertSchool): Promise<School>;
  getSchoolsCount(districtId?: number, countyId?: number, search?: string): Promise<number>;

  getIndicators(): Promise<Indicator[]>;
  getIndicatorByCode(code: string): Promise<Indicator | undefined>;
  createIndicator(data: InsertIndicator): Promise<Indicator>;

  getStudentGroups(): Promise<StudentGroup[]>;
  getStudentGroupByCode(code: string): Promise<StudentGroup | undefined>;
  createStudentGroup(data: InsertStudentGroup): Promise<StudentGroup>;

  getPerformanceData(filters: {
    schoolId?: number;
    districtId?: number;
    countyId?: number;
    indicatorId?: number;
    studentGroupId?: number;
    academicYear?: string;
    limit?: number;
    offset?: number;
  }): Promise<PerformanceData[]>;
  getPerformanceDataCount(filters: {
    schoolId?: number;
    districtId?: number;
    countyId?: number;
    indicatorId?: number;
    studentGroupId?: number;
    academicYear?: string;
  }): Promise<number>;
  createPerformanceData(data: InsertPerformanceData): Promise<PerformanceData>;
  bulkCreatePerformanceData(data: InsertPerformanceData[]): Promise<number>;

  createApiKey(data: InsertApiKey): Promise<ApiKey>;
  getApiKeysByUser(userId: string): Promise<ApiKey[]>;
  getApiKeyByHash(hash: string): Promise<ApiKey | undefined>;
  deactivateApiKey(id: number, userId: string): Promise<void>;
  updateApiKeyLastUsed(id: number): Promise<void>;

  logApiUsage(data: InsertApiUsageLog): Promise<ApiUsageLog>;
  getApiUsageByUser(userId: string, from?: Date, to?: Date): Promise<ApiUsageLog[]>;
  getApiUsageStats(userId: string, from?: Date): Promise<{ totalRequests: number; endpoints: Record<string, number> }>;
  getDailyUsage(userId: string, days?: number): Promise<{ date: string; count: number }[]>;

  createIngestionLog(data: InsertDataIngestionLog): Promise<DataIngestionLog>;
  updateIngestionLog(id: number, data: Partial<DataIngestionLog>): Promise<void>;
  getIngestionLogs(limit?: number): Promise<DataIngestionLog[]>;

  getOverviewStats(): Promise<{ counties: number; districts: number; schools: number; indicators: number; dataPoints: number }>;
}

export class DatabaseStorage implements IStorage {
  async getCounties(limit = 100, offset = 0): Promise<County[]> {
    return db.select().from(counties).limit(limit).offset(offset).orderBy(counties.name);
  }

  async getCountyByCode(code: string): Promise<County | undefined> {
    const [c] = await db.select().from(counties).where(eq(counties.code, code));
    return c;
  }

  async getCountyById(id: number): Promise<County | undefined> {
    const [c] = await db.select().from(counties).where(eq(counties.id, id));
    return c;
  }

  async createCounty(data: InsertCounty): Promise<County> {
    const [c] = await db.insert(counties).values(data).returning();
    return c;
  }

  async getCountiesCount(): Promise<number> {
    const [r] = await db.select({ count: count() }).from(counties);
    return r.count;
  }

  async getDistricts(countyId?: number, limit = 100, offset = 0, search?: string): Promise<District[]> {
    const conditions = [];
    if (countyId) conditions.push(eq(districts.countyId, countyId));
    if (search) conditions.push(ilike(districts.name, `%${search}%`));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return db.select().from(districts).where(where).limit(limit).offset(offset).orderBy(districts.name);
  }

  async getDistrictByCode(code: string): Promise<District | undefined> {
    const [d] = await db.select().from(districts).where(eq(districts.code, code));
    return d;
  }

  async getDistrictById(id: number): Promise<District | undefined> {
    const [d] = await db.select().from(districts).where(eq(districts.id, id));
    return d;
  }

  async createDistrict(data: InsertDistrict): Promise<District> {
    const [d] = await db.insert(districts).values(data).returning();
    return d;
  }

  async getDistrictsCount(countyId?: number, search?: string): Promise<number> {
    const conditions = [];
    if (countyId) conditions.push(eq(districts.countyId, countyId));
    if (search) conditions.push(ilike(districts.name, `%${search}%`));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [r] = await db.select({ count: count() }).from(districts).where(where);
    return r.count;
  }

  async getSchools(districtId?: number, countyId?: number, limit = 100, offset = 0, search?: string): Promise<School[]> {
    const conditions = [];
    if (districtId) conditions.push(eq(schools.districtId, districtId));
    if (countyId) conditions.push(eq(schools.countyId, countyId));
    if (search) conditions.push(ilike(schools.name, `%${search}%`));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return db.select().from(schools).where(where).limit(limit).offset(offset).orderBy(schools.name);
  }

  async getSchoolByCode(code: string): Promise<School | undefined> {
    const [s] = await db.select().from(schools).where(eq(schools.code, code));
    return s;
  }

  async getSchoolById(id: number): Promise<School | undefined> {
    const [s] = await db.select().from(schools).where(eq(schools.id, id));
    return s;
  }

  async createSchool(data: InsertSchool): Promise<School> {
    const [s] = await db.insert(schools).values(data).returning();
    return s;
  }

  async getSchoolsCount(districtId?: number, countyId?: number, search?: string): Promise<number> {
    const conditions = [];
    if (districtId) conditions.push(eq(schools.districtId, districtId));
    if (countyId) conditions.push(eq(schools.countyId, countyId));
    if (search) conditions.push(ilike(schools.name, `%${search}%`));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [r] = await db.select({ count: count() }).from(schools).where(where);
    return r.count;
  }

  async getIndicators(): Promise<Indicator[]> {
    return db.select().from(indicators).orderBy(indicators.category, indicators.name);
  }

  async getIndicatorByCode(code: string): Promise<Indicator | undefined> {
    const [i] = await db.select().from(indicators).where(eq(indicators.code, code));
    return i;
  }

  async createIndicator(data: InsertIndicator): Promise<Indicator> {
    const [i] = await db.insert(indicators).values(data).returning();
    return i;
  }

  async getStudentGroups(): Promise<StudentGroup[]> {
    return db.select().from(studentGroups).orderBy(studentGroups.name);
  }

  async getStudentGroupByCode(code: string): Promise<StudentGroup | undefined> {
    const [sg] = await db.select().from(studentGroups).where(eq(studentGroups.code, code));
    return sg;
  }

  async createStudentGroup(data: InsertStudentGroup): Promise<StudentGroup> {
    const [sg] = await db.insert(studentGroups).values(data).returning();
    return sg;
  }

  async getPerformanceData(filters: {
    schoolId?: number;
    districtId?: number;
    countyId?: number;
    indicatorId?: number;
    studentGroupId?: number;
    academicYear?: string;
    limit?: number;
    offset?: number;
  }): Promise<PerformanceData[]> {
    const conditions = [];
    if (filters.schoolId) conditions.push(eq(performanceData.schoolId, filters.schoolId));
    if (filters.districtId) conditions.push(eq(performanceData.districtId, filters.districtId));
    if (filters.countyId) conditions.push(eq(performanceData.countyId, filters.countyId));
    if (filters.indicatorId) conditions.push(eq(performanceData.indicatorId, filters.indicatorId));
    if (filters.studentGroupId) conditions.push(eq(performanceData.studentGroupId, filters.studentGroupId));
    if (filters.academicYear) conditions.push(eq(performanceData.academicYear, filters.academicYear));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return db.select().from(performanceData).where(where)
      .limit(filters.limit || 100).offset(filters.offset || 0);
  }

  async getPerformanceDataCount(filters: {
    schoolId?: number;
    districtId?: number;
    countyId?: number;
    indicatorId?: number;
    studentGroupId?: number;
    academicYear?: string;
  }): Promise<number> {
    const conditions = [];
    if (filters.schoolId) conditions.push(eq(performanceData.schoolId, filters.schoolId));
    if (filters.districtId) conditions.push(eq(performanceData.districtId, filters.districtId));
    if (filters.countyId) conditions.push(eq(performanceData.countyId, filters.countyId));
    if (filters.indicatorId) conditions.push(eq(performanceData.indicatorId, filters.indicatorId));
    if (filters.studentGroupId) conditions.push(eq(performanceData.studentGroupId, filters.studentGroupId));
    if (filters.academicYear) conditions.push(eq(performanceData.academicYear, filters.academicYear));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [r] = await db.select({ count: count() }).from(performanceData).where(where);
    return r.count;
  }

  async createPerformanceData(data: InsertPerformanceData): Promise<PerformanceData> {
    const [pd] = await db.insert(performanceData).values(data).returning();
    return pd;
  }

  async bulkCreatePerformanceData(data: InsertPerformanceData[]): Promise<number> {
    if (data.length === 0) return 0;
    const batchSize = 500;
    let inserted = 0;
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      await db.insert(performanceData).values(batch);
      inserted += batch.length;
    }
    return inserted;
  }

  async createApiKey(data: InsertApiKey): Promise<ApiKey> {
    const [key] = await db.insert(apiKeys).values(data).returning();
    return key;
  }

  async getApiKeysByUser(userId: string): Promise<ApiKey[]> {
    return db.select().from(apiKeys).where(eq(apiKeys.userId, userId)).orderBy(desc(apiKeys.createdAt));
  }

  async getApiKeyByHash(hash: string): Promise<ApiKey | undefined> {
    const [key] = await db.select().from(apiKeys).where(and(eq(apiKeys.keyHash, hash), eq(apiKeys.isActive, true)));
    return key;
  }

  async deactivateApiKey(id: number, userId: string): Promise<void> {
    await db.update(apiKeys).set({ isActive: false }).where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)));
  }

  async updateApiKeyLastUsed(id: number): Promise<void> {
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, id));
  }

  async logApiUsage(data: InsertApiUsageLog): Promise<ApiUsageLog> {
    const [log] = await db.insert(apiUsageLogs).values(data).returning();
    return log;
  }

  async getApiUsageByUser(userId: string, from?: Date, to?: Date): Promise<ApiUsageLog[]> {
    const conditions = [eq(apiUsageLogs.userId, userId)];
    if (from) conditions.push(gte(apiUsageLogs.createdAt, from));
    if (to) conditions.push(lte(apiUsageLogs.createdAt, to));
    return db.select().from(apiUsageLogs).where(and(...conditions)).orderBy(desc(apiUsageLogs.createdAt)).limit(1000);
  }

  async getApiUsageStats(userId: string, from?: Date): Promise<{ totalRequests: number; endpoints: Record<string, number> }> {
    const conditions = [eq(apiUsageLogs.userId, userId)];
    if (from) conditions.push(gte(apiUsageLogs.createdAt, from));
    const logs = await db.select().from(apiUsageLogs).where(and(...conditions));
    const endpoints: Record<string, number> = {};
    for (const log of logs) {
      endpoints[log.endpoint] = (endpoints[log.endpoint] || 0) + 1;
    }
    return { totalRequests: logs.length, endpoints };
  }

  async getDailyUsage(userId: string, days = 30): Promise<{ date: string; count: number }[]> {
    const from = new Date();
    from.setDate(from.getDate() - days);
    const logs = await db.select().from(apiUsageLogs)
      .where(and(eq(apiUsageLogs.userId, userId), gte(apiUsageLogs.createdAt, from)))
      .orderBy(apiUsageLogs.createdAt);
    const dailyCounts: Record<string, number> = {};
    for (const log of logs) {
      const date = log.createdAt.toISOString().split('T')[0];
      dailyCounts[date] = (dailyCounts[date] || 0) + 1;
    }
    return Object.entries(dailyCounts).map(([date, count]) => ({ date, count }));
  }

  async createIngestionLog(data: InsertDataIngestionLog): Promise<DataIngestionLog> {
    const [log] = await db.insert(dataIngestionLogs).values(data).returning();
    return log;
  }

  async updateIngestionLog(id: number, data: Partial<DataIngestionLog>): Promise<void> {
    await db.update(dataIngestionLogs).set(data).where(eq(dataIngestionLogs.id, id));
  }

  async getIngestionLogs(limit = 50): Promise<DataIngestionLog[]> {
    return db.select().from(dataIngestionLogs).orderBy(desc(dataIngestionLogs.startedAt)).limit(limit);
  }

  async getOverviewStats(): Promise<{ counties: number; districts: number; schools: number; indicators: number; dataPoints: number }> {
    const [c] = await db.select({ count: count() }).from(counties);
    const [d] = await db.select({ count: count() }).from(districts);
    const [s] = await db.select({ count: count() }).from(schools);
    const [i] = await db.select({ count: count() }).from(indicators);
    const [p] = await db.select({ count: count() }).from(performanceData);
    return {
      counties: c.count,
      districts: d.count,
      schools: s.count,
      indicators: i.count,
      dataPoints: p.count,
    };
  }
}

export const storage = new DatabaseStorage();
