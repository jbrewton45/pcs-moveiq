import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { getUploadsDir } from "./data/storage.js";
import { healthRouter } from "./routes/health.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { projectsRouter } from "./routes/projects.routes.js";
import { roomsRouter } from "./routes/rooms.routes.js";
import { itemsRouter } from "./routes/items.routes.js";
import { providersRouter } from "./routes/providers.routes.js";
import { ebayRouter } from "./routes/ebay.routes.js";
import { ebaySearchRouter } from "./routes/ebay-search.routes.js";
import { ebayAnalysisRouter } from "./routes/ebay-analysis.routes.js";
import { calibrationRouter } from "./routes/calibration.routes.js";
import { requireAuth } from "./middleware/auth.middleware.js";

export const app = express();

app.use(cors());
app.use(express.json());

// Serve uploaded photos (Railway volume or local ./uploads)
app.use("/uploads", express.static(getUploadsDir()));

// API health check
app.get("/api/health-root", (_req, res) => {
  res.status(200).json({ ok: true, message: "PCS MoveIQ API is running" });
});

// Public routes
app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);

// Protected routes — require authentication
app.use("/api/projects", requireAuth, projectsRouter);
app.use("/api/rooms", requireAuth, roomsRouter);
app.use("/api/items", requireAuth, itemsRouter);
app.use("/api/calibration", requireAuth, calibrationRouter);
app.use("/api/providers", providersRouter);

// eBay marketplace account deletion notifications (public, no auth)
app.use("/ebay", ebayRouter);

// eBay public listing search (server-side only, no credentials exposed)
app.use("/api/ebay", ebaySearchRouter);

// eBay pricing analysis with comparable grouping and confidence scoring
app.use("/api/ebay", ebayAnalysisRouter);

// Serve the built React client
// __dirname is server/dist at runtime, so ../../client/dist is always correct
const clientDistPath = path.resolve(__dirname, "../../client/dist");
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  // SPA catch-all: serve index.html for all non-API routes (app.use, not app.get("*") — Express 5 compat)
  app.use((_req, res) => {
    res.sendFile(path.join(clientDistPath, "index.html"));
  });
}
