import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("localhost")
    ? { rejectUnauthorized: false }
    : undefined,
});

export async function query(sql: string, params: unknown[] = []) {
  return pool.query(sql, params);
}

export async function initializeSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      "passwordHash" TEXT NOT NULL,
      "displayName" TEXT NOT NULL,
      "branchOfService" TEXT,
      "dutyStation" TEXT,
      "preferredMarketplace" TEXT,
      "createdAt" TEXT NOT NULL,
      "updatedAt" TEXT NOT NULL,
      "lastLoginAt" TEXT
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      "userId" TEXT REFERENCES users(id),
      "projectName" TEXT NOT NULL,
      "currentLocation" TEXT NOT NULL,
      destination TEXT NOT NULL,
      "moveType" TEXT NOT NULL,
      "planningStartDate" TEXT NOT NULL,
      "hardMoveDate" TEXT NOT NULL,
      "optionalPackoutDate" TEXT,
      "housingAssumption" TEXT NOT NULL,
      "userGoal" TEXT NOT NULL,
      "weightAllowanceLbs" DOUBLE PRECISION,
      "createdAt" TEXT NOT NULL,
      "updatedAt" TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      "projectId" TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      "roomName" TEXT NOT NULL,
      "roomType" TEXT NOT NULL,
      "createdAt" TEXT NOT NULL,
      "updatedAt" TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      "projectId" TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      "roomId" TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      "itemName" TEXT NOT NULL,
      category TEXT NOT NULL,
      condition TEXT NOT NULL,
      "sizeClass" TEXT NOT NULL,
      notes TEXT,
      "sentimentalFlag" BOOLEAN NOT NULL DEFAULT FALSE,
      "keepFlag" BOOLEAN NOT NULL DEFAULT FALSE,
      "willingToSell" BOOLEAN NOT NULL DEFAULT FALSE,
      recommendation TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'UNREVIEWED',
      "weightLbs" DOUBLE PRECISION,
      "photoPath" TEXT,
      "identifiedName" TEXT,
      "identifiedCategory" TEXT,
      "identifiedBrand" TEXT,
      "identifiedModel" TEXT,
      "identificationConfidence" DOUBLE PRECISION,
      "identificationReasoning" TEXT,
      "identificationStatus" TEXT DEFAULT 'NONE',
      "priceFastSale" DOUBLE PRECISION,
      "priceFairMarket" DOUBLE PRECISION,
      "priceReach" DOUBLE PRECISION,
      "pricingConfidence" DOUBLE PRECISION,
      "pricingReasoning" TEXT,
      "pricingSuggestedChannel" TEXT,
      "pricingSaleSpeedBand" TEXT,
      "pricingLastUpdatedAt" TEXT,
      "recommendationReason" TEXT,
      "pendingClarifications" TEXT,
      "clarificationAnswers" TEXT,
      "createdAt" TEXT NOT NULL,
      "updatedAt" TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS comparables (
      id TEXT PRIMARY KEY,
      "itemId" TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      source TEXT NOT NULL,
      url TEXT,
      "thumbnailUrl" TEXT,
      price DOUBLE PRECISION NOT NULL,
      "soldStatus" TEXT,
      "createdAt" TEXT NOT NULL
    );
  `);
}
