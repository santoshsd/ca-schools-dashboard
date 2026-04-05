import express, { type Express, type Request, type Response } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // SPA fallback: serve index.html for all non-/api/* paths.
  // /api/* routes are handled by registerRoutes() and already have
  // JSON error responses, so skip them here.
  app.use("/{*path}", (req: Request, res: Response) => {
    if (req.path.startsWith("/api/")) {
      return res.status(404).json({ error: { code: "not_found", message: "API endpoint not found" } });
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
