import { Pool, type PoolClient } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("localhost")
    ? { rejectUnauthorized: false }
    : undefined,
});

export async function query(sql: string, params: unknown[] = []) {
  return pool.query(sql, params);
}

/** Run `fn` inside a Postgres transaction on a dedicated connection.
 *  Commits on resolve; rolls back on any thrown error; always releases. */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* swallow rollback-of-rollback */ }
    throw err;
  } finally {
    client.release();
  }
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
      "identificationQuality" TEXT,
      "pricingEligible"       BOOLEAN,
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
      "completedAt" TEXT,
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

    CREATE TABLE IF NOT EXISTS item_photos (
      id TEXT PRIMARY KEY,
      "itemId" TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      "photoPath" TEXT NOT NULL,
      "isPrimary" BOOLEAN NOT NULL DEFAULT FALSE,
      "createdAt" TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS item_photos_item_id_idx ON item_photos ("itemId");
    CREATE UNIQUE INDEX IF NOT EXISTS item_photos_primary_unique_idx ON item_photos ("itemId") WHERE "isPrimary" = TRUE;

    INSERT INTO item_photos (id, "itemId", "photoPath", "isPrimary", "createdAt")
    SELECT
      CONCAT(i.id, '_legacy_photo'),
      i.id,
      i."photoPath",
      TRUE,
      COALESCE(i."updatedAt", i."createdAt")
    FROM items i
    WHERE i."photoPath" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM item_photos ip
        WHERE ip."itemId" = i.id
          AND ip."photoPath" = i."photoPath"
      );

    -- Room visualization: most-recent scan per room (one-to-one via UNIQUE roomId)
    -- jsonb is used for geometry blobs so the scan is round-tripped as one document.
    CREATE TABLE IF NOT EXISTS room_scans (
      id              TEXT PRIMARY KEY,
      "roomId"        TEXT NOT NULL UNIQUE REFERENCES rooms(id) ON DELETE CASCADE,
      "schemaVersion" INTEGER NOT NULL DEFAULT 1,
      "widthM"        DOUBLE PRECISION NOT NULL,
      "lengthM"       DOUBLE PRECISION NOT NULL,
      "heightM"       DOUBLE PRECISION NOT NULL,
      "areaSqM"       DOUBLE PRECISION NOT NULL,
      "areaSqFt"      DOUBLE PRECISION NOT NULL,
      "areaSource"    TEXT NOT NULL DEFAULT 'bbox',
      "wallCount"     INTEGER NOT NULL DEFAULT 0,
      "doorCount"     INTEGER NOT NULL DEFAULT 0,
      "windowCount"   INTEGER NOT NULL DEFAULT 0,
      "polygonClosed" BOOLEAN NOT NULL DEFAULT FALSE,
      "hasCurvedWalls" BOOLEAN NOT NULL DEFAULT FALSE,
      "floorPolygon"  JSONB NOT NULL DEFAULT '[]'::jsonb,
      walls           JSONB NOT NULL DEFAULT '[]'::jsonb,
      openings        JSONB NOT NULL DEFAULT '[]'::jsonb,
      objects         JSONB NOT NULL DEFAULT '[]'::jsonb,
      "scannedAt"     TEXT NOT NULL,
      "createdAt"     TEXT NOT NULL,
      "updatedAt"     TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS room_scans_room_id_idx ON room_scans ("roomId");

    -- Phase 15: on-device USDZ file path for native iOS Quick Look.
    -- Stored as a string so older devices that couldn't export get NULL.
    ALTER TABLE room_scans ADD COLUMN IF NOT EXISTS "usdzPath" TEXT;

    -- Item placement columns (nullable; set by tag-to-room flow). Added via
    -- guarded ALTERs so existing installs upgrade in place without a migration tool.
    ALTER TABLE items ADD COLUMN IF NOT EXISTS "roomObjectId" TEXT;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS "roomPositionX" DOUBLE PRECISION;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS "roomPositionZ" DOUBLE PRECISION;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS "rotationY" DOUBLE PRECISION;

    -- Phase 10: optional listing URL (Facebook Marketplace / OfferUp / etc.)
    -- Nullable; set after the user posts the item for sale elsewhere.
    ALTER TABLE items ADD COLUMN IF NOT EXISTS "listingUrl" TEXT;

    -- Phase 11: realized sell price in USD. Nullable; set when the item
    -- actually sells so we can show revenue totals and feed back into future
    -- recommendations.
    ALTER TABLE items ADD COLUMN IF NOT EXISTS "soldPriceUsd" REAL;

    -- Identification quality tier and pricing eligibility flag. Computed
    -- server-side from identifiedName, identifiedCategory, confidence, and
    -- provider; never written by providers directly.
    ALTER TABLE items ADD COLUMN IF NOT EXISTS "identificationQuality" TEXT;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS "pricingEligible"       BOOLEAN;

    -- Workstream F: timestamp when an item reached a terminal status
    -- (SOLD, DONATED, SHIPPED, DISCARDED). Existing terminal-status rows
    -- keep completedAt = NULL — no backfill is performed.
    ALTER TABLE items ADD COLUMN IF NOT EXISTS "completedAt" TEXT;
  `);
}
