import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, serial, timestamp, boolean, real, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";
export * from "./models/chat";

export const counties = pgTable("counties", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 10 }).notNull().unique(),
  name: text("name").notNull(),
  type: varchar("type", { length: 20 }).notNull().default("county"),
});

export const countiesRelations = relations(counties, ({ many }) => ({
  districts: many(districts),
}));

export const districts = pgTable("districts", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  name: text("name").notNull(),
  // SCHEMA-04: CASCADE so deleting a county removes its districts.
  countyId: integer("county_id").notNull().references(() => counties.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 100 }).notNull().default("district"),
});

export const districtsRelations = relations(districts, ({ one, many }) => ({
  county: one(counties, { fields: [districts.countyId], references: [counties.id] }),
  schools: many(schools),
}));

export const schools = pgTable("schools", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  name: text("name").notNull(),
  // SCHEMA-04: CASCADE so deleting a district/county removes its schools.
  districtId: integer("district_id").notNull().references(() => districts.id, { onDelete: "cascade" }),
  countyId: integer("county_id").notNull().references(() => counties.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 100 }).notNull().default("school"),
  gradeSpan: varchar("grade_span", { length: 50 }),
  latitude: real("latitude"),
  longitude: real("longitude"),
  address: text("address"),
  city: text("city"),
  state: varchar("state", { length: 2 }).default("CA"),
  zip: varchar("zip", { length: 10 }),
  phone: varchar("phone", { length: 20 }),
  website: text("website"),
  isActive: boolean("is_active").notNull().default(true),
});

export const schoolsRelations = relations(schools, ({ one, many }) => ({
  district: one(districts, { fields: [schools.districtId], references: [districts.id] }),
  county: one(counties, { fields: [schools.countyId], references: [counties.id] }),
  performanceData: many(performanceData),
}));

export const indicators = pgTable("indicators", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }).notNull(),
});

export const studentGroups = pgTable("student_groups", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  name: text("name").notNull(),
  category: varchar("category", { length: 50 }),
});

export const performanceData = pgTable(
  "performance_data",
  {
    id: serial("id").primaryKey(),
    // SCHEMA-04: CASCADE — deleting a school/district/county removes its rows.
    schoolId: integer("school_id").references(() => schools.id, { onDelete: "cascade" }),
    districtId: integer("district_id").references(() => districts.id, { onDelete: "cascade" }),
    countyId: integer("county_id").references(() => counties.id, { onDelete: "cascade" }),
    // SCHEMA-04: RESTRICT — indicators/groups must not be deleted while rows reference them.
    indicatorId: integer("indicator_id").notNull().references(() => indicators.id, { onDelete: "restrict" }),
    studentGroupId: integer("student_group_id").notNull().references(() => studentGroups.id, { onDelete: "restrict" }),
    academicYear: varchar("academic_year", { length: 10 }).notNull(),
    value: real("value"),
    statusLevel: integer("status_level"),
    statusText: varchar("status_text", { length: 50 }),
    changeLevel: integer("change_level"),
    changeText: varchar("change_text", { length: 50 }),
    color: varchar("color", { length: 20 }),
    enrollmentCount: integer("enrollment_count"),
    denominatorCount: integer("denominator_count"),
    numeratorCount: integer("numerator_count"),
    reportingLevel: varchar("reporting_level", { length: 20 }),
  },
  (table) => [
    // SCHEMA-01: Single-column indexes (kept for backward compat with storage queries).
    index("idx_perf_school").on(table.schoolId),
    index("idx_perf_district").on(table.districtId),
    index("idx_perf_county").on(table.countyId),
    index("idx_perf_indicator").on(table.indicatorId),
    index("idx_perf_year").on(table.academicYear),
    index("idx_perf_group").on(table.studentGroupId),

    // SCHEMA-01: Composite indexes covering the most common filter combos.
    // These make the API's filtered queries fast without full-scan on performance_data.
    index("idx_perf_school_year_ind").on(table.schoolId, table.academicYear, table.indicatorId),
    index("idx_perf_district_year_ind").on(table.districtId, table.academicYear, table.indicatorId),
    index("idx_perf_county_year_ind").on(table.countyId, table.academicYear, table.indicatorId),
    index("idx_perf_ind_group_year").on(table.indicatorId, table.studentGroupId, table.academicYear),

    // SCHEMA-02: Enforce that the school/district/county IDs represent a valid
    // reporting level.  Valid combinations are:
    //   state  : all three NULL
    //   county : only county_id set
    //   district: district_id + county_id set, school_id NULL
    //   school : all three set
    check(
      "chk_perf_level_consistency",
      sql`(
        (school_id IS NULL     AND district_id IS NULL  AND county_id IS NULL)  OR
        (school_id IS NULL     AND district_id IS NULL  AND county_id IS NOT NULL) OR
        (school_id IS NULL     AND district_id IS NOT NULL AND county_id IS NOT NULL) OR
        (school_id IS NOT NULL AND district_id IS NOT NULL AND county_id IS NOT NULL)
      )`,
    ),

    // SCHEMA-03: The full dedupe key uses COALESCE(school_id, 0) etc. so that
    // NULL values at the same reporting level compare as equal.  This requires
    // an expression-based unique index that drizzle-kit cannot express in its
    // schema DSL.  The index is created by the SQL migration file:
    //   migrations/0001_p1_schema_constraints.sql
    // It is intentionally omitted here so that `drizzle-kit push` does not
    // create an incorrect simplified variant that would reject legitimate rows
    // (e.g. two different schools sharing the same indicator/group/year).
  ],
);

