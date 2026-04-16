import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { Capacitor } from "@capacitor/core";
import type { Item, OrphanedItem, Recommendation, RoomScan, ScannedObject, ScannedOpening, ScannedWall } from "../types";
import { sqMToSqFt, RoomScanPlugin } from "../plugins/RoomScanPlugin";
import { api } from "../api";

// ─────────────────────────────────────────────────────────────────────────────
//  Color maps
// ─────────────────────────────────────────────────────────────────────────────

const REC_COLOR: Record<Recommendation, string> = {
  SELL_NOW: "#ef4444",
  SELL_SOON: "#f97316",
  KEEP: "#22c55e",
  SHIP: "#3b82f6",
  DONATE: "#eab308",
  STORE: "#6b7280",
  DISCARD: "#475569",
  COMPLETE: "#64748b", // Phase 10: terminal/sold state
};

const OPENING_COLOR = {
  door: "#22c55e",
  window: "#3b82f6",
} as const;

const OBJECT_FILL = "rgba(148, 163, 184, 0.25)";
const OBJECT_STROKE = "#475569";
const OBJECT_STROKE_SELECTED = "#3b82f6";
const WALL_STROKE = "#1f2937";
const FLOOR_FILL = "rgba(59, 130, 246, 0.06)";
const FLOOR_STROKE = "#94a3b8";

// ─────────────────────────────────────────────────────────────────────────────
//  Geometry helpers
// ─────────────────────────────────────────────────────────────────────────────

const PX_PER_M = 120;
const PAD_M = 0.5;
const DRAG_THRESHOLD_PX = 8;

interface Bounds { minX: number; minZ: number; maxX: number; maxZ: number; }

