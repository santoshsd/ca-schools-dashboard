import { db, pool } from "./db";
import { counties, districts, schools, indicators, studentGroups, performanceData, dataIngestionLogs } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

const CDE_REPORTING_CATEGORY_MAP: Record<string, string> = {
  "TA": "all",
  "RB": "aa",
  "RI": "ai",
  "RA": "as",
  "RF": "fi",
  "RH": "hi",
  "RP": "pi",
  "RW": "wh",
  "RT": "mr",
  "SE": "el",
  "SD": "di",
  "SS": "sed",
  "SF": "fos",
  "SH": "hom",
  "GM": "male",
  "GF": "female",
  "GX": "nonbinary",
  "SM": "migrant",
};

const STUDENT_GROUP_NAMES: Record<string, { name: string; category: string }> = {
  "all": { name: "All Students", category: "All" },
  "aa": { name: "African American", category: "Race/Ethnicity" },
  "ai": { name: "American Indian", category: "Race/Ethnicity" },
  "as": { name: "Asian", category: "Race/Ethnicity" },
  "fi": { name: "Filipino", category: "Race/Ethnicity" },
  "hi": { name: "Hispanic", category: "Race/Ethnicity" },
  "pi": { name: "Pacific Islander", category: "Race/Ethnicity" },
  "wh": { name: "White", category: "Race/Ethnicity" },
  "mr": { name: "Two or More Races", category: "Race/Ethnicity" },
  "el": { name: "English Learners", category: "Program" },
  "di": { name: "Students with Disabilities", category: "Program" },
  "sed": { name: "Socioeconomically Disadvantaged", category: "Program" },
  "fos": { name: "Foster Youth", category: "Program" },
  "hom": { name: "Homeless", category: "Program" },
  "male": { name: "Male", category: "Gender" },
  "female": { name: "Female", category: "Gender" },
  "nonbinary": { name: "Non-Binary", category: "Gender" },
  "migrant": { name: "Migrant", category: "Program" },
};

const INDICATOR_DEFS = [
  { code: "ela", name: "English Language Arts", description: "Measures student performance on the Smarter Balanced ELA assessment", category: "Academic" },
  { code: "math", name: "Mathematics", description: "Measures student performance on the Smarter Balanced Math assessment", category: "Academic" },
  { code: "elpi", name: "English Learner Progress", description: "Measures progress of English Learners toward English language proficiency", category: "Academic" },
  { code: "grad", name: "Graduation Rate", description: "Four-year adjusted cohort graduation rate", category: "Engagement" },
  { code: "chronic", name: "Chronic Absenteeism", description: "Percentage of students absent 10% or more of instructional days", category: "Engagement" },
  { code: "susp", name: "Suspension Rate", description: "Percentage of students suspended at least once during the academic year", category: "Climate" },
  { code: "ccri", name: "College/Career Readiness", description: "Percentage of students prepared for college or career", category: "Preparation" },
];

async function fetchTSV(url: string): Promise<string[][]> {
  console.log(`[Ingestion] Fetching ${url}...`);
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (CASchoolDashboardAPI/1.0)" },
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const text = await res.text();
  const lines = text.split("\n").filter(l => l.trim().length > 0);
  return lines.map(l => l.split("\t"));
}

async function logIngestion(source: string, status: string, processed: number, failed: number, details: string) {
  await db.insert(dataIngestionLogs).values({
    source,
    status,
    recordsProcessed: processed,
    recordsFailed: failed,
    details,
    completedAt: status !== "checking" ? new Date() : null,
  });
}

async function clearExistingData() {
  console.log("[Ingestion] Clearing existing seed data...");
  await db.delete(performanceData);
  await db.delete(schools);
  await db.delete(districts);
  await db.delete(counties);
  await db.delete(indicators);
  await db.delete(studentGroups);
  console.log("[Ingestion] Existing data cleared.");
}

