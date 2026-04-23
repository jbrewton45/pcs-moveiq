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
      "likelyModelOptions"      TEXT,
      "requiresModelSelection"  BOOLEAN NOT NULL DEFAULT FALSE,
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

    -- Workstream L: model disambiguation fields. likelyModelOptions stores a
    -- JSON-encoded string[] of candidate model names returned by the provider.
    -- requiresModelSelection signals the frontend to prompt the user to pick.
    ALTER TABLE items ADD COLUMN IF NOT EXISTS "likelyModelOptions"     TEXT;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS "requiresModelSelection" BOOLEAN NOT NULL DEFAULT FALSE;

    -- ─────────────────────────────────────────────────────────────────────
    --  Phase 1 — Inventory / Decision layer split (additive, idempotent).
    --  Introduces the two-layer model without dropping any legacy column.
    --  Dual-write / column drops happen in later migration phases.
    -- ─────────────────────────────────────────────────────────────────────

    -- Inventory-layer additions to items.
    ALTER TABLE items ADD COLUMN IF NOT EXISTS brand          TEXT;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS model          TEXT;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS "serialNumber" TEXT;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS quantity       INTEGER NOT NULL DEFAULT 1;

    -- Relax NOT NULL on recommendation so createItem can write inventory-only rows.
    -- The column itself is kept for backward compatibility; physically dropped in Phase 4.
    ALTER TABLE items ALTER COLUMN recommendation DROP NOT NULL;

    -- Decision layer — one row per item_id when the user has engaged past bare creation.
    -- Intent enum values: sell | keep | ship | donate | undecided | discarded.
    CREATE TABLE IF NOT EXISTS item_decisions (
      "itemId"                  TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
      intent                    TEXT NOT NULL DEFAULT 'undecided',
      recommendation            TEXT NOT NULL,
      "recommendationReason"    TEXT,
      "urgencyBucket"           TEXT, -- populated in Phase 3; currently computed at read-time only, not persisted
      "pricingEligible"         BOOLEAN,
      "priceFastSale"           DOUBLE PRECISION,
      "priceFairMarket"         DOUBLE PRECISION,
      "priceReach"              DOUBLE PRECISION,
      "pricingConfidence"       DOUBLE PRECISION,
      "pricingReasoning"        TEXT,
      "pricingSuggestedChannel" TEXT,
      "pricingSaleSpeedBand"    TEXT,
      "pricingLastUpdatedAt"    TEXT,
      "identifiedName"          TEXT,
      "identifiedCategory"      TEXT,
      "identifiedBrand"         TEXT,
      "identifiedModel"         TEXT,
      "likelyModelOptions"      TEXT,
      "requiresModelSelection"  BOOLEAN NOT NULL DEFAULT FALSE,
      "identificationConfidence" DOUBLE PRECISION,
      "identificationReasoning" TEXT,
      "identificationStatus"    TEXT NOT NULL DEFAULT 'NONE',
      "identificationQuality"   TEXT,
      "pendingClarifications"   TEXT,
      "clarificationAnswers"    TEXT,
      "listingUrl"              TEXT,
      "soldPriceUsd"            DOUBLE PRECISION,
      "decidedAt"               TEXT,
      "completedAt"             TEXT,
      "createdAt"               TEXT NOT NULL,
      "updatedAt"               TEXT NOT NULL
    );

    -- Receipt photos — separate from item_photos (product imagery) for clean semantics.
    CREATE TABLE IF NOT EXISTS receipt_photos (
      id          TEXT PRIMARY KEY,
      "itemId"    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      "photoPath" TEXT NOT NULL,
      "createdAt" TEXT NOT NULL
    );

    -- Indexes: hot paths for Phase-2 reads.
    CREATE INDEX IF NOT EXISTS items_room_id_idx            ON items ("roomId");
    CREATE INDEX IF NOT EXISTS items_project_id_idx         ON items ("projectId");
    CREATE INDEX IF NOT EXISTS item_decisions_completed_idx ON item_decisions ("completedAt") WHERE "completedAt" IS NOT NULL;
    CREATE INDEX IF NOT EXISTS item_decisions_intent_idx    ON item_decisions (intent);
    CREATE INDEX IF NOT EXISTS receipt_photos_item_id_idx   ON receipt_photos ("itemId");

    -- ── Backfill (idempotent via ON CONFLICT DO NOTHING on item_decisions PK) ──

    -- Primary: for every item with user engagement past bare creation, insert a
    -- decision row. Discriminator per approved design:
    --   status != 'UNREVIEWED'  OR  identificationStatus != 'NONE'
    INSERT INTO item_decisions (
      "itemId", intent, recommendation, "recommendationReason",
      "pricingEligible", "priceFastSale", "priceFairMarket", "priceReach",
      "pricingConfidence", "pricingReasoning", "pricingSuggestedChannel",
      "pricingSaleSpeedBand", "pricingLastUpdatedAt",
      "identifiedName", "identifiedCategory", "identifiedBrand", "identifiedModel",
      "likelyModelOptions", "requiresModelSelection",
      "identificationConfidence", "identificationReasoning",
      "identificationStatus", "identificationQuality",
      "pendingClarifications", "clarificationAnswers",
      "listingUrl", "soldPriceUsd",
      "decidedAt", "completedAt",
      "createdAt", "updatedAt"
    )
    SELECT
      i.id,
      CASE i.status
        WHEN 'LISTED'    THEN 'sell'
        WHEN 'KEPT'      THEN 'keep'
        WHEN 'SOLD'      THEN 'sell'
        WHEN 'SHIPPED'   THEN 'ship'
        WHEN 'DONATED'  THEN 'donate'
        WHEN 'DISCARDED' THEN 'discarded'
        ELSE                   'undecided'
      END AS intent,
      COALESCE(i.recommendation, 'KEEP') AS recommendation,
      i."recommendationReason",
      i."pricingEligible", i."priceFastSale", i."priceFairMarket", i."priceReach",
      i."pricingConfidence", i."pricingReasoning", i."pricingSuggestedChannel",
      i."pricingSaleSpeedBand", i."pricingLastUpdatedAt",
      i."identifiedName", i."identifiedCategory", i."identifiedBrand", i."identifiedModel",
      i."likelyModelOptions", COALESCE(i."requiresModelSelection", FALSE),
      i."identificationConfidence", i."identificationReasoning",
      COALESCE(i."identificationStatus", 'NONE'), i."identificationQuality",
      i."pendingClarifications", i."clarificationAnswers",
      i."listingUrl", i."soldPriceUsd",
      CASE
        WHEN i.status = 'DISCARDED' THEN NULL
        ELSE i."updatedAt"
      END AS "decidedAt",
      i."completedAt",
      NOW()::text,
      NOW()::text
    FROM items i
    WHERE i.status <> 'UNREVIEWED'
       OR COALESCE(i."identificationStatus", 'NONE') <> 'NONE'
    ON CONFLICT ("itemId") DO NOTHING;

    -- Supplementary: keepFlag = TRUE rows that didn't qualify under the primary
    -- discriminator (e.g. UNREVIEWED + identificationStatus NONE + keepFlag TRUE).
    INSERT INTO item_decisions (
      "itemId", intent, recommendation, "decidedAt", "createdAt", "updatedAt"
    )
    SELECT
      i.id,
      'keep',
      COALESCE(i.recommendation, 'KEEP'),
      i."updatedAt",
      NOW()::text,
      NOW()::text
    FROM items i
    WHERE i."keepFlag" = TRUE
    ON CONFLICT ("itemId") DO NOTHING;

    -- Supplementary: sentimental flag becomes a free-text note.
    -- Guarded with LIKE to keep the migration idempotent across re-runs.
    UPDATE items
       SET notes = CASE
         WHEN notes IS NULL OR notes = '' THEN '[Sentimental]'
         ELSE notes || ' [Sentimental]'
       END
     WHERE "sentimentalFlag" = TRUE
       AND (notes IS NULL OR notes NOT LIKE '%[Sentimental]%');
  `);
}
