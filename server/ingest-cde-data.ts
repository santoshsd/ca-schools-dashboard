import { db } from "./db";
import { counties, districts, schools, indicators, studentGroups, performanceData, dataIngestionLogs } from "@shared/schema";

// Drizzle's NodePgDatabase doesn't export a convenient type for a transaction
// parameter, so we use `any` to accept both db and transaction objects.
type DbOrTx = any;

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

// Fetch a TSV file from CDE. Enforces a size cap to prevent memory-exhaustion
// DoS if the upstream serves an unexpectedly large or corrupted payload.
const MAX_FETCH_BYTES = 500 * 1024 * 1024; // 500 MiB ceiling, well above any real CDE file
const FETCH_TIMEOUT_MS = 120_000;
const USER_AGENT = "CASchoolDashboard/1.0 (+https://caschooldatahub.s13i.me)";

async function fetchTSV(url: string): Promise<string[][]> {
  console.log(`[Ingestion] Fetching ${url}...`);
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

  const contentLength = res.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_FETCH_BYTES) {
    throw new Error(`Refusing to fetch ${url}: content-length ${contentLength} exceeds ${MAX_FETCH_BYTES}`);
  }

  const text = await res.text();
  if (text.length > MAX_FETCH_BYTES) {
    throw new Error(`Refusing to parse ${url}: body length ${text.length} exceeds ${MAX_FETCH_BYTES}`);
  }
  const lines = text.split("\n").filter(l => l.trim().length > 0);
  return lines.map(l => l.split("\t"));
}

// Log outside of the enclosing transaction (if any) so that failure records
// survive rollback. Callers that want a log row to survive a rollback should
// pass `db` explicitly; callers that want log rows to be part of the unit of
// work should pass the tx.
async function logIngestion(
  target: DbOrTx,
  source: string,
  status: string,
  processed: number,
  failed: number,
  details: string,
) {
  await target.insert(dataIngestionLogs).values({
    source,
    status,
    recordsProcessed: processed,
    recordsFailed: failed,
    details,
    completedAt: status !== "checking" ? new Date() : null,
  });
}

async function clearExistingData(tx: DbOrTx) {
  console.log("[Ingestion] Clearing existing seed data...");
  await tx.delete(performanceData);
  await tx.delete(schools);
  await tx.delete(districts);
  await tx.delete(counties);
  await tx.delete(indicators);
  await tx.delete(studentGroups);
  console.log("[Ingestion] Existing data cleared.");
}

