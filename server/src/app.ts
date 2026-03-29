import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { healthRouter } from "./routes/health.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { projectsRouter } from "./routes/projects.routes.js";
import { roomsRouter } from "./routes/rooms.routes.js";
import { itemsRouter } from "./routes/items.routes.js";
import { providersRouter } from "./routes/providers.routes.js";
import { requireAuth } from "./middleware/auth.middleware.js";

export const app = express();

app.use(cors());
app.use(express.json());

// Serve uploaded photos
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

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
app.use("/api/providers", providersRouter);

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