export const performanceDataRelations = relations(performanceData, ({ one }) => ({
  school: one(schools, { fields: [performanceData.schoolId], references: [schools.id] }),
  district: one(districts, { fields: [performanceData.districtId], references: [districts.id] }),
  county: one(counties, { fields: [performanceData.countyId], references: [counties.id] }),
  indicator: one(indicators, { fields: [performanceData.indicatorId], references: [indicators.id] }),
  studentGroup: one(studentGroups, { fields: [performanceData.studentGroupId], references: [studentGroups.id] }),
}));

export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  keyPrefix: varchar("key_prefix", { length: 12 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
});

export const apiUsageLogs = pgTable("api_usage_logs", {
  id: serial("id").primaryKey(),
  // SCHEMA-04: CASCADE — delete usage logs when the parent API key is deleted.
  apiKeyId: integer("api_key_id").notNull().references(() => apiKeys.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull(),
  endpoint: text("endpoint").notNull(),
  method: varchar("method", { length: 10 }).notNull(),
  statusCode: integer("status_code"),
  responseTimeMs: integer("response_time_ms"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_usage_key").on(table.apiKeyId),
  index("idx_usage_user").on(table.userId),
  index("idx_usage_created").on(table.createdAt),
]);

export const dataIngestionLogs = pgTable("data_ingestion_logs", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  recordsProcessed: integer("records_processed").default(0),
  recordsFailed: integer("records_failed").default(0),
  details: text("details"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertCountySchema = createInsertSchema(counties).omit({ id: true });
export const insertDistrictSchema = createInsertSchema(districts).omit({ id: true });
export const insertSchoolSchema = createInsertSchema(schools).omit({ id: true });
export const insertIndicatorSchema = createInsertSchema(indicators).omit({ id: true });
export const insertStudentGroupSchema = createInsertSchema(studentGroups).omit({ id: true });
export const insertPerformanceDataSchema = createInsertSchema(performanceData).omit({ id: true });
export const insertApiKeySchema = createInsertSchema(apiKeys).omit({ id: true, createdAt: true, lastUsedAt: true });
export const insertApiUsageLogSchema = createInsertSchema(apiUsageLogs).omit({ id: true, createdAt: true });
export const insertDataIngestionLogSchema = createInsertSchema(dataIngestionLogs).omit({ id: true, startedAt: true });

export type County = typeof counties.$inferSelect;
export type InsertCounty = z.infer<typeof insertCountySchema>;
export type District = typeof districts.$inferSelect;
export type InsertDistrict = z.infer<typeof insertDistrictSchema>;
export type School = typeof schools.$inferSelect;
export type InsertSchool = z.infer<typeof insertSchoolSchema>;
export type Indicator = typeof indicators.$inferSelect;
export type InsertIndicator = z.infer<typeof insertIndicatorSchema>;
export type StudentGroup = typeof studentGroups.$inferSelect;
export type InsertStudentGroup = z.infer<typeof insertStudentGroupSchema>;
export type PerformanceData = typeof performanceData.$inferSelect;
export type InsertPerformanceData = z.infer<typeof insertPerformanceDataSchema>;
export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type ApiUsageLog = typeof apiUsageLogs.$inferSelect;
export type InsertApiUsageLog = z.infer<typeof insertApiUsageLogSchema>;
export type DataIngestionLog = typeof dataIngestionLogs.$inferSelect;
export type InsertDataIngestionLog = z.infer<typeof insertDataIngestionLogSchema>;