async function ingestSchoolDirectory(tx: DbOrTx): Promise<{
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

  for (let i = 0; i < countyBatch.length; i += 500) {
    const batch = countyBatch.slice(i, i + 500);
    const inserted = await tx.insert(counties).values(batch).returning();
    inserted.forEach((c: any) => countyMap.set(c.code, c.id));
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

  for (let i = 0; i < districtBatch.length; i += 1000) {
    const batch = districtBatch.slice(i, i + 1000);
    const inserted = await tx.insert(districts).values(batch).returning();
    inserted.forEach((d: any) => districtMap.set(d.code, d.id));
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

  for (let i = 0; i < schoolBatch.length; i += 2000) {
    const batch = schoolBatch.slice(i, i + 2000);
    const inserted = await tx.insert(schools).values(batch).returning();
    inserted.forEach((s: any) => schoolMap.set(s.code, s.id));
    console.log(`[Ingestion] Inserted ${Math.min(i + 2000, schoolBatch.length)}/${schoolBatch.length} schools...`);
  }
  console.log(`[Ingestion] Inserted ${schoolMap.size} schools total`);

  await logIngestion(tx, "CDE Public Schools Directory", "completed",
    countyMap.size + districtMap.size + schoolMap.size, 0,
    `Ingested ${countyMap.size} counties, ${districtMap.size} districts, ${schoolMap.size} schools from CDE directory`);

  return { countyMap, districtMap, schoolMap };
}

async function ingestIndicatorsAndGroups(tx: DbOrTx): Promise<{
  indicatorMap: Map<string, number>;
  groupMap: Map<string, number>;
}> {
  const indicatorMap = new Map<string, number>();
  const inserted = await tx.insert(indicators).values(INDICATOR_DEFS).returning();
  inserted.forEach((i: any) => indicatorMap.set(i.code, i.id));

  const groupMap = new Map<string, number>();
  const groupValues = Object.entries(STUDENT_GROUP_NAMES).map(([code, info]) => ({
    code, name: info.name, category: info.category,
  }));
  const insertedGroups = await tx.insert(studentGroups).values(groupValues).returning();
  insertedGroups.forEach((g: any) => groupMap.set(g.code, g.id));

  console.log(`[Ingestion] Inserted ${indicatorMap.size} indicators, ${groupMap.size} student groups`);
  return { indicatorMap, groupMap };
}

async function ingestGraduationData(
  tx: DbOrTx,
  countyMap: Map<string, number>,
  districtMap: Map<string, number>,
  schoolMap: Map<string, number>,
  indicatorMap: Map<string, number>,
  groupMap: Map<string, number>,
) {
  // First entry is the current year; a failure there aborts the whole run
  // so we never silently regress to stale data.
  const years = ["acgr24", "acgr23-v2"];
  const gradId = indicatorMap.get("grad")!;
  let totalInserted = 0;

  for (let yearIdx = 0; yearIdx < years.length; yearIdx++) {
    const fileKey = years[yearIdx];
    const isCurrentYear = yearIdx === 0;
    const url = `https://www3.cde.ca.gov/demo-downloads/acgr/${fileKey}.txt`;
    let rows: string[][];
    try {
      rows = await fetchTSV(url);
    } catch (e: any) {
      if (isCurrentYear) {
        // Current-year failure is fatal: rolling back the tx is safer than
        // shipping a re-ingest that loses the newest year.
        throw new Error(`Failed to fetch current-year graduation file ${url}: ${e.message}`);
      }
      console.error(`[Ingestion] Failed to fetch prior-year ${url}: ${e.message}`);
      continue;
    }

    const header = rows[0];
    const data = rows.slice(1);
    const colIdx = (name: string) => header.indexOf(name);

    const academicYearIdx = colIdx("AcademicYear");
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

      const academicYear = row[academicYearIdx]?.trim();
      const rateStr = row[gradRateIdx]?.trim();
      const rate = rateStr ? parseFloat(rateStr) : null;
      if (rate === null || isNaN(rate)) continue;

      const cohortParsed = parseInt(row[cohortIdx]?.trim() || "");
      const cohort = Number.isFinite(cohortParsed) ? cohortParsed : null;
      const gradCountParsed = parseInt(row[gradCountIdx]?.trim() || "");
      const gradCount = Number.isFinite(gradCountParsed) ? gradCountParsed : null;

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

    // Batch errors propagate: a failure rolls back the enclosing transaction
    // rather than leaving half the file in place.
    // onConflictDoNothing() is a safety net against duplicate rows that may
    // appear if CDE source data contains repeated (school, indicator, year)
    // combinations.  The unique index idx_perf_dedupe enforces deduplication;
    // any such row is silently skipped rather than aborting the whole batch.
    for (let i = 0; i < batch.length; i += 2000) {
      const slice = batch.slice(i, i + 2000);
      try {
        await tx.insert(performanceData).values(slice).onConflictDoNothing();
      } catch (e: any) {
        throw new Error(
          `Batch insert error (graduation ${fileKey}, rows ${i}..${i + slice.length}): ${e.message}`,
        );
      }
      totalInserted += slice.length;
      if ((i + 2000) % 10000 === 0 || i + 2000 >= batch.length) {
        console.log(`[Ingestion] Graduation ${fileKey}: ${Math.min(i + 2000, batch.length)}/${batch.length} records...`);
      }
    }
  }

  console.log(`[Ingestion] Graduation data complete: ${totalInserted} inserted`);
  await logIngestion(tx, "CDE Graduation Rate", "completed", totalInserted, 0,
    `Ingested graduation rate data for multiple years`);
}

async function ingestSuspensionData(
  tx: DbOrTx,
  countyMap: Map<string, number>,
  districtMap: Map<string, number>,
  schoolMap: Map<string, number>,
  indicatorMap: Map<string, number>,
  groupMap: Map<string, number>,
) {
  const years = ["suspension24", "suspension23"];
  const suspId = indicatorMap.get("susp")!;
  let totalInserted = 0;

  for (let yearIdx = 0; yearIdx < years.length; yearIdx++) {
    const fileKey = years[yearIdx];
    const isCurrentYear = yearIdx === 0;
    const url = `https://www3.cde.ca.gov/demo-downloads/discipline/${fileKey}.txt`;
    let rows: string[][];
    try {
      rows = await fetchTSV(url);
    } catch (e: any) {
      if (isCurrentYear) {
        throw new Error(`Failed to fetch current-year suspension file ${url}: ${e.message}`);
      }
      console.error(`[Ingestion] Failed to fetch prior-year ${url}: ${e.message}`);
      continue;
    }

    const header = rows[0];
    const data = rows.slice(1);
    const colIdx = (name: string) => header.indexOf(name);

    const academicYearIdx = colIdx("AcademicYear");
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

      const academicYear = row[academicYearIdx]?.trim();
      const rateStr = row[suspRateIdx]?.trim();
      const rate = rateStr ? parseFloat(rateStr) : null;
      if (rate === null || isNaN(rate)) continue;

      const enrollmentParsed = parseInt(row[enrollIdx]?.trim() || "");
      const enrollment = Number.isFinite(enrollmentParsed) ? enrollmentParsed : null;
      const suspCountParsed = parseInt(row[suspCountIdx]?.trim() || "");
      const suspCount = Number.isFinite(suspCountParsed) ? suspCountParsed : null;

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

    for (let i = 0; i < batch.length; i += 2000) {
      const slice = batch.slice(i, i + 2000);
      try {
        await tx.insert(performanceData).values(slice).onConflictDoNothing();
      } catch (e: any) {
        throw new Error(
          `Batch insert error (suspension ${fileKey}, rows ${i}..${i + slice.length}): ${e.message}`,
        );
      }
      totalInserted += slice.length;
      if ((i + 2000) % 10000 === 0 || i + 2000 >= batch.length) {
        console.log(`[Ingestion] Suspension ${fileKey}: ${Math.min(i + 2000, batch.length)}/${batch.length} records...`);
      }
    }
  }

  console.log(`[Ingestion] Suspension data complete: ${totalInserted} inserted`);
  await logIngestion(tx, "CDE Suspension Rate", "completed", totalInserted, 0,
    `Ingested suspension rate data for multiple years`);
}

export async function runFullIngestion() {
  console.log("==============================================");
  console.log(" CDE Data Ingestion - Starting Full Import");
  console.log("==============================================");
  const startTime = Date.now();

  // Log the start with `db` (outside any transaction) so operators can see a
  // run started even if it later rolls back.
  await logIngestion(db, "Full Ingestion", "started", 0, 0, "Transactional ingestion beginning");

  try {
    await db.transaction(async (tx) => {
      await clearExistingData(tx);
      const { indicatorMap, groupMap } = await ingestIndicatorsAndGroups(tx);
      const { countyMap, districtMap, schoolMap } = await ingestSchoolDirectory(tx);
      await ingestGraduationData(tx, countyMap, districtMap, schoolMap, indicatorMap, groupMap);
      await ingestSuspensionData(tx, countyMap, districtMap, schoolMap, indicatorMap, groupMap);
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    await logIngestion(db, "Full Ingestion", "completed", 0, 0,
      `Transactional ingestion finished in ${elapsed}s`);
    console.log("==============================================");
    console.log(` CDE Data Ingestion Complete (${elapsed}s)`);
    console.log("==============================================");
  } catch (e: any) {
    console.error("[Ingestion] Fatal error — transaction rolled back:", e);
    // Write the failure log OUTSIDE the rolled-back transaction so it persists.
    await logIngestion(
      db,
      "Full Ingestion",
      "error",
      0,
      0,
      `Transaction rolled back: ${e?.message ?? String(e)}`,
    );
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
