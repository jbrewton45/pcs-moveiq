import { Pool } from "pg";
import { query } from "../data/database.js";
import type { RoomScan } from "../types/domain.js";
import { createId } from "../utils/id.js";
import { rowToRoomScan } from "../utils/converters.js";

// Re-use the pool indirectly via `query`, but for the one transactional path
// below we also need a dedicated client, so grab it via a second Pool bound to
// the same DATABASE_URL. We import the same config by reading process.env
// directly — matches database.ts's construction so SSL + localhost handling
// stay in lockstep.
const txPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("localhost")
    ? { rejectUnauthorized: false }
    : undefined,
});

export interface UpsertRoomScanInput {
  schemaVersion: number;
  widthM: number;
  lengthM: number;
  heightM: number;
  areaSqM: number;
  /** If omitted, server derives from areaSqM via the 10.7639 factor. */
  areaSqFt?: number;
  areaSource: "shoelace" | "bbox";
  wallCount: number;
  doorCount: number;
  windowCount: number;
  polygonClosed: boolean;
  hasCurvedWalls: boolean;
  floorPolygon: Array<{ x: number; z: number }>;
  walls: RoomScan["walls"];
  openings: RoomScan["openings"];
  objects: RoomScan["objects"];
  /** Phase 15: optional on-device USDZ path. */
  usdzPath?: string;
  scannedAt: string;
}

function sqMToSqFt(sqM: number): number {
  return Math.round(sqM * 10.7639 * 100) / 100; // round to 2 dp
}

export async function getRoomScan(roomId: string): Promise<RoomScan | null> {
  const result = await query(
    'SELECT * FROM room_scans WHERE "roomId" = $1 LIMIT 1',
    [roomId]
  );
  if (result.rows.length === 0) return null;
  return rowToRoomScan(result.rows[0] as Record<string, unknown>);
}

/**
 * Upsert the most-recent scan for a room. One-to-one — there is a UNIQUE
 * constraint on roomId, so any previous scan is removed first inside the same
 * transaction. Item placements referencing objectIds from the old scan are NOT
 * cleared here; callers (or a future V2 feature) decide when to re-link.
 */
export async function upsertRoomScan(
  roomId: string,
  input: UpsertRoomScanInput
): Promise<RoomScan> {
  const now = new Date().toISOString();
  const id = createId("scan");
  const areaSqFt = input.areaSqFt ?? sqMToSqFt(input.areaSqM);

  const client = await txPool.connect();
  try {
    await client.query("BEGIN");

    await client.query('DELETE FROM room_scans WHERE "roomId" = $1', [roomId]);

    await client.query(
      `INSERT INTO room_scans (
        id, "roomId", "schemaVersion",
        "widthM", "lengthM", "heightM",
        "areaSqM", "areaSqFt", "areaSource",
        "wallCount", "doorCount", "windowCount",
        "polygonClosed", "hasCurvedWalls",
        "floorPolygon", walls, openings, objects,
        "usdzPath",
        "scannedAt", "createdAt", "updatedAt"
      ) VALUES (
        $1, $2, $3,
        $4, $5, $6,
        $7, $8, $9,
        $10, $11, $12,
        $13, $14,
        $15::jsonb, $16::jsonb, $17::jsonb, $18::jsonb,
        $19,
        $20, $21, $22
      )`,
      [
        id, roomId, input.schemaVersion,
        input.widthM, input.lengthM, input.heightM,
        input.areaSqM, areaSqFt, input.areaSource,
        input.wallCount, input.doorCount, input.windowCount,
        input.polygonClosed, input.hasCurvedWalls,
        JSON.stringify(input.floorPolygon),
        JSON.stringify(input.walls),
        JSON.stringify(input.openings),
        JSON.stringify(input.objects),
        input.usdzPath ?? null,
        input.scannedAt, now, now,
      ]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const scan = await getRoomScan(roomId);
  if (!scan) {
    // Should never happen — we just inserted it — but guard anyway so callers
    // can rely on the non-null return.
    throw new Error(`Upserted scan for room ${roomId} but could not read it back`);
  }
  return scan;
}
