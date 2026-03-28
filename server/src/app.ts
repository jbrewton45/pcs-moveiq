import express from "express";
import cors from "cors";
import path from "path";
import { healthRouter } from "./routes/health.routes.js";
import { projectsRouter } from "./routes/projects.routes.js";
import { roomsRouter } from "./routes/rooms.routes.js";
import { itemsRouter } from "./routes/items.routes.js";
import { providersRouter } from "./routes/providers.routes.js";

export const app = express();

app.use(cors());
app.use(express.json());

// Serve uploaded photos
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.get("/", (_req, res) => {
  res.status(200).json({
    ok: true,
    message: "PCS MoveIQ API is running"
  });
});

app.use("/api/health", healthRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/rooms", roomsRouter);
app.use("/api/items", itemsRouter);
app.use("/api/providers", providersRouter);