function computeBounds(scan: RoomScan, items: Item[]): Bounds {
  const xs: number[] = []; const zs: number[] = [];
  for (const p of scan.floorPolygon) { xs.push(p.x); zs.push(p.z); }
  for (const w of scan.walls)        { xs.push(w.transform.x); zs.push(w.transform.z); }
  for (const op of scan.openings)    { xs.push(op.absolutePosition.x); zs.push(op.absolutePosition.z); }
  for (const o of scan.objects)      { xs.push(o.transform.x); zs.push(o.transform.z); }
  for (const it of items) {
    if (it.roomPositionX != null && it.roomPositionZ != null) {
      xs.push(it.roomPositionX); zs.push(it.roomPositionZ);
    }
  }
  if (xs.length === 0) return { minX: -2, minZ: -2, maxX: 2, maxZ: 2 };
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

function toPx(mX: number, mZ: number, b: Bounds) {
  return { u: (mX - b.minX + PAD_M) * PX_PER_M, v: (mZ - b.minZ + PAD_M) * PX_PER_M };
}

function radToDeg(r: number): number { return (r * 180) / Math.PI; }

/** Client (pixel) → room-local metres, using the SVG's transform matrix. */
function clientToRoom(clientX: number, clientY: number, svg: SVGSVGElement, b: Bounds): { x: number; z: number } | null {
  const pt = svg.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const loc = pt.matrixTransform(ctm.inverse());
  return {
    x: loc.x / PX_PER_M + b.minX - PAD_M,
    z: loc.y / PX_PER_M + b.minZ - PAD_M,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Auto-placement suggestions
// ─────────────────────────────────────────────────────────────────────────────

/** Keywords → RoomPlan object labels. We normalize both sides to lower-case. */
const LABEL_KEYWORDS: Record<string, string[]> = {
  sofa:         ["sofa", "couch", "loveseat", "sectional"],
  bed:          ["bed", "mattress", "crib"],
  table:        ["table", "desk", "dining", "coffee table", "end table", "nightstand"],
  chair:        ["chair", "armchair", "recliner"],
  television:   ["tv", "television", "monitor", "screen"],
  refrigerator: ["fridge", "refrigerator"],
  stove:        ["stove", "oven", "range", "cooktop"],
  dishwasher:   ["dishwasher"],
  sink:         ["sink"],
  toilet:       ["toilet"],
  bathtub:      ["bathtub", "tub", "bath"],
  washer:       ["washer", "washing machine"],
  dryer:        ["dryer"],
  storage:      ["storage", "dresser", "wardrobe", "cabinet", "shelf", "bookshelf", "armoire"],
  stairs:       ["stairs", "staircase"],
  fireplace:    ["fireplace"],
};

interface Suggestion {
  itemId: string;
  itemName: string;
  recommendation: Recommendation;
  objectId: string;
  objectLabel: string;
  score: number;
}

function buildSuggestions(scan: RoomScan, unplacedItems: Item[]): Suggestion[] {
  // Track which objectIds have been suggested so we don't propose the same
  // object for multiple items (causes confusion).
  const claimed = new Set<string>();
  const suggestions: Suggestion[] = [];

  for (const item of unplacedItems) {
    const needle = [
      item.itemName,
      item.category,
      item.identifiedName,
      item.identifiedCategory,
    ].filter(Boolean).join(" ").toLowerCase();
    if (!needle) continue;

    let best: { obj: ScannedObject; score: number } | null = null;
    for (const obj of scan.objects) {
      if (claimed.has(obj.objectId)) continue;
      const label = obj.label.toLowerCase();
      const keywords = LABEL_KEYWORDS[label] ?? [label];
      let score = 0;
      for (const kw of keywords) {
        if (needle.includes(kw)) score += kw.length; // longer match = better
      }
      if (score > 0 && (best == null || score > best.score)) {
        best = { obj, score };
      }
    }
    if (best) {
      claimed.add(best.obj.objectId);
      suggestions.push({
        itemId: item.id,
        itemName: item.itemName,
        recommendation: item.recommendation,
        objectId: best.obj.objectId,
        objectLabel: best.obj.label,
        score: best.score,
      });
    }
  }
  return suggestions;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Metrics header
// ─────────────────────────────────────────────────────────────────────────────

function MetricsHeader({ scan }: { scan: RoomScan }) {
  const areaSqFt = scan.areaSqFt ?? sqMToSqFt(scan.areaSqM);
  const [viewing, setViewing] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);

  const canView3D = Capacitor.isNativePlatform() && !!scan.usdzPath;

  const handleView3D = async () => {
    if (!scan.usdzPath) return;
    setViewing(true);
    setViewError(null);
    try {
      await RoomScanPlugin.previewUSDZ({ path: scan.usdzPath });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to open 3D preview";
      setViewError(msg);
    } finally {
      setViewing(false);
    }
  };

  return (
    <>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-3)",
        marginBottom: canView3D ? "var(--space-2)" : "var(--space-3)",
      }}>
        {[
          { label: "Area",    value: `${areaSqFt.toLocaleString()} ft²`, icon: "📐" },
          { label: "Doors",   value: `${scan.doorCount}`,                icon: "🚪" },
          { label: "Windows", value: `${scan.windowCount}`,              icon: "🪟" },
        ].map(({ label, value, icon }) => (
          <div key={label} style={{
            background: "var(--bg-card)", border: "1px solid var(--border-soft)",
            borderRadius: "var(--radius-md)", padding: "var(--space-3)", textAlign: "center",
          }}>
            <p style={{ fontSize: 18, margin: 0 }}>{icon}</p>
            <p style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: "2px 0" }}>{value}</p>
            <p style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>{label}</p>
          </div>
        ))}
      </div>

      {canView3D && (
        <button
          onClick={handleView3D}
          disabled={viewing}
          style={{
            width: "100%",
            padding: "10px 14px",
            border: "1px solid var(--accent-border, rgba(59,130,246,0.35))",
            borderRadius: "var(--radius-md)",
            background: "rgba(59,130,246,0.08)",
            color: "var(--accent-light, #3b82f6)",
            fontSize: 14, fontWeight: 700,
            cursor: viewing ? "default" : "pointer",
            marginBottom: "var(--space-3)",
            opacity: viewing ? 0.6 : 1,
          }}
        >
          {viewing ? "Opening 3D preview…" : "🧊 View in 3D"}
        </button>
      )}

      {viewError && (
        <div style={{
          background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: 8, padding: "8px 12px", marginBottom: 10,
          color: "#ef4444", fontSize: 13,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span>⚠️ {viewError}</span>
          <button onClick={() => setViewError(null)}
            style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}>Dismiss</button>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Tag-item / marker-action sheets
// ─────────────────────────────────────────────────────────────────────────────

type TagTarget =
  | { kind: "object"; objectId: string; label: string }
  | { kind: "position"; x: number; z: number };

function TagItemSheet({
  target, candidates, onPick, onClose, title,
}: {
  target: TagTarget;
  candidates: Item[];
  onPick: (item: Item) => void;
  onClose: () => void;
  title?: string;
}) {
  const heading = title ?? (target.kind === "object" ? `Tag item to ${target.label}` : "Drop item here");
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 10000,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 520, background: "var(--bg-card, #fff)",
          borderTopLeftRadius: 16, borderTopRightRadius: 16,
          padding: "20px 16px 32px", maxHeight: "70vh", overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{heading}</h3>
          <button onClick={onClose} aria-label="Close"
            style={{ border: "none", background: "transparent", fontSize: 24, cursor: "pointer", color: "var(--text-secondary)" }}>×</button>
        </div>
        {candidates.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>No unplaced items available.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {candidates.map(it => (
              <button key={it.id} onClick={() => onPick(it)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 14px", border: "1px solid var(--border-soft)",
                  borderRadius: 10, background: "var(--bg-elevated, #f8fafc)",
                  cursor: "pointer", textAlign: "left",
                }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 12, height: 12, borderRadius: "50%", background: REC_COLOR[it.recommendation] ?? "#94a3b8", display: "inline-block" }} />
                  <div>
                    <div style={{ fontWeight: 600 }}>{it.itemName}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{it.category} • {it.recommendation.replace(/_/g, " ")}</div>
                  </div>
                </div>
                <span style={{ color: "var(--text-muted)" }}>›</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface MarkerMenuState { item: Item; }

function MarkerActionSheet({
  item, onMove, onChange, onRemove, onClose,
}: {
  item: Item;
  onMove: () => void;
  onChange: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 10000,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 520, background: "var(--bg-card, #fff)",
          borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: "20px 16px 32px",
        }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: REC_COLOR[item.recommendation] ?? "#94a3b8" }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{item.itemName}</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {item.category} • {item.recommendation.replace(/_/g, " ")}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <MenuButton onClick={onMove}   label="Move (drag to reposition)" />
          <MenuButton onClick={onChange} label="Change item here" />
          <MenuButton onClick={onRemove} label="Remove from layout" destructive />
          <MenuButton onClick={onClose}  label="Cancel" />
        </div>
      </div>
    </div>
  );
}

function MenuButton({ onClick, label, destructive }: { onClick: () => void; label: string; destructive?: boolean }) {
  return (
    <button onClick={onClick}
      style={{
        padding: "14px 16px", border: "1px solid var(--border-soft)",
        borderRadius: 10, background: destructive ? "rgba(239,68,68,0.08)" : "var(--bg-elevated, #f8fafc)",
        color: destructive ? "#ef4444" : "var(--text-primary)",
        fontSize: 15, fontWeight: 600, textAlign: "left", cursor: "pointer",
      }}>{label}</button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Suggestions banner
// ─────────────────────────────────────────────────────────────────────────────

function SuggestionsPanel({
  suggestions, onAccept, onSkip, onDismiss, busyItemId,
}: {
  suggestions: Suggestion[];
  onAccept: (s: Suggestion) => void;
  onSkip: (s: Suggestion) => void;
  onDismiss: () => void;
  busyItemId: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  if (suggestions.length === 0) return null;

  return (
    <div style={{
      background: "rgba(59,130,246,0.08)", border: "1px solid var(--accent-border, rgba(59,130,246,0.3))",
      borderRadius: "var(--radius-md)", padding: "12px 14px", marginBottom: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--accent-light, #3b82f6)" }}>
          💡 {suggestions.length} auto-placement suggestion{suggestions.length === 1 ? "" : "s"}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setExpanded(e => !e)}
            style={{ background: "none", border: "1px solid var(--accent-border, rgba(59,130,246,0.3))", borderRadius: 8, padding: "4px 10px", fontSize: 12, cursor: "pointer", color: "var(--accent-light, #3b82f6)" }}>
            {expanded ? "Hide" : "Review"}
          </button>
          <button onClick={onDismiss}
            style={{ background: "none", border: "none", fontSize: 12, cursor: "pointer", color: "var(--text-secondary)" }}>
            Dismiss
          </button>
        </div>
      </div>
      {expanded && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          {suggestions.map(s => (
            <div key={s.itemId} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 10px", background: "var(--bg-card, #fff)", borderRadius: 8, border: "1px solid var(--border-soft)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: REC_COLOR[s.recommendation] ?? "#94a3b8", flexShrink: 0 }} />
                <div style={{ fontSize: 13, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <strong>{s.itemName}</strong>
                  <span style={{ color: "var(--text-secondary)" }}> → {s.objectLabel}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button onClick={() => onAccept(s)} disabled={busyItemId === s.itemId}
                  style={{ background: "var(--accent, #3b82f6)", color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: busyItemId === s.itemId ? 0.6 : 1 }}>
                  {busyItemId === s.itemId ? "…" : "Accept"}
                </button>
                <button onClick={() => onSkip(s)}
                  style={{ background: "none", border: "1px solid var(--border-soft)", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer", color: "var(--text-secondary)" }}>
                  Skip
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main viewer
// ─────────────────────────────────────────────────────────────────────────────

export interface RoomViewerProps {
  scan: RoomScan;
  items: Item[];
  onPlacementChanged?: () => void;
  /** Map of itemId → decision score (0–100). Items with score ≥ 60 get an amber halo. */
  priorityByItemId?: Record<string, number>;
}

const HIGH_PRIORITY_THRESHOLD = 60;
const HIGH_PRIORITY_HALO_COLOR = "#fbbf24";

interface DragState {
  itemId: string;
  originX: number;
  originZ: number;
  startClientX: number;
  startClientY: number;
  liveX: number;
  liveZ: number;
  moved: boolean;
}

// ── Orphan re-link sheet ────────────────────────────────────────────────────

function RelinkObjectSheet({
  itemName, objects, onPick, onClose,
}: {
  itemName: string;
  objects: ScannedObject[];
  onPick: (obj: ScannedObject) => void;
  onClose: () => void;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 10001,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 520, background: "var(--bg-card, #fff)",
          borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: "20px 16px 32px",
          maxHeight: "70vh", overflowY: "auto",
        }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            Re-link "{itemName}" to…
          </h3>
          <button onClick={onClose} aria-label="Close"
            style={{ border: "none", background: "transparent", fontSize: 24, cursor: "pointer", color: "var(--text-secondary)" }}>×</button>
        </div>
        {objects.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
            The current scan has no detected objects. Use "Place manually" instead.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {objects.map((o) => (
              <button key={o.objectId} onClick={() => onPick(o)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 14px", border: "1px solid var(--border-soft)",
                  borderRadius: 10, background: "var(--bg-elevated, #f8fafc)",
                  cursor: "pointer", textAlign: "left",
                }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{o.label}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {o.widthM.toFixed(1)} × {o.depthM.toFixed(1)} m
                  </div>
                </div>
                <span style={{ color: "var(--text-muted)" }}>›</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OrphanPanel({
  orphans, onRelink, onPlaceManually,
}: {
  orphans: OrphanedItem[];
  onRelink: (o: OrphanedItem) => void;
  onPlaceManually: (o: OrphanedItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (orphans.length === 0) return null;

  return (
    <div style={{
      background: "rgba(234, 179, 8, 0.10)",
      border: "1px solid rgba(234, 179, 8, 0.35)",
      borderRadius: "var(--radius-md)",
      padding: "12px 14px",
      marginBottom: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#b45309" }}>
          ⚠️ {orphans.length} item{orphans.length === 1 ? "" : "s"} need{orphans.length === 1 ? "s" : ""} re-linking
        </div>
        <button onClick={() => setExpanded((v) => !v)}
          style={{ background: "none", border: "1px solid rgba(234, 179, 8, 0.45)", borderRadius: 8, padding: "4px 10px", fontSize: 12, cursor: "pointer", color: "#b45309" }}>
          {expanded ? "Hide" : "Review"}
        </button>
      </div>
      {expanded && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          {orphans.map((o) => (
            <div key={o.itemId} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 10px", background: "var(--bg-card, #fff)", borderRadius: 8, border: "1px solid var(--border-soft)",
              gap: 8, flexWrap: "wrap",
            }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{o.itemName}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  Previous object no longer in scan
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button onClick={() => onRelink(o)}
                  style={{ background: "var(--accent, #3b82f6)", color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  Re-link
                </button>
                <button onClick={() => onPlaceManually(o)}
                  style={{ background: "none", border: "1px solid var(--border-soft)", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer", color: "var(--text-secondary)" }}>
                  Place manually
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function RoomViewer({ scan, items, onPlacementChanged, priorityByItemId }: RoomViewerProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [tagTarget, setTagTarget] = useState<TagTarget | null>(null);
  const [tagTargetMode, setTagTargetMode] = useState<"tag" | "replace">("tag");
  const [tagError, setTagError] = useState<string | null>(null);
  const [markerMenu, setMarkerMenu] = useState<MarkerMenuState | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);

  const [dismissedSuggestionIds, setDismissedSuggestionIds] = useState<Set<string>>(new Set());
  const [suggestionsDismissedAll, setSuggestionsDismissedAll] = useState(false);
  const [busySuggestionItemId, setBusySuggestionItemId] = useState<string | null>(null);

  // Orphaned placements (items whose roomObjectId no longer exists in the scan)
  const [orphans, setOrphans] = useState<OrphanedItem[]>([]);
  const [relinkTargetItem, setRelinkTargetItem] = useState<{ id: string; name: string } | null>(null);
  const [placementPendingItem, setPlacementPendingItem] = useState<{ id: string; name: string } | null>(null);

  const bounds = useMemo(() => computeBounds(scan, items), [scan, items]);
  const svgW = (bounds.maxX - bounds.minX + 2 * PAD_M) * PX_PER_M;
  const svgH = (bounds.maxZ - bounds.minZ + 2 * PAD_M) * PX_PER_M;

  const objectById = useMemo(() => {
    const m = new Map<string, ScannedObject>();
    for (const o of scan.objects) m.set(o.objectId, o);
    return m;
  }, [scan.objects]);

  const placedItems = items.filter(
    it => it.roomObjectId != null || (it.roomPositionX != null && it.roomPositionZ != null)
  );
  const unplacedItems = items.filter(
    it => it.roomObjectId == null && (it.roomPositionX == null || it.roomPositionZ == null)
  );

  const suggestions = useMemo(
    () => suggestionsDismissedAll
      ? []
      : buildSuggestions(scan, unplacedItems).filter(s => !dismissedSuggestionIds.has(s.itemId)),
    [scan, unplacedItems, dismissedSuggestionIds, suggestionsDismissedAll]
  );

  // Whenever the room/items change, reset any drifted drag state.
  useEffect(() => { setDragState(null); }, [scan.id]);

  // Fetch orphaned items whenever the scan or the items list changes. We key on
  // item ids + placement fingerprints so we re-check after every mutation.
  const itemsFingerprint = useMemo(
    () => items.map((it) => `${it.id}:${it.roomObjectId ?? ""}:${it.roomPositionX ?? ""}:${it.roomPositionZ ?? ""}`).join("|"),
    [items]
  );
  useEffect(() => {
    let cancelled = false;
    api.getOrphanedItems(scan.roomId)
      .then((list) => { if (!cancelled) setOrphans(list); })
      .catch((err) => {
        console.warn("[RoomViewer] getOrphanedItems failed:", err);
        if (!cancelled) setOrphans([]);
      });
    return () => { cancelled = true; };
  }, [scan.roomId, scan.id, itemsFingerprint]);

  // ── API actions ──────────────────────────────────────────────────────────

  const applyPlacement = async (itemId: string, patch: {
    roomObjectId?: string | null;
    roomPositionX?: number | null;
    roomPositionZ?: number | null;
  }) => {
    try {
      await api.updateItemPlacement(itemId, patch);
      onPlacementChanged?.();
    } catch (err) {
      console.error("[RoomViewer] updateItemPlacement failed:", err);
      setTagError(err instanceof Error ? err.message : "Failed to update placement");
    }
  };

  const handleTagPick = async (item: Item) => {
    if (!tagTarget) return;
    const patch = tagTarget.kind === "object"
      ? { roomObjectId: tagTarget.objectId, roomPositionX: null, roomPositionZ: null }
      : { roomObjectId: null, roomPositionX: tagTarget.x, roomPositionZ: tagTarget.z };
    setTagTarget(null);
    setSelectedItemId(item.id);
    await applyPlacement(item.id, patch);
  };

  const handleAcceptSuggestion = async (s: Suggestion) => {
    setBusySuggestionItemId(s.itemId);
    try {
      await applyPlacement(s.itemId, { roomObjectId: s.objectId, roomPositionX: null, roomPositionZ: null });
      setDismissedSuggestionIds(prev => { const next = new Set(prev); next.add(s.itemId); return next; });
    } finally {
      setBusySuggestionItemId(null);
    }
  };

  const handleSkipSuggestion = (s: Suggestion) => {
    setDismissedSuggestionIds(prev => { const next = new Set(prev); next.add(s.itemId); return next; });
  };

  const handleRemoveMarker = async (item: Item) => {
    setMarkerMenu(null);
    setSelectedItemId(null);
    await applyPlacement(item.id, {
      roomObjectId: null, roomPositionX: null, roomPositionZ: null,
    });
  };

  // ── Tap / drag handlers ─────────────────────────────────────────────────

  const handleFloorTap: React.PointerEventHandler<SVGRectElement> = (e) => {
    if (dragState) return;
    const svg = svgRef.current;
    if (!svg) return;
    const loc = clientToRoom(e.clientX, e.clientY, svg, bounds);
    if (!loc) return;

    // If we're in "Place manually" mode for an orphaned item, consume this tap
    // as the placement coordinate and exit the mode.
    if (placementPendingItem) {
      const pending = placementPendingItem;
      setPlacementPendingItem(null);
      void applyPlacement(pending.id, {
        roomObjectId: null,
        roomPositionX: loc.x,
        roomPositionZ: loc.z,
      });
      return;
    }

    setSelectedItemId(null);
    setSelectedObjectId(null);
    setTagTargetMode("tag");
    setTagTarget({ kind: "position", x: loc.x, z: loc.z });
  };

  const handleObjectTap = (obj: ScannedObject) => {
    setSelectedObjectId(obj.objectId);
    setSelectedItemId(null);
    setTagTargetMode("tag");
    setTagTarget({ kind: "object", objectId: obj.objectId, label: obj.label });
  };

  const handleMarkerPointerDown = (item: Item, originX: number, originZ: number) =>
    (e: React.PointerEvent<SVGGElement>) => {
      e.stopPropagation();
      (e.currentTarget as SVGGElement & { setPointerCapture?: (id: number) => void })
        .setPointerCapture?.(e.pointerId);
      setDragState({
        itemId: item.id,
        originX, originZ,
        startClientX: e.clientX, startClientY: e.clientY,
        liveX: originX, liveZ: originZ,
        moved: false,
      });
    };

  const handleMarkerPointerMove = (e: React.PointerEvent<SVGGElement>) => {
    if (!dragState) return;
    const dx = e.clientX - dragState.startClientX;
    const dy = e.clientY - dragState.startClientY;
    const moved = dragState.moved || (dx * dx + dy * dy) >= (DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX);
    if (!moved) return;
    const svg = svgRef.current;
    if (!svg) return;
    const loc = clientToRoom(e.clientX, e.clientY, svg, bounds);
    if (!loc) return;
    setDragState({ ...dragState, moved: true, liveX: loc.x, liveZ: loc.z });
  };

  const handleMarkerPointerUp = (item: Item) => async (e: React.PointerEvent<SVGGElement>) => {
    e.stopPropagation();
    if (!dragState || dragState.itemId !== item.id) { setDragState(null); return; }

    if (dragState.moved) {
      const { liveX, liveZ } = dragState;
      setDragState(null);
      await applyPlacement(item.id, {
        roomObjectId: null,
        roomPositionX: liveX,
        roomPositionZ: liveZ,
      });
    } else {
      setDragState(null);
      setSelectedItemId(item.id);
      setMarkerMenu({ item });
    }
  };

  // ── Derived rendering ────────────────────────────────────────────────────

  const polygonSvg = scan.floorPolygon
    .map(p => { const pt = toPx(p.x, p.z, bounds); return `${pt.u},${pt.v}`; })
    .join(" ");

  const resolveItemPosition = (item: Item): { x: number; z: number } | null => {
    if (dragState && dragState.itemId === item.id && dragState.moved) {
      return { x: dragState.liveX, z: dragState.liveZ };
    }
    if (item.roomObjectId) {
      const obj = objectById.get(item.roomObjectId);
      if (obj) return { x: obj.transform.x, z: obj.transform.z };
    }
    if (item.roomPositionX != null && item.roomPositionZ != null) {
      return { x: item.roomPositionX, z: item.roomPositionZ };
    }
    return null;
  };

  return (
    <div>
      <MetricsHeader scan={scan} />

      <OrphanPanel
        orphans={orphans}
        onRelink={(o) => setRelinkTargetItem({ id: o.itemId, name: o.itemName })}
        onPlaceManually={(o) => {
          setPlacementPendingItem({ id: o.itemId, name: o.itemName });
          setTagError(`Tap a spot in the room to place "${o.itemName}".`);
        }}
      />

      {placementPendingItem && (
        <div style={{
          background: "rgba(59,130,246,0.12)", border: "1px solid var(--accent-border, rgba(59,130,246,0.35))",
          borderRadius: "var(--radius-md)", padding: "8px 12px", marginBottom: 10,
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontSize: 13, color: "var(--accent-light, #3b82f6)", fontWeight: 600 }}>
            📍 Tap anywhere in the room to place "{placementPendingItem.name}"
          </span>
          <button onClick={() => { setPlacementPendingItem(null); setTagError(null); }}
            style={{ background: "none", border: "1px solid var(--accent-border, rgba(59,130,246,0.35))", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer", color: "var(--accent-light, #3b82f6)" }}>
            Cancel
          </button>
        </div>
      )}

      <SuggestionsPanel
        suggestions={suggestions}
        onAccept={handleAcceptSuggestion}
        onSkip={handleSkipSuggestion}
        onDismiss={() => setSuggestionsDismissedAll(true)}
        busyItemId={busySuggestionItemId}
      />

      {tagError && (
        <div style={{
          background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: 8, padding: "8px 12px", marginBottom: 8, color: "#ef4444", fontSize: 13,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span>⚠️ {tagError}</span>
          <button onClick={() => setTagError(null)}
            style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}>Dismiss</button>
        </div>
      )}

      <div style={{
        background: "var(--bg-card)", border: "1px solid var(--border-soft)",
        borderRadius: "var(--radius-md)", padding: 8, overflow: "hidden",
      }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${svgW} ${svgH}`}
          width="100%"
          preserveAspectRatio="xMidYMid meet"
          style={{ display: "block", touchAction: "none", userSelect: "none" }}
        >
          {scan.floorPolygon.length >= 3 && (
            <polygon
              points={polygonSvg}
              fill={FLOOR_FILL} stroke={FLOOR_STROKE} strokeWidth={2}
              strokeDasharray={scan.polygonClosed ? undefined : "6,4"}
              style={{ pointerEvents: "none" }}
            />
          )}

          {scan.walls.map((wall: ScannedWall, i) => {
            const half = wall.widthM / 2;
            const rx = Math.cos(wall.transform.rotationY);
            const rz = Math.sin(wall.transform.rotationY);
            const startM = { x: wall.transform.x - half * rx, z: wall.transform.z - half * rz };
            const endM   = { x: wall.transform.x + half * rx, z: wall.transform.z + half * rz };
            const a = toPx(startM.x, startM.z, bounds);
            const b = toPx(endM.x,   endM.z,   bounds);
            return (
              <line key={`w-${i}`}
                x1={a.u} y1={a.v} x2={b.u} y2={b.v}
                stroke={WALL_STROKE} strokeWidth={4} strokeLinecap="round"
                style={{ pointerEvents: "none" }}
              />
            );
          })}

          {scan.openings.map((op: ScannedOpening, i) => {
            const pt = toPx(op.absolutePosition.x, op.absolutePosition.z, bounds);
            const wPx = Math.max(6, op.widthM * PX_PER_M);
            const hPx = 10;
            return (
              <g key={`op-${i}`}
                transform={`translate(${pt.u}, ${pt.v}) rotate(${radToDeg(op.transform.rotationY)})`}
                style={{ pointerEvents: "none" }}>
                <rect x={-wPx / 2} y={-hPx / 2} width={wPx} height={hPx}
                  fill={OPENING_COLOR[op.type]} opacity={0.7} rx={2} />
              </g>
            );
          })}

          {/* Floor hit-layer — empty taps land here, object/marker taps propagate through their own handlers. */}
          <rect x={0} y={0} width={svgW} height={svgH} fill="transparent" onPointerDown={handleFloorTap} />

          {scan.objects.map((obj: ScannedObject) => {
            const pt = toPx(obj.transform.x, obj.transform.z, bounds);
            const wPx = Math.max(20, obj.widthM * PX_PER_M);
            const dPx = Math.max(20, obj.depthM * PX_PER_M);
            const isSelected = obj.objectId === selectedObjectId;
            return (
              <g key={`o-${obj.objectId}`}
                transform={`translate(${pt.u}, ${pt.v}) rotate(${radToDeg(obj.transform.rotationY)})`}
                onPointerDown={(e) => { e.stopPropagation(); handleObjectTap(obj); }}
                style={{ cursor: "pointer" }}>
                <rect
                  x={-wPx / 2} y={-dPx / 2} width={wPx} height={dPx} rx={4}
                  fill={OBJECT_FILL}
                  stroke={isSelected ? OBJECT_STROKE_SELECTED : OBJECT_STROKE}
                  strokeWidth={isSelected ? 3 : 2}
                />
                <text x={0} y={4} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--text-primary)" style={{ pointerEvents: "none" }}>
                  {obj.label}
                </text>
              </g>
            );
          })}

          {placedItems.map(item => {
            const pos = resolveItemPosition(item);
            if (!pos) return null;
            const pt = toPx(pos.x, pos.z, bounds);
            const color = REC_COLOR[item.recommendation] ?? "#94a3b8";
            const isSelected = item.id === selectedItemId;
            const isDragging = dragState?.itemId === item.id && dragState.moved;
            const priorityScore = priorityByItemId?.[item.id] ?? 0;
            const isHighPriority = priorityScore >= HIGH_PRIORITY_THRESHOLD;
            return (
              <g key={`i-${item.id}`}
                transform={`translate(${pt.u}, ${pt.v})`}
                onPointerDown={handleMarkerPointerDown(item, pos.x, pos.z)}
                onPointerMove={handleMarkerPointerMove}
                onPointerUp={handleMarkerPointerUp(item)}
                onPointerCancel={() => setDragState(null)}
                style={{ cursor: isDragging ? "grabbing" : "grab" }}>
                {isHighPriority && (
                  <circle
                    r={18}
                    fill="none"
                    stroke={HIGH_PRIORITY_HALO_COLOR}
                    strokeWidth={3}
                    opacity={0.55}
                    style={{ pointerEvents: "none" }}
                  />
                )}
                <circle
                  r={isDragging ? 16 : isSelected ? 14 : 10}
                  fill={color}
                  stroke="#fff"
                  strokeWidth={isDragging ? 4 : isSelected ? 3 : 2}
                  opacity={isDragging ? 0.8 : 1}
                />
                <text x={0} y={-18} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--text-primary)" style={{ pointerEvents: "none" }}>
                  {item.itemName.length > 18 ? item.itemName.slice(0, 17) + "…" : item.itemName}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div style={{
        display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8,
        fontSize: 11, color: "var(--text-secondary)",
      }}>
        <Legend color={REC_COLOR.SELL_NOW} label="Sell" />
        <Legend color={REC_COLOR.KEEP}     label="Keep" />
        <Legend color={REC_COLOR.SHIP}     label="Ship" />
        <Legend color={REC_COLOR.DONATE}   label="Donate" />
        <Legend color={OPENING_COLOR.door}   label="Door" />
        <Legend color={OPENING_COLOR.window} label="Window" />
        <span style={{ marginLeft: "auto", color: "var(--text-muted)" }}>
          Tap marker for options • drag to move
        </span>
      </div>

      {tagTarget && (
        <TagItemSheet
          target={tagTarget}
          candidates={tagTargetMode === "replace" ? items : unplacedItems}
          onPick={handleTagPick}
          onClose={() => setTagTarget(null)}
          title={tagTargetMode === "replace" ? "Change item here" : undefined}
        />
      )}

      {relinkTargetItem && (
        <RelinkObjectSheet
          itemName={relinkTargetItem.name}
          objects={scan.objects}
          onPick={async (obj) => {
            const t = relinkTargetItem;
            setRelinkTargetItem(null);
            await applyPlacement(t.id, {
              roomObjectId: obj.objectId,
              roomPositionX: null,
              roomPositionZ: null,
            });
          }}
          onClose={() => setRelinkTargetItem(null)}
        />
      )}

      {markerMenu && (
        <MarkerActionSheet
          item={markerMenu.item}
          onMove={() => {
            // Dismiss menu; the user already has a draggable marker — we just
            // coach via a transient tip. Drag gesture is tap-and-drag anyway.
            setMarkerMenu(null);
            setTagError("Drag the marker to its new position.");
            setTimeout(() => setTagError(null), 2500);
          }}
          onChange={() => {
            const m = markerMenu;
            setMarkerMenu(null);
            if (m.item.roomObjectId) {
              const obj = objectById.get(m.item.roomObjectId);
              if (obj) { setTagTargetMode("replace"); setTagTarget({ kind: "object", objectId: obj.objectId, label: obj.label }); return; }
            }
            const x = m.item.roomPositionX ?? 0;
            const z = m.item.roomPositionZ ?? 0;
            setTagTargetMode("replace");
            setTagTarget({ kind: "position", x, z });
          }}
          onRemove={() => handleRemoveMarker(markerMenu.item)}
          onClose={() => setMarkerMenu(null)}
        />
      )}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, display: "inline-block" }} />
      {label}
    </span>
  );
}
