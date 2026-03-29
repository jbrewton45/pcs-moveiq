import dotenv from "dotenv";
import { app } from "./app.js";
import { initializeSchema } from "./data/database.js";

dotenv.config();

const PORT = process.env.PORT || 5000;

async function start() {
  await initializeSchema();
  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`PCS MoveIQ server running on http://0.0.0.0:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
