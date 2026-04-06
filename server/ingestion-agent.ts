import { storage } from "./storage";
import { isIngestionRunning, setIngestionRunning } from "./ingestion-state";

const CDE_DATA_SOURCES = [
  {
    name: "CDE Public Schools Directory",
    url: "https://www.cde.ca.gov/schooldirectory/report?rid=dl1&tp=txt",
  },
  {
    name: "CDE Graduation Rate",
    url: "https://www3.cde.ca.gov/demo-downloads/acgr/acgr24.txt",
  },
  {
    name: "CDE Suspension Rate",
    url: "https://www3.cde.ca.gov/demo-downloads/discipline/suspension24.txt",
  },
];

// Lightweight startup check: verify each CDE source URL is reachable and log
// the result. Does NOT import any data.
async function checkSourceAccessibility() {
  console.log("[Ingestion Agent] Checking CDE data source accessibility...");

  for (const source of CDE_DATA_SOURCES) {
    const log = await storage.createIngestionLog({
      source: source.name,
      status: "checking",
      recordsProcessed: 0,
      recordsFailed: 0,
      details: `Checking ${source.url} for accessibility`,
    });

    try {
      const response = await fetch(source.url, {
        method: "HEAD",
        headers: { "User-Agent": "CASchoolDashboard/1.0 (+https://caschooldatahub.s13i.me)" },
        signal: AbortSignal.timeout(15000),
      });

      if (response.ok) {
        const lastModified = response.headers.get("last-modified");
        const contentLength = response.headers.get("content-length");
        await storage.updateIngestionLog(log.id, {
          status: "completed",
          details: `Accessible. Last-Modified: ${lastModified ?? "unknown"}. Content-Length: ${contentLength ?? "unknown"}.`,
          completedAt: new Date(),
        });
        console.log(`[Ingestion Agent] ${source.name}: OK (Last-Modified: ${lastModified ?? "unknown"})`);
      } else {
        await storage.updateIngestionLog(log.id, {
          status: "warning",
          details: `Source returned HTTP ${response.status}`,
          completedAt: new Date(),
        });
        console.warn(`[Ingestion Agent] ${source.name}: HTTP ${response.status}`);
      }
    } catch (error: any) {
      await storage.updateIngestionLog(log.id, {
        status: "error",
        details: `Accessibility check failed: ${error.message}`,
        completedAt: new Date(),
      });
      console.error(`[Ingestion Agent] ${source.name}: Error — ${error.message}`);
    }
  }

  console.log("[Ingestion Agent] Accessibility check complete.");
}

// Full weekly ingestion: replaces all CDE data in the database.
async function runScheduledIngestion() {
  if (isIngestionRunning()) {
    console.log("[Ingestion Agent] Weekly ingestion skipped — a run is already in progress.");
    return;
  }

  console.log("[Ingestion Agent] Starting weekly scheduled ingestion...");
  setIngestionRunning(true);
  try {
    const { runFullIngestion } = await import("./ingest-cde-data");
    await runFullIngestion();
    console.log("[Ingestion Agent] Weekly scheduled ingestion complete.");
  } catch (e) {
    console.error("[Ingestion Agent] Weekly scheduled ingestion failed:", e);
  } finally {
    setIngestionRunning(false);
  }
}

export function startIngestionAgent() {
  console.log("[Ingestion Agent] Starting — will check sources now and run full ingestion weekly.");

  // Lightweight accessibility check at startup only.
  checkSourceAccessibility().catch(console.error);

  // Full ingestion runs every 7 days.
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  setInterval(() => {
    runScheduledIngestion().catch(console.error);
  }, WEEK_MS);
}
