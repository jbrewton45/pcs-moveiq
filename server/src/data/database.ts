import Database from "better-sqlite3";
import path from "path";

// Resolve DB path relative to this file's location so it's consistent
// regardless of which directory the server process is started from.
// __dirname = server/dist at runtime → ../../moveiq.db = project root/moveiq.db
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, "../../moveiq.db");

export const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");
// Enable foreign keys
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL,
    displayName TEXT NOT NULL,
    branchOfService TEXT,
    dutyStation TEXT,
    preferredMarketplace TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    lastLoginAt TEXT
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    projectName TEXT NOT NULL,
    currentLocation TEXT NOT NULL,
    destination TEXT NOT NULL,
    moveType TEXT NOT NULL,
    planningStartDate TEXT NOT NULL,
    hardMoveDate TEXT NOT NULL,
    optionalPackoutDate TEXT,
    housingAssumption TEXT NOT NULL,
    userGoal TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    roomName TEXT NOT NULL,
    roomType TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    roomId TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    itemName TEXT NOT NULL,
    category TEXT NOT NULL,
    condition TEXT NOT NULL,
    sizeClass TEXT NOT NULL,
    notes TEXT,
    sentimentalFlag INTEGER NOT NULL DEFAULT 0,
    keepFlag INTEGER NOT NULL DEFAULT 0,
    willingToSell INTEGER NOT NULL DEFAULT 0,
    recommendation TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'UNREVIEWED',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
`);

// Migration: add userId to projects
try {
  db.exec("ALTER TABLE projects ADD COLUMN userId TEXT REFERENCES users(id)");
} catch { /* exists */ }

// Migration: add weightLbs column
try {
  db.exec("ALTER TABLE items ADD COLUMN weightLbs REAL");
} catch {
  // Column already exists — ignore
}

// Migration: add photoPath column
try {
  db.exec("ALTER TABLE items ADD COLUMN photoPath TEXT");
} catch {
  // Column already exists
}

// Migration: add weightAllowanceLbs column to projects
try {
  db.exec("ALTER TABLE projects ADD COLUMN weightAllowanceLbs REAL");
} catch {
  // Column already exists
}

// Migration: add identification fields to items
const identCols = [
  "identifiedName TEXT",
  "identifiedCategory TEXT",
  "identifiedBrand TEXT",
  "identifiedModel TEXT",
  "identificationConfidence REAL",
  "identificationReasoning TEXT",
  "identificationStatus TEXT DEFAULT 'NONE'",
];
for (const col of identCols) {
  try { db.exec(`ALTER TABLE items ADD COLUMN ${col}`); } catch { /* exists */ }
}

// Migration: add pricing fields to items
const priceCols = [
  "priceFastSale REAL",
  "priceFairMarket REAL",
  "priceReach REAL",
  "pricingConfidence REAL",
  "pricingReasoning TEXT",
  "pricingSuggestedChannel TEXT",
  "pricingSaleSpeedBand TEXT",
  "pricingLastUpdatedAt TEXT",
];
for (const col of priceCols) {
  try { db.exec(`ALTER TABLE items ADD COLUMN ${col}`); } catch { /* exists */ }
}

// Migration: add recommendationReason to items
try {
  db.exec("ALTER TABLE items ADD COLUMN recommendationReason TEXT");
} catch { /* exists */ }

// Create comparables table
db.exec(`
  CREATE TABLE IF NOT EXISTS comparables (
    id TEXT PRIMARY KEY,
    itemId TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    source TEXT NOT NULL,
    url TEXT,
    thumbnailUrl TEXT,
    price REAL NOT NULL,
    soldStatus TEXT,
    createdAt TEXT NOT NULL
  )
`);

// Migration: add clarification columns to items
try {
  db.exec("ALTER TABLE items ADD COLUMN pendingClarifications TEXT");
} catch { /* exists */ }

try {
  db.exec("ALTER TABLE items ADD COLUMN clarificationAnswers TEXT");
} catch { /* exists */ }