async function ingestSchoolDirectory(): Promise<{
  countyMap: Map<string, number>;
  districtMap: Map<string, number>;
  schoolMap: Map<string, number>;
}> {
  const url = "https://www.cde.ca.gov/schooldirectory/report?rid=dl1&tp=txt";
  const rows = await fetchTSV(url);
  const header = rows[0];
  const data = rows.slice(1);

  const colIdx = (name: string) => header.indexOf(name);
  const cdsIdx = colIdx("CDSCode");
  const statusIdx = colIdx("StatusType");
  const countyIdx = colIdx("County");
  const districtIdx = colIdx("District");
  const schoolIdx = colIdx("School");
  const streetIdx = colIdx("StreetAbr");
  const cityIdx = colIdx("City");
  const zipIdx = colIdx("Zip");
  const stateIdx = colIdx("State");
  const phoneIdx = colIdx("Phone");
  const webIdx = colIdx("WebSite");
  const latIdx = colIdx("Latitude");
  const lonIdx = colIdx("Longitude");
  const gsOfferedIdx = colIdx("GSoffered");
  const gsServedIdx = colIdx("GSserved");
  const eilIdx = colIdx("EILName");
  const socTypeIdx = colIdx("SOCType");
  const docTypeIdx = colIdx("DOCType");

  const countySet = new Map<string, string>();
  const districtSet = new Map<string, { name: string; countyCode: string; type: string }>();
  const schoolSet = new Map<string, {
    name: string; districtCode: string; countyCode: string; type: string;
    gradeSpan: string | null; lat: number | null; lon: number | null;
    address: string | null; city: string | null; zip: string | null;
    phone: string | null; website: string | null;
  }>();

  let activeSchoolCount = 0;

  for (const row of data) {
    const cds = row[cdsIdx]?.trim();
    const status = row[statusIdx]?.trim();
    if (!cds || cds.length !== 14) continue;

    const countyCode = cds.substring(0, 2);
    const districtCode = cds.substring(0, 7);
    const countyName = row[countyIdx]?.trim() || "";
    const districtName = row[districtIdx]?.trim() || "";
    const schoolName = row[schoolIdx]?.trim() || "";
    const docType = row[docTypeIdx]?.trim() || "";

    if (countyName && !countySet.has(countyCode)) {
      countySet.set(countyCode, countyName);
    }

    if (districtName && districtName !== "No Data" && !districtSet.has(districtCode)) {
      districtSet.set(districtCode, {
        name: districtName,
        countyCode,
        type: docType.toLowerCase() || "district",
      });
    }

    if (status === "Active" && schoolName && schoolName !== "No Data" && cds.substring(7) !== "0000000") {
      activeSchoolCount++;
      const eilName = row[eilIdx]?.trim() || "";
      let schoolType = "school";
      if (eilName.includes("High")) schoolType = "high";
      else if (eilName.includes("Middle")) schoolType = "middle";
      else if (eilName.includes("Elementary")) schoolType = "elementary";

      const gs = row[gsServedIdx]?.trim() || row[gsOfferedIdx]?.trim() || null;
      const lat = row[latIdx] ? parseFloat(row[latIdx]) : null;
      const lon = row[lonIdx] ? parseFloat(row[lonIdx]) : null;

      schoolSet.set(cds, {
        name: schoolName,
        districtCode,
        countyCode,
        type: schoolType,
        gradeSpan: gs && gs !== "No Data" ? gs : null,
        lat: lat && !isNaN(lat) ? lat : null,
        lon: lon && !isNaN(lon) ? lon : null,
        address: row[streetIdx]?.trim() || null,
        city: row[cityIdx]?.trim() || null,
        zip: row[zipIdx]?.trim() || null,
        phone: row[phoneIdx]?.trim() || null,
        website: row[webIdx]?.trim() || null,
      });
    }
  }

  console.log(`[Ingestion] Found ${countySet.size} counties, ${districtSet.size} districts, ${schoolSet.size} active schools`);

  const countyMap = new Map<string, number>();
  const countyBatch = Array.from(countySet.entries()).map(([code, name]) => ({
    code, name, type: "county" as const,
  }));

  for (let i = 0; i < countyBatch.length; i += 100) {
    const batch = countyBatch.slice(i, i + 100);
    const inserted = await db.insert(counties).values(batch).returning();
    inserted.forEach(c => countyMap.set(c.code, c.id));
  }
  console.log(`[Ingestion] Inserted ${countyMap.size} counties`);

  const districtMap = new Map<string, number>();
  const districtBatch = Array.from(districtSet.entries())
    .filter(([_, d]) => countyMap.has(d.countyCode))
    .map(([code, d]) => ({
      code,
      name: d.name,
      countyId: countyMap.get(d.countyCode)!,
      type: d.type,
    }));

  for (let i = 0; i < districtBatch.length; i += 200) {
    const batch = districtBatch.slice(i, i + 200);
    const inserted = await db.insert(districts).values(batch).returning();
    inserted.forEach(d => districtMap.set(d.code, d.id));
  }
  console.log(`[Ingestion] Inserted ${districtMap.size} districts`);

  const schoolMap = new Map<string, number>();
  const schoolBatch = Array.from(schoolSet.entries())
    .filter(([_, s]) => districtMap.has(s.districtCode) && countyMap.has(s.countyCode))
    .map(([code, s]) => ({
      code,
      name: s.name,
      districtId: districtMap.get(s.districtCode)!,
      countyId: countyMap.get(s.countyCode)!,
      type: s.type,
      gradeSpan: s.gradeSpan,
      latitude: s.lat,
      longitude: s.lon,
      address: s.address,
      city: s.city,
      state: "CA" as const,
      zip: s.zip,
      phone: s.phone,
      website: s.website,
      isActive: true,
    }));

  for (let i = 0; i < schoolBatch.length; i += 200) {
    const batch = schoolBatch.slice(i, i + 200);
    const inserted = await db.insert(schools).values(batch).returning();
    inserted.forEach(s => schoolMap.set(s.code, s.id));
    if ((i + 200) % 2000 === 0 || i + 200 >= schoolBatch.length) {
      console.log(`[Ingestion] Inserted ${Math.min(i + 200, schoolBatch.length)}/${schoolBatch.length} schools...`);
    }
  }
  console.log(`[Ingestion] Inserted ${schoolMap.size} schools total`);

  await logIngestion("CDE Public Schools Directory", "completed",
    countyMap.size + districtMap.size + schoolMap.size, 0,
    `Ingested ${countyMap.size} counties, ${districtMap.size} districts, ${schoolMap.size} schools from CDE directory`);

  return { countyMap, districtMap, schoolMap };
}

