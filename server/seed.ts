import { db } from "./db";
import { counties, districts, schools, indicators, studentGroups, performanceData } from "@shared/schema";
import { count } from "drizzle-orm";

export async function seedDatabase() {
  const [existing] = await db.select({ count: count() }).from(counties);
  if (existing.count > 0) {
    console.log("Database already has data (real CDE data), skipping seed...");
    return;
  }

  console.log("No data found. Run 'npx tsx server/ingest-cde-data.ts' to import real CDE data.");
  console.log("Seeding database with minimal development data...");

  const countyData = [
    { code: "01", name: "Alameda", type: "county" },
    { code: "07", name: "Contra Costa", type: "county" },
    { code: "13", name: "Fresno", type: "county" },
    { code: "19", name: "Los Angeles", type: "county" },
    { code: "27", name: "Monterey", type: "county" },
    { code: "30", name: "Orange", type: "county" },
    { code: "33", name: "Riverside", type: "county" },
    { code: "34", name: "Sacramento", type: "county" },
    { code: "36", name: "San Bernardino", type: "county" },
    { code: "37", name: "San Diego", type: "county" },
    { code: "38", name: "San Francisco", type: "county" },
    { code: "41", name: "San Mateo", type: "county" },
    { code: "43", name: "Santa Clara", type: "county" },
    { code: "44", name: "Santa Cruz", type: "county" },
    { code: "49", name: "Sonoma", type: "county" },
    { code: "56", name: "Ventura", type: "county" },
  ];
  const insertedCounties = await db.insert(counties).values(countyData).returning();
  const countyMap: Record<string, number> = {};
  insertedCounties.forEach(c => { countyMap[c.code] = c.id; });

  const districtData = [
    { code: "01-61259", name: "Oakland Unified", countyId: countyMap["01"], type: "unified" },
    { code: "01-61143", name: "Berkeley Unified", countyId: countyMap["01"], type: "unified" },
    { code: "01-61176", name: "Fremont Unified", countyId: countyMap["01"], type: "unified" },
    { code: "07-61754", name: "Mt. Diablo Unified", countyId: countyMap["07"], type: "unified" },
    { code: "07-75440", name: "West Contra Costa Unified", countyId: countyMap["07"], type: "unified" },
    { code: "19-64733", name: "Los Angeles Unified", countyId: countyMap["19"], type: "unified" },
    { code: "19-64402", name: "Long Beach Unified", countyId: countyMap["19"], type: "unified" },
    { code: "19-64543", name: "Pasadena Unified", countyId: countyMap["19"], type: "unified" },
    { code: "30-73650", name: "Santa Ana Unified", countyId: countyMap["30"], type: "unified" },
    { code: "30-73569", name: "Anaheim Union High", countyId: countyMap["30"], type: "high" },
    { code: "34-67439", name: "Sacramento City Unified", countyId: countyMap["34"], type: "unified" },
    { code: "34-67447", name: "San Juan Unified", countyId: countyMap["34"], type: "unified" },
    { code: "37-68338", name: "San Diego Unified", countyId: countyMap["37"], type: "unified" },
    { code: "37-68346", name: "Sweetwater Union High", countyId: countyMap["37"], type: "high" },
    { code: "38-68478", name: "San Francisco Unified", countyId: countyMap["38"], type: "unified" },
    { code: "43-69427", name: "San Jose Unified", countyId: countyMap["43"], type: "unified" },
    { code: "43-69369", name: "Palo Alto Unified", countyId: countyMap["43"], type: "unified" },
    { code: "13-62166", name: "Fresno Unified", countyId: countyMap["13"], type: "unified" },
    { code: "33-67124", name: "Riverside Unified", countyId: countyMap["33"], type: "unified" },
    { code: "36-67934", name: "San Bernardino City Unified", countyId: countyMap["36"], type: "unified" },
  ];
  const insertedDistricts = await db.insert(districts).values(districtData).returning();
  const districtMap: Record<string, number> = {};
  insertedDistricts.forEach(d => { districtMap[d.code] = d.id; });

  const schoolData = [
    { code: "01-61259-0100", name: "Oakland High School", districtId: districtMap["01-61259"], countyId: countyMap["01"], type: "high", gradeSpan: "9-12", city: "Oakland", state: "CA" as const, zip: "94601" },
    { code: "01-61259-0101", name: "Skyline High School", districtId: districtMap["01-61259"], countyId: countyMap["01"], type: "high", gradeSpan: "9-12", city: "Oakland", state: "CA" as const, zip: "94619" },
    { code: "01-61259-0102", name: "Castlemont High School", districtId: districtMap["01-61259"], countyId: countyMap["01"], type: "high", gradeSpan: "9-12", city: "Oakland", state: "CA" as const, zip: "94605" },
    { code: "01-61143-0200", name: "Berkeley High School", districtId: districtMap["01-61143"], countyId: countyMap["01"], type: "high", gradeSpan: "9-12", city: "Berkeley", state: "CA" as const, zip: "94704" },
    { code: "01-61176-0300", name: "Washington High School", districtId: districtMap["01-61176"], countyId: countyMap["01"], type: "high", gradeSpan: "9-12", city: "Fremont", state: "CA" as const, zip: "94539" },
    { code: "19-64733-0100", name: "Abraham Lincoln High School", districtId: districtMap["19-64733"], countyId: countyMap["19"], type: "high", gradeSpan: "9-12", city: "Los Angeles", state: "CA" as const, zip: "90031" },
    { code: "19-64733-0101", name: "Hollywood High School", districtId: districtMap["19-64733"], countyId: countyMap["19"], type: "high", gradeSpan: "9-12", city: "Los Angeles", state: "CA" as const, zip: "90028" },
    { code: "19-64733-0102", name: "Manual Arts High School", districtId: districtMap["19-64733"], countyId: countyMap["19"], type: "high", gradeSpan: "9-12", city: "Los Angeles", state: "CA" as const, zip: "90011" },
    { code: "19-64402-0200", name: "Polytechnic High School", districtId: districtMap["19-64402"], countyId: countyMap["19"], type: "high", gradeSpan: "9-12", city: "Long Beach", state: "CA" as const, zip: "90813" },
    { code: "37-68338-0100", name: "San Diego High School", districtId: districtMap["37-68338"], countyId: countyMap["37"], type: "high", gradeSpan: "9-12", city: "San Diego", state: "CA" as const, zip: "92102" },
    { code: "37-68338-0101", name: "Point Loma High School", districtId: districtMap["37-68338"], countyId: countyMap["37"], type: "high", gradeSpan: "9-12", city: "San Diego", state: "CA" as const, zip: "92107" },
    { code: "38-68478-0100", name: "Lowell High School", districtId: districtMap["38-68478"], countyId: countyMap["38"], type: "high", gradeSpan: "9-12", city: "San Francisco", state: "CA" as const, zip: "94132" },
    { code: "38-68478-0101", name: "Mission High School", districtId: districtMap["38-68478"], countyId: countyMap["38"], type: "high", gradeSpan: "9-12", city: "San Francisco", state: "CA" as const, zip: "94110" },
    { code: "43-69427-0100", name: "San Jose High Academy", districtId: districtMap["43-69427"], countyId: countyMap["43"], type: "high", gradeSpan: "9-12", city: "San Jose", state: "CA" as const, zip: "95112" },
    { code: "43-69369-0100", name: "Palo Alto High School", districtId: districtMap["43-69369"], countyId: countyMap["43"], type: "high", gradeSpan: "9-12", city: "Palo Alto", state: "CA" as const, zip: "94306" },
    { code: "34-67439-0100", name: "C.K. McClatchy High School", districtId: districtMap["34-67439"], countyId: countyMap["34"], type: "high", gradeSpan: "9-12", city: "Sacramento", state: "CA" as const, zip: "95822" },
    { code: "13-62166-0100", name: "Fresno High School", districtId: districtMap["13-62166"], countyId: countyMap["13"], type: "high", gradeSpan: "9-12", city: "Fresno", state: "CA" as const, zip: "93704" },
    { code: "30-73650-0100", name: "Santa Ana High School", districtId: districtMap["30-73650"], countyId: countyMap["30"], type: "high", gradeSpan: "9-12", city: "Santa Ana", state: "CA" as const, zip: "92701" },
    { code: "33-67124-0100", name: "Riverside Poly High School", districtId: districtMap["33-67124"], countyId: countyMap["33"], type: "high", gradeSpan: "9-12", city: "Riverside", state: "CA" as const, zip: "92501" },
    { code: "36-67934-0100", name: "San Bernardino High School", districtId: districtMap["36-67934"], countyId: countyMap["36"], type: "high", gradeSpan: "9-12", city: "San Bernardino", state: "CA" as const, zip: "92405" },
  ];
  const insertedSchools = await db.insert(schools).values(schoolData).returning();
  const schoolMap: Record<string, number> = {};
  insertedSchools.forEach(s => { schoolMap[s.code] = s.id; });

  const indicatorData = [
    { code: "ela", name: "English Language Arts", description: "Measures student performance on the Smarter Balanced ELA assessment", category: "Academic" },
    { code: "math", name: "Mathematics", description: "Measures student performance on the Smarter Balanced Math assessment", category: "Academic" },
    { code: "elpi", name: "English Learner Progress", description: "Measures progress of English Learners toward English language proficiency", category: "Academic" },
    { code: "grad", name: "Graduation Rate", description: "Four-year adjusted cohort graduation rate", category: "Engagement" },
    { code: "chronic", name: "Chronic Absenteeism", description: "Percentage of students absent 10% or more of instructional days", category: "Engagement" },
    { code: "susp", name: "Suspension Rate", description: "Percentage of students suspended at least once during the academic year", category: "Climate" },
    { code: "ccri", name: "College/Career Readiness", description: "Percentage of students prepared or approaching prepared for college or career", category: "Preparation" },
  ];
  const insertedIndicators = await db.insert(indicators).values(indicatorData).returning();
  const indicatorMap: Record<string, number> = {};
  insertedIndicators.forEach(i => { indicatorMap[i.code] = i.id; });

  const studentGroupData = [
    { code: "all", name: "All Students", category: "All" },
    { code: "aa", name: "African American", category: "Race/Ethnicity" },
    { code: "ai", name: "American Indian", category: "Race/Ethnicity" },
    { code: "as", name: "Asian", category: "Race/Ethnicity" },
    { code: "fi", name: "Filipino", category: "Race/Ethnicity" },
    { code: "hi", name: "Hispanic", category: "Race/Ethnicity" },
    { code: "pi", name: "Pacific Islander", category: "Race/Ethnicity" },
    { code: "wh", name: "White", category: "Race/Ethnicity" },
    { code: "mr", name: "Two or More Races", category: "Race/Ethnicity" },
    { code: "el", name: "English Learners", category: "Program" },
    { code: "di", name: "Students with Disabilities", category: "Program" },
    { code: "sed", name: "Socioeconomically Disadvantaged", category: "Program" },
    { code: "fos", name: "Foster Youth", category: "Program" },
    { code: "hom", name: "Homeless", category: "Program" },
  ];
  const insertedGroups = await db.insert(studentGroups).values(studentGroupData).returning();
  const groupMap: Record<string, number> = {};
  insertedGroups.forEach(g => { groupMap[g.code] = g.id; });

  const statusTexts = ["Very Low", "Low", "Medium", "High", "Very High"];
  const changeTexts = ["Declined Significantly", "Declined", "Maintained", "Increased", "Increased Significantly"];
  const colors = ["red", "orange", "yellow", "green", "blue"];
  const years = ["2022-23", "2023-24"];

  const perfData: any[] = [];
  const schoolCodes = Object.keys(schoolMap);
  const indicatorCodes = Object.keys(indicatorMap);
  const groupCodes = ["all", "hi", "wh", "as", "aa", "el", "sed"];

  for (const year of years) {
    for (const schoolCode of schoolCodes) {
      for (const indCode of indicatorCodes) {
        for (const grpCode of groupCodes) {
          const statusIdx = Math.floor(Math.random() * 5);
          const changeIdx = Math.floor(Math.random() * 5);
          let value: number;
          if (indCode === "ela" || indCode === "math") {
            value = Math.round((Math.random() * 100 - 50) * 10) / 10;
          } else if (indCode === "grad" || indCode === "ccri") {
            value = Math.round((60 + Math.random() * 40) * 10) / 10;
          } else {
            value = Math.round((Math.random() * 30) * 10) / 10;
          }

          perfData.push({
            schoolId: schoolMap[schoolCode],
            districtId: insertedSchools.find(s => s.code === schoolCode)?.districtId,
            countyId: insertedSchools.find(s => s.code === schoolCode)?.countyId,
            indicatorId: indicatorMap[indCode],
            studentGroupId: groupMap[grpCode],
            academicYear: year,
            value,
            statusLevel: statusIdx + 1,
            statusText: statusTexts[statusIdx],
            changeLevel: changeIdx + 1,
            changeText: changeTexts[changeIdx],
            color: colors[statusIdx],
            enrollmentCount: Math.floor(100 + Math.random() * 2000),
            denominatorCount: Math.floor(50 + Math.random() * 1500),
            numeratorCount: Math.floor(Math.random() * 800),
            reportingLevel: "school",
          });
        }
      }
    }
  }

  const batchSize = 500;
  for (let i = 0; i < perfData.length; i += batchSize) {
    await db.insert(performanceData).values(perfData.slice(i, i + batchSize));
  }

  console.log(`Seeded: ${insertedCounties.length} counties, ${insertedDistricts.length} districts, ${insertedSchools.length} schools, ${insertedIndicators.length} indicators, ${insertedGroups.length} student groups, ${perfData.length} performance records`);
}
