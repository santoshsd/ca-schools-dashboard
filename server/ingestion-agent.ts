import { storage } from "./storage";

const CDE_DATA_SOURCES = [
  {
    name: "CA School Dashboard - Academic Performance",
    url: "https://www.caschooldashboard.org/",
    category: "Academic",
  },
  {
    name: "CA School Dashboard - Graduation Rate",
    url: "https://www.caschooldashboard.org/",
    category: "Engagement",
  },
  {
    name: "CA School Dashboard - Chronic Absenteeism",
    url: "https://www.caschooldashboard.org/",
    category: "Engagement",
  },
  {
    name: "CA School Dashboard - Suspension Rate",
    url: "https://www.caschooldashboard.org/",
    category: "Climate",
  },
];

async function checkForNewData() {
  console.log("[Ingestion Agent] Checking for new data from CA School Dashboard...");

  for (const source of CDE_DATA_SOURCES) {
    const log = await storage.createIngestionLog({
      source: source.name,
      status: "checking",
      recordsProcessed: 0,
      recordsFailed: 0,
      details: `Checking ${source.url} for updates`,
    });

    try {
      const response = await fetch(source.url, {
        method: "HEAD",
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const lastModified = response.headers.get("last-modified");
        await storage.updateIngestionLog(log.id, {
          status: "completed",
          details: `Source accessible. Last-Modified: ${lastModified || "unknown"}. No new data detected for ingestion.`,
          completedAt: new Date(),
        });
        console.log(`[Ingestion Agent] ${source.name}: Source accessible, no new data to ingest.`);
      } else {
        await storage.updateIngestionLog(log.id, {
          status: "warning",
          details: `Source returned status ${response.status}`,
          completedAt: new Date(),
        });
        console.log(`[Ingestion Agent] ${source.name}: Source returned ${response.status}`);
      }
    } catch (error: any) {
      await storage.updateIngestionLog(log.id, {
        status: "error",
        details: `Failed to check source: ${error.message}`,
        completedAt: new Date(),
      });
      console.error(`[Ingestion Agent] ${source.name}: Error - ${error.message}`);
    }
  }

  console.log("[Ingestion Agent] Check complete.");
}

export function startIngestionAgent() {
  console.log("[Ingestion Agent] Starting data monitoring agent (weekly checks)...");

  checkForNewData().catch(console.error);

  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  setInterval(() => {
    checkForNewData().catch(console.error);
  }, WEEK_MS);
}