async function ingestIndicatorsAndGroups(): Promise<{
  indicatorMap: Map<string, number>;
  groupMap: Map<string, number>;
}> {
  const indicatorMap = new Map<string, number>();
  const inserted = await db.insert(indicators).values(INDICATOR_DEFS).returning();
  inserted.forEach(i => indicatorMap.set(i.code, i.id));

  const groupMap = new Map<string, number>();
  const groupValues = Object.entries(STUDENT_GROUP_NAMES).map(([code, info]) => ({
    code, name: info.name, category: info.category,
  }));
  const insertedGroups = await db.insert(studentGroups).values(groupValues).returning();
  insertedGroups.forEach(g => groupMap.set(g.code, g.id));

  console.log(`[Ingestion] Inserted ${indicatorMap.size} indicators, ${groupMap.size} student groups`);
  return { indicatorMap, groupMap };
}

async function ingestGraduationData(
  countyMap: Map<string, number>,
  districtMap: Map<string, number>,
  schoolMap: Map<string, number>,
  indicatorMap: Map<string, number>,
  groupMap: Map<string, number>,
) {
  const years = ["acgr24", "acgr23-v2"];
  const gradId = indicatorMap.get("grad")!;
  let totalInserted = 0;
  let totalFailed = 0;

  for (const fileKey of years) {
    const url = `https://www3.cde.ca.gov/demo-downloads/acgr/${fileKey}.txt`;
    let rows: string[][];
    try {
      rows = await fetchTSV(url);
    } catch (e: any) {
      console.error(`[Ingestion] Failed to fetch ${url}: ${e.message}`);
      await logIngestion(`Graduation Rate (${fileKey})`, "error", 0, 0, e.message);
      continue;
    }

    const header = rows[0];
    const data = rows.slice(1);
    const colIdx = (name: string) => header.indexOf(name);

    const yearIdx = colIdx("AcademicYear");
    const levelIdx = colIdx("AggregateLevel");
    const countyCodeIdx = colIdx("CountyCode");
    const distCodeIdx = colIdx("DistrictCode");
    const schoolCodeIdx = colIdx("SchoolCode");
    const catIdx = colIdx("ReportingCategory");
    const cohortIdx = colIdx("CohortStudents");
    const gradRateIdx = colIdx("Regular HS Diploma Graduates (Rate)");
    const gradCountIdx = colIdx("Regular HS Diploma Graduates (Count)");

    const batch: any[] = [];

    for (const row of data) {
      const level = row[levelIdx]?.trim();
      const cat = row[catIdx]?.trim();
      const groupCode = CDE_REPORTING_CATEGORY_MAP[cat];
      if (!groupCode || !groupMap.has(groupCode)) continue;

      const academicYear = row[yearIdx]?.trim();
      const rateStr = row[gradRateIdx]?.trim();
      const rate = rateStr ? parseFloat(rateStr) : null;
      if (rate === null || isNaN(rate)) continue;

      const cohort = parseInt(row[cohortIdx]?.trim() || "0") || null;
      const gradCount = parseInt(row[gradCountIdx]?.trim() || "0") || null;

      const countyCode = row[countyCodeIdx]?.trim();
      const distCode = row[distCodeIdx]?.trim();
      const schoolCode = row[schoolCodeIdx]?.trim();

      let schoolId = null, districtId = null, countyId = null;
      let reportingLevel = level?.toLowerCase() || "state";

      if (level === "S" && schoolCode && schoolCode !== "0000000") {
        const cds = `${countyCode}${distCode}${schoolCode}`;
        schoolId = schoolMap.get(cds) || null;
        districtId = districtMap.get(`${countyCode}${distCode}`) || null;
        countyId = countyMap.get(countyCode) || null;
        if (!schoolId) continue;
        reportingLevel = "school";
      } else if (level === "D" && distCode) {
        districtId = districtMap.get(`${countyCode}${distCode}`) || null;
        countyId = countyMap.get(countyCode) || null;
        if (!districtId) continue;
        reportingLevel = "district";
      } else if (level === "C" && countyCode) {
        countyId = countyMap.get(countyCode) || null;
        if (!countyId) continue;
        reportingLevel = "county";
      } else if (level === "T") {
        reportingLevel = "state";
      } else {
        continue;
      }

      let statusLevel = null, statusText = null, color = null;
      if (rate >= 95) { statusLevel = 5; statusText = "Very High"; color = "blue"; }
      else if (rate >= 90) { statusLevel = 4; statusText = "High"; color = "green"; }
      else if (rate >= 80) { statusLevel = 3; statusText = "Medium"; color = "yellow"; }
      else if (rate >= 67) { statusLevel = 2; statusText = "Low"; color = "orange"; }
      else { statusLevel = 1; statusText = "Very Low"; color = "red"; }

      batch.push({
        schoolId,
        districtId,
        countyId,
        indicatorId: gradId,
        studentGroupId: groupMap.get(groupCode)!,
        academicYear,
        value: rate,
        statusLevel,
        statusText,
        color,
        enrollmentCount: cohort,
        numeratorCount: gradCount,
        denominatorCount: cohort,
        reportingLevel,
      });
    }

    for (let i = 0; i < batch.length; i += 500) {
      try {
        await db.insert(performanceData).values(batch.slice(i, i + 500));
        totalInserted += Math.min(500, batch.length - i);
      } catch (e: any) {
        totalFailed += Math.min(500, batch.length - i);
        console.error(`[Ingestion] Batch insert error (graduation): ${e.message}`);
      }
      if ((i + 500) % 5000 === 0 || i + 500 >= batch.length) {
        console.log(`[Ingestion] Graduation ${fileKey}: ${Math.min(i + 500, batch.length)}/${batch.length} records...`);
      }
    }
  }

  console.log(`[Ingestion] Graduation data complete: ${totalInserted} inserted, ${totalFailed} failed`);
  await logIngestion("CDE Graduation Rate", "completed", totalInserted, totalFailed,
    `Ingested graduation rate data for multiple years`);
}

