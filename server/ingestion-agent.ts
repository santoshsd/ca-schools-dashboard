import { storage } from "./storage";

const CDE_DATA_SOURCES = [
  {
    name: "CDE Public Schools Directory",
    url: "https://www.cde.ca.gov/schooldirectory/report?rid=dl1&tp=txt",
    category: "Directory",
  },
  {
    name: "CDE Graduation Rate",
    url: "https://www3.cde.ca.gov/demo-downloads/acgr/acgr24.txt",
    category: "Engagement",
  },
  {
    name: "CDE Suspension Rate",
    url: "https://www3.cde.ca.gov/demo-downloads/discipline/suspension24.txt",
    category: "Climate",
  },
];

async function checkForNewData() {
  console.log("[Ingestion Agent] Checking CDE data sources for updates...");

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
        headers: { "User-Agent": "Mozilla/5.0 (CASchoolDashboardAPI/1.0)" },
        signal: AbortSignal.timeout(15000),
      });

      if (response.ok) {
        const lastModified = response.headers.get("last-modified");
        const contentLength = response.headers.get("content-length");
        await storage.updateIngestionLog(log.id, {
          status: "completed",
          details: `Source accessible. Last-Modified: ${lastModified || "unknown"}. Content-Length: ${contentLength || "unknown"}. Run 'npx tsx server/ingest-cde-data.ts' to re-import.`,
          completedAt: new Date(),
        });
        console.log(`[Ingestion Agent] ${source.name}: Accessible (Last-Modified: ${lastModified || "unknown"})`);
      } else {
        await storage.updateIngestionLog(log.id, {
          status: "warning",
          details: `Source returned HTTP ${response.status}`,
          completedAt: new Date(),
        });
        console.log(`[Ingestion Agent] ${source.name}: HTTP ${response.status}`);
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
