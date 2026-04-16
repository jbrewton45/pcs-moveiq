import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import type { Project, Room, RoomScanData } from "../types";
import { api } from "../api";
import { RoomScanPlugin, sqMToSqFt, mToFtIn } from "../plugins/RoomScanPlugin";
import { saveScan, getScan } from "../plugins/scanStore";

// ─────────────────────────────────────────────────────────────────────────────
//  Constants & helpers
// ─────────────────────────────────────────────────────────────────────────────

const ROOM_EMOJIS: Record<string, string> = {
  "Living Room": "🛋️",
  "Bedroom": "🛏️",
  "Kitchen": "🍳",
  "Bathroom": "🚿",
  "Garage": "🔧",
  "Office": "💻",
  "Storage": "📦",
  "Dining Room": "🍽️",
  "Laundry": "🧺",
  "Other": "📋",
};

function roomEmoji(type: string): string {
  return ROOM_EMOJIS[type] ?? "🏠";
}

interface RoomWithScan extends Room {
  scanData?: RoomScanData;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Sub-components
// ─────────────────────────────────────────────────────────────────────────────

// Simple floor polygon SVG visualisation
function FloorPolygonSVG({ polygon }: { polygon: Array<{ x: number; z: number }> }) {
  if (polygon.length < 3) return null;

  const xs = polygon.map(p => p.x);
  const zs = polygon.map(p => p.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const rangeX = maxX - minX || 1;
  const rangeZ = maxZ - minZ || 1;

  const SIZE = 160;
  const PAD = 12;
  const scaleX = (SIZE - PAD * 2) / rangeX;
  const scaleZ = (SIZE - PAD * 2) / rangeZ;

  const points = polygon
    .map(p => `${PAD + (p.x - minX) * scaleX},${PAD + (p.z - minZ) * scaleZ}`)
    .join(" ");

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      style={{ display: "block", margin: "0 auto" }}
    >
      <rect width={SIZE} height={SIZE} rx="12" fill="var(--bg-elevated)" />
      <polygon
        points={points}
        fill="var(--accent-bg)"
        stroke="var(--accent-light)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Room tile showing scan state
function RoomTile({
  room,
  onScan,
  onView,
  scanning,
}: {
  room: RoomWithScan;
  onScan: (room: RoomWithScan) => void;
  onView: (room: RoomWithScan) => void;
  scanning: boolean;
}) {
  const hasScan = Boolean(room.scanData);
  const sd = room.scanData;

  return (
    <div style={{
      background: "var(--bg-card)",
      border: `1px solid ${hasScan ? "var(--accent-border)" : "var(--border-soft)"}`,
      borderRadius: "var(--radius-md)",
      padding: "var(--space-4)",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-3)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        <div style={{
          width: 42, height: 42,
          background: hasScan ? "var(--accent-bg)" : "var(--bg-elevated)",
          borderRadius: 12,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, flexShrink: 0,
        }}>
          {roomEmoji(room.roomType)}
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
            {room.roomName}
          </p>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
            {hasScan
              ? `${sqMToSqFt(sd!.areaSqM).toLocaleString()} sq ft · scanned`
              : "Not yet scanned"}
          </p>
        </div>
        {hasScan && (
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
            textTransform: "uppercase",
            background: "rgba(34,197,94,0.12)", color: "#22c55e",
            borderRadius: 999, padding: "3px 8px",
          }}>✓ Scanned</span>
        )}
      </div>

      {/* Scan stats */}
      {hasScan && sd && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[
            { label: "Width", value: mToFtIn(sd.widthM) },
            { label: "Length", value: mToFtIn(sd.lengthM) },
            { label: "Area", value: `${sqMToSqFt(sd.areaSqM)} ft²` },
          ].map(({ label, value }) => (
            <div key={label} style={{
              background: "var(--bg-elevated)", borderRadius: 8, padding: "8px 6px", textAlign: "center",
            }}>
              <p style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 2px" }}>{label}</p>
              <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Floor polygon mini-map */}
      {hasScan && sd?.floorPolygon && sd.floorPolygon.length >= 3 && (
        <FloorPolygonSVG polygon={sd.floorPolygon} />
      )}

      {/* Detail badges */}
      {hasScan && sd && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            { icon: "🧱", text: `${sd.wallCount} wall${sd.wallCount !== 1 ? "s" : ""}` },
            { icon: "🚪", text: `${sd.doorCount} door${sd.doorCount !== 1 ? "s" : ""}` },
            { icon: "🪟", text: `${sd.windowCount} window${sd.windowCount !== 1 ? "s" : ""}` },
          ].map(({ icon, text }) => (
            <span key={text} style={{
              fontSize: 11, fontWeight: 600,
              background: "var(--bg-elevated)", color: "var(--text-secondary)",
              borderRadius: 999, padding: "3px 10px",
            }}>{icon} {text}</span>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="homer-btn-primary"
          style={{ flex: 1, fontSize: 13, padding: "8px 12px" }}
          onClick={() => onScan(room)}
          disabled={scanning}
        >
          {hasScan ? "Re-scan" : "📷 Scan Room"}
        </button>
        <button
          className="homer-btn-secondary"
          style={{ flex: 1, fontSize: 13, padding: "8px 12px" }}
          onClick={() => onView(room)}
        >
          View Items →
        </button>
      </div>
    </div>
  );
}

// Scanning overlay (shown while native scan is running)
function ScanningOverlay({ roomName, onCancel }: { roomName: string; onCancel: () => void }) {
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.88)",
      zIndex: 100,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 24, padding: 32,
    }}>
      <div style={{
        width: 80, height: 80,
        background: "var(--accent-bg)",
        borderRadius: 24,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 40,
        animation: "pulse 1.5s ease-in-out infinite",
      }}>
        📡
      </div>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
          LiDAR Scanning
        </p>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", marginBottom: 4 }}>
          {roomName}
        </p>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", maxWidth: 260, lineHeight: 1.6 }}>
          The native scanning view is open on your device. Walk slowly around the room, then tap "Done Scanning".
        </p>
      </div>
      <button
        onClick={onCancel}
        style={{
          background: "rgba(255,255,255,0.1)",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.2)",
          borderRadius: 999,
          padding: "10px 24px",
          fontSize: 14, fontWeight: 600, cursor: "pointer",
        }}
      >
        Cancel
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main View
// ─────────────────────────────────────────────────────────────────────────────

export function FloorplanView() {
  const navigate = useNavigate();

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [rooms, setRooms] = useState<RoomWithScan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [scanningRoom, setScanningRoom] = useState<RoomWithScan | null>(null);
  const [isNative] = useState(() => Capacitor.isNativePlatform());
  const [lidarSupported, setLidarSupported] = useState<boolean | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanSuccess, setScanSuccess] = useState<string | null>(null);

  // Check LiDAR support on mount
  useEffect(() => {
    if (!isNative) {
      setLidarSupported(false);
      return;
    }
    RoomScanPlugin.checkSupport()
      .then(({ supported }) => setLidarSupported(supported))
      .catch(() => setLidarSupported(false));
  }, [isNative]);

  // Load projects
  useEffect(() => {
    let cancelled = false;
    api.listProjects()
      .then(projs => {
        if (!cancelled) {
          setProjects(projs);
          if (projs.length > 0) setSelectedProject(projs[0]);
        }
      })
      .catch(() => { if (!cancelled) setProjects([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Load rooms when project changes
  useEffect(() => {
    if (!selectedProject) return;
    let cancelled = false;
    setLoadingRooms(true);

    async function loadRooms() {
      try {
        const rawRooms = await api.listRooms(selectedProject!.id);
        // Enrich each room with any locally cached scan data
        const enriched: RoomWithScan[] = rawRooms.map(room => ({
          ...room,
          scanData: getScan(room.id),
        }));
        if (!cancelled) setRooms(enriched);
      } catch {
        if (!cancelled) setRooms([]);
      } finally {
        if (!cancelled) setLoadingRooms(false);
      }
    }

    void loadRooms();
    return () => { cancelled = true; };
  }, [selectedProject]);

  // Launch LiDAR scan
  const handleScan = useCallback(async (room: RoomWithScan) => {
    setScanError(null);

    // 🔥 Always check native support at runtime (DO NOT trust cached state)
    try {
      const support = await RoomScanPlugin.checkSupport();

      console.log("[Floorplan] Native LiDAR support:", support);

      if (!support.supported) {
        setScanError("LiDAR scanning is not supported on this device.");
        return;
      }
    } catch (err) {
      console.error("[Floorplan] checkSupport failed:", err);
      setScanError("Failed to verify LiDAR support.");
      return;
    }

    setScanningRoom(room);

    try {
      const scanData: RoomScanData = await RoomScanPlugin.startScan();

      const payloadBytes = JSON.stringify(scanData).length;
      console.log(
        `[Floorplan] Scan payload ready — ${payloadBytes} bytes, walls=${scanData.wallCount}, openings=${scanData.openings?.length ?? 0}, objects=${scanData.objects?.length ?? 0}`
      );

      // Persist to server (source of truth). Fall back to localStorage if the
      // write fails so the scan isn't lost — the next scan or GET refill will
      // reconcile.
      try {
        const persisted = await api.putRoomScan(room.id, scanData);
        console.log(
          `[Floorplan] PUT /rooms/${room.id}/scan 200 — id=${persisted.id} areaSqFt=${persisted.areaSqFt}`
        );
      } catch (persistErr) {
        console.warn(
          "[Floorplan] PUT scan failed, falling back to localStorage:",
          persistErr
        );
        saveScan(room.id, scanData);
      }

      setRooms(prev =>
        prev.map(r => r.id === room.id ? { ...r, scanData } : r)
      );

      setScanSuccess(
        `${room.roomName} scanned — ${sqMToSqFt(scanData.areaSqM).toLocaleString()} sq ft`
      );

      setTimeout(() => setScanSuccess(null), 4000);

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Scan failed";

      console.error("[Floorplan] scan error:", msg);

      if (!msg.includes("cancelled")) {
        setScanError(msg);
      }
    } finally {
      setScanningRoom(null);
    }
  }, []);

  // Cancel an in-flight native scan
  const handleCancelScan = useCallback(() => {
    RoomScanPlugin.stopScan().catch(() => {});
    setScanningRoom(null);
  }, []);

  // Stats
  const scannedRooms = rooms.filter(r => r.scanData);
  const totalAreaSqFt = scannedRooms.reduce((s, r) => s + sqMToSqFt(r.scanData!.areaSqM), 0);

  if (loading) return (
    <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--text-secondary)" }}>
      Loading floorplan...
    </div>
  );

  if (projects.length === 0) return (
    <div style={{ padding: "32px 16px", textAlign: "center" }}>
      <div style={{ fontSize: "40px", marginBottom: "12px" }}>🏠</div>
      <p style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: "17px", marginBottom: "6px" }}>
        No projects yet
      </p>
      <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginBottom: "16px" }}>
        Create a project and add rooms to scan your home.
      </p>
      <button className="homer-btn-primary" onClick={() => navigate("/")}>
        Create a Project
      </button>
    </div>
  );

  return (
    <>
      {/* Native scanning overlay */}
      {scanningRoom && (
        <ScanningOverlay roomName={scanningRoom.roomName} onCancel={handleCancelScan} />
      )}

      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "20px" }}>

        {/* Project selector */}
        {projects.length > 1 && (
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
            {projects.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedProject(p)}
                style={{
                  flexShrink: 0, padding: "6px 14px", borderRadius: 999, border: "1px solid",
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                  background: selectedProject?.id === p.id ? "var(--accent)" : "var(--bg-card)",
                  color:      selectedProject?.id === p.id ? "#fff" : "var(--text-secondary)",
                  borderColor: selectedProject?.id === p.id ? "var(--accent)" : "var(--border-soft)",
                }}
              >
                {p.projectName}
              </button>
            ))}
          </div>
        )}

        {/* Notifications */}
        {scanSuccess && (
          <div style={{
            background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)",
            borderRadius: "var(--radius-md)", padding: "12px 16px",
            color: "#22c55e", fontSize: 14, fontWeight: 600,
          }}>
            ✓ {scanSuccess}
          </div>
        )}
        {scanError && (
          <div style={{
            background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: "var(--radius-md)", padding: "12px 16px",
            display: "flex", justifyContent: "space-between", alignItems: "flex-start",
          }}>
            <p style={{ color: "#ef4444", fontSize: 13, lineHeight: 1.5, margin: 0 }}>⚠️ {scanError}</p>
            <button onClick={() => setScanError(null)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16, paddingLeft: 8 }}>✕</button>
          </div>
        )}

        {/* LiDAR availability banner */}
        {lidarSupported === false && (
          <div style={{
            background: "rgba(59,130,246,0.08)", border: "1px solid var(--accent-border)",
            borderRadius: "var(--radius-md)", padding: "var(--space-4)",
          }}>
            <p style={{ color: "var(--accent-light)", fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
              {isNative ? "📱 LiDAR Not Available on This Device" : "📱 iOS App Required for LiDAR Scanning"}
            </p>
            <p style={{ color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.5, margin: 0 }}>
              {isNative
                ? "LiDAR room scanning requires an iPhone Pro or iPad Pro model equipped with a LiDAR sensor."
                : "Open the PCS MoveIQ iOS app on a LiDAR-equipped iPhone Pro or iPad Pro to use room scanning."}
            </p>
          </div>
        )}

        {lidarSupported === true && (
          <div style={{
            background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)",
            borderRadius: "var(--radius-md)", padding: "var(--space-4)",
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <span style={{ fontSize: 28 }}>✅</span>
            <div>
              <p style={{ color: "#22c55e", fontWeight: 700, fontSize: 14, marginBottom: 2 }}>
                LiDAR Ready
              </p>
              <p style={{ color: "var(--text-secondary)", fontSize: 12, margin: 0 }}>
                Your device supports room scanning. Tap "Scan Room" on any room below.
              </p>
            </div>
          </div>
        )}

        {/* Summary stats (when rooms are scanned) */}
        {scannedRooms.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--space-3)" }}>
            {[
              { label: "Rooms",   value: rooms.length.toString(),            icon: "🚪" },
              { label: "Scanned", value: scannedRooms.length.toString(),     icon: "✅" },
              { label: "Total",   value: `${totalAreaSqFt.toLocaleString()} ft²`, icon: "📐" },
            ].map(({ label, value, icon }) => (
              <div key={label} style={{
                background: "var(--bg-card)", border: "1px solid var(--border-soft)",
                borderRadius: "var(--radius-md)", padding: "var(--space-3)", textAlign: "center",
              }}>
                <p style={{ fontSize: 18, marginBottom: 2 }}>{icon}</p>
                <p style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 2px" }}>{value}</p>
                <p style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Room tiles */}
        {loadingRooms ? (
          <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: 24 }}>Loading rooms...</div>
        ) : rooms.length > 0 ? (
          <div>
            <p className="homer-section-label">Rooms ({rooms.length})</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {rooms.map(room => (
                <RoomTile
                  key={room.id}
                  room={room}
                  scanning={scanningRoom !== null}
                  onScan={handleScan}
                  onView={r => navigate(`/projects/${selectedProject?.id}/rooms/${r.id}`)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div style={{
            background: "var(--bg-card)", border: "1px solid var(--border-soft)",
            borderRadius: "var(--radius-md)", padding: "var(--space-6)", textAlign: "center",
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🗺️</div>
            <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>
              No rooms yet. Add rooms in the Inventory tab to start scanning.
            </p>
          </div>
        )}

        {/* How it works */}
        <div>
          <p className="homer-section-label">How Scanning Works</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {[
              { icon: "📡", step: "1", title: "LiDAR Depth Sensor", desc: "Your iPhone fires infrared pulses to measure distances to surfaces at 30 fps — even in the dark." },
              { icon: "🏗️", step: "2", title: "Apple RoomPlan", desc: "Apple's ML model identifies walls, windows, doors, and furniture in real time as you walk." },
              { icon: "📐", step: "3", title: "Accurate Dimensions", desc: "Rooms are measured to within a few centimetres — no tape measure or laser rangefinder needed." },
              { icon: "💾", step: "4", title: "Saved to Your Project", desc: "Scan results are attached to each room and available offline — including a 2D floor polygon." },
            ].map(({ icon, step, title, desc }) => (
              <div key={step} style={{
                background: "var(--bg-card)", border: "1px solid var(--border-soft)",
                borderRadius: "var(--radius-md)", padding: "var(--space-4)",
                display: "flex", alignItems: "flex-start", gap: "var(--space-3)",
              }}>
                <div style={{
                  width: 40, height: 40, background: "var(--accent-bg)",
                  borderRadius: 10, display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 20, flexShrink: 0,
                }}>
                  {icon}
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>{title}</p>
                  <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </>
  );
}