async function ingestSuspensionData(
  countyMap: Map<string, number>,
  districtMap: Map<string, number>,
  schoolMap: Map<string, number>,
  indicatorMap: Map<string, number>,
  groupMap: Map<string, number>,
) {
  const years = ["suspension24", "suspension23"];
  const suspId = indicatorMap.get("susp")!;
  let totalInserted = 0;
  let totalFailed = 0;

  for (const fileKey of years) {
    const url = `https://www3.cde.ca.gov/demo-downloads/discipline/${fileKey}.txt`;
    let rows: string[][];
    try {
      rows = await fetchTSV(url);
    } catch (e: any) {
      console.error(`[Ingestion] Failed to fetch ${url}: ${e.message}`);
      await logIngestion(`Suspension Rate (${fileKey})`, "error", 0, 0, e.message);
      continue;
    }

    const header = rows[0];
    const data = rows.slice(1);
    const colIdx = (name: string) => header.indexOf(name);

    const yearIdx = colIdx("AcademicYear");
    const levelIdx = colIdx("AggregateLevel");
    const countyCodeIdx = colIdx("CountyCode");
    const distCodeIdx = colIdx("DistrictCode");
    const schoolCodeIdx = colIdx("SchoolCode");
    const catIdx = colIdx("ReportingCategory");
    const enrollIdx = colIdx("CumulativeEnrollment");
    const suspRateIdx = colIdx("Suspension Rate (Total)");
    const suspCountIdx = colIdx("Unduplicated Count of Students Suspended (Total)");

    const batch: any[] = [];

    for (const row of data) {
      const level = row[levelIdx]?.trim();
      const cat = row[catIdx]?.trim();
      const groupCode = CDE_REPORTING_CATEGORY_MAP[cat];
      if (!groupCode || !groupMap.has(groupCode)) continue;

      const academicYear = row[yearIdx]?.trim();
      const rateStr = row[suspRateIdx]?.trim();
      const rate = rateStr ? parseFloat(rateStr) : null;
      if (rate === null || isNaN(rate)) continue;

      const enrollment = parseInt(row[enrollIdx]?.trim() || "0") || null;
      const suspCount = parseInt(row[suspCountIdx]?.trim() || "0") || null;

      const countyCode = row[countyCodeIdx]?.trim();
      const distCode = row[distCodeIdx]?.trim();
      const schoolCode = row[schoolCodeIdx]?.trim();

      let schoolId = null, districtId = null, countyId = null;
      let reportingLevel = level?.toLowerCase() || "state";

      if (level === "S" && schoolCode && schoolCode !== "0000000") {
        const cds = `${countyCode}${distCode}${schoolCode}`;
        schoolId = schoolMap.get(cds) || null;
        districtId = districtMap.get(`${countyCode}${distCode}`) || null;
        countyId = countyMap.get(countyCode) || null;
        if (!schoolId) continue;
        reportingLevel = "school";
      } else if (level === "D" && distCode) {
        districtId = districtMap.get(`${countyCode}${distCode}`) || null;
        countyId = countyMap.get(countyCode) || null;
        if (!districtId) continue;
        reportingLevel = "district";
      } else if (level === "C" && countyCode) {
        countyId = countyMap.get(countyCode) || null;
        if (!countyId) continue;
        reportingLevel = "county";
      } else if (level === "T") {
        reportingLevel = "state";
      } else {
        continue;
      }

      let statusLevel = null, statusText = null, color = null;
      if (rate <= 0.5) { statusLevel = 5; statusText = "Very Low"; color = "blue"; }
      else if (rate <= 1.5) { statusLevel = 4; statusText = "Low"; color = "green"; }
      else if (rate <= 3.0) { statusLevel = 3; statusText = "Medium"; color = "yellow"; }
      else if (rate <= 6.0) { statusLevel = 2; statusText = "High"; color = "orange"; }
      else { statusLevel = 1; statusText = "Very High"; color = "red"; }

      batch.push({
        schoolId,
        districtId,
        countyId,
        indicatorId: suspId,
        studentGroupId: groupMap.get(groupCode)!,
        academicYear,
        value: rate,
        statusLevel,
        statusText,
        color,
        enrollmentCount: enrollment,
        numeratorCount: suspCount,
        denominatorCount: enrollment,
        reportingLevel,
      });
    }

    for (let i = 0; i < batch.length; i += 500) {
      try {
        await db.insert(performanceData).values(batch.slice(i, i + 500));
        totalInserted += Math.min(500, batch.length - i);
      } catch (e: any) {
        totalFailed += Math.min(500, batch.length - i);
        console.error(`[Ingestion] Batch insert error (suspension): ${e.message}`);
      }
      if ((i + 500) % 5000 === 0 || i + 500 >= batch.length) {
        console.log(`[Ingestion] Suspension ${fileKey}: ${Math.min(i + 500, batch.length)}/${batch.length} records...`);
      }
    }
  }

  console.log(`[Ingestion] Suspension data complete: ${totalInserted} inserted, ${totalFailed} failed`);
  await logIngestion("CDE Suspension Rate", "completed", totalInserted, totalFailed,
    `Ingested suspension rate data for multiple years`);
}

export async function runFullIngestion() {
  console.log("==============================================");
  console.log(" CDE Data Ingestion - Starting Full Import");
  console.log("==============================================");
  const startTime = Date.now();

  try {
    await clearExistingData();
    const { indicatorMap, groupMap } = await ingestIndicatorsAndGroups();
    const { countyMap, districtMap, schoolMap } = await ingestSchoolDirectory();
    await ingestGraduationData(countyMap, districtMap, schoolMap, indicatorMap, groupMap);
    await ingestSuspensionData(countyMap, districtMap, schoolMap, indicatorMap, groupMap);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log("==============================================");
    console.log(` CDE Data Ingestion Complete (${elapsed}s)`);
    console.log("==============================================");
  } catch (e: any) {
    console.error("[Ingestion] Fatal error:", e);
    await logIngestion("Full Ingestion", "error", 0, 0, e.message);
    throw e;
  }
}

if (process.argv[1]?.includes("ingest-cde-data")) {
  runFullIngestion()
    .then(() => {
      console.log("Done!");
      process.exit(0);
    })
    .catch((e) => {
      console.error("Ingestion failed:", e);
      process.exit(1);
    });
}
