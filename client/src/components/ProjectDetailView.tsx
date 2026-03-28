import { useEffect, useState } from "react";
import type { Project, Room, Item, Recommendation, MoveType, HousingAssumption, UserGoal } from "../types";
import { api } from "../api";

function formatDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function label(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const ROOM_TYPES = [
  "Living Room",
  "Bedroom",
  "Kitchen",
  "Bathroom",
  "Garage",
  "Office",
  "Storage",
  "Other",
];

const REC_ORDER: Recommendation[] = ["SELL_NOW", "SELL_SOON", "SHIP", "STORE", "DONATE", "DISCARD", "KEEP"];

const REC_LABELS: Record<Recommendation, string> = {
  SELL_NOW: "Sell Now",
  SELL_SOON: "Sell Soon",
  SHIP: "Ship",
  STORE: "Store",
  DONATE: "Donate",
  DISCARD: "Discard",
  KEEP: "Keep",
};

interface PcsCountdownProps {
  hardMoveDate: string;
}

function PcsCountdown({ hardMoveDate }: PcsCountdownProps) {
  const msPerDay = 86_400_000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(hardMoveDate + "T00:00:00");
  const days = Math.round((target.getTime() - today.getTime()) / msPerDay);
  const isPast = days < 0;

  let variant: "green" | "yellow" | "red" | "past";
  if (isPast) {
    variant = "past";
  } else if (days > 90) {
    variant = "green";
  } else if (days >= 30) {
    variant = "yellow";
  } else {
    variant = "red";
  }

  return (
    <div className={`pcs-countdown pcs-countdown--${variant}`}>
      <span className="pcs-countdown__number">{Math.abs(days)}</span>
      <span className="pcs-countdown__label">
        {isPast ? "days since PCS" : "days to PCS"}
      </span>
    </div>
  );
}

function PcsTimeline({
  planningStartDate,
  hardMoveDate,
  optionalPackoutDate,
}: {
  planningStartDate: string;
  hardMoveDate: string;
  optionalPackoutDate?: string;
}) {
  const msPerDay = 86_400_000;
  const start = new Date(planningStartDate + "T00:00:00");
  const end = new Date(hardMoveDate + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const totalMs = end.getTime() - start.getTime();
  if (totalMs <= 0) return null;

  const todayMs = today.getTime() - start.getTime();
  const todayPct = Math.max(0, Math.min(100, (todayMs / totalMs) * 100));

  const daysLeft = Math.round((end.getTime() - today.getTime()) / msPerDay);
  const isPast = daysLeft < 0;

  let fillVariant: string;
  if (isPast) fillVariant = "past";
  else if (daysLeft > 90) fillVariant = "green";
  else if (daysLeft >= 30) fillVariant = "yellow";
  else fillVariant = "red";

  const shortDate = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  let packoutPct: number | null = null;
  if (optionalPackoutDate) {
    const packout = new Date(optionalPackoutDate + "T00:00:00");
    const pMs = packout.getTime() - start.getTime();
    const pPct = (pMs / totalMs) * 100;
    if (pPct > 0 && pPct < 100) packoutPct = pPct;
  }

  return (
    <div className="pcs-timeline">
      <div className="pcs-timeline__track">
        <div
          className={`pcs-timeline__fill pcs-timeline__fill--${fillVariant}`}
          style={{ width: `${todayPct}%` }}
        />
        {packoutPct !== null && (
          <div
            className="pcs-timeline__marker pcs-timeline__marker--packout"
            style={{ left: `${packoutPct}%` }}
          />
        )}
        <div
          className="pcs-timeline__marker pcs-timeline__marker--today"
          style={{ left: `${todayPct}%` }}
        />
      </div>
      <div className="pcs-timeline__labels">
        <span className="pcs-timeline__label pcs-timeline__label--start">
          Start<br />{shortDate(start)}
        </span>
        <span
          className="pcs-timeline__label pcs-timeline__label--today"
          style={{ left: `${todayPct}%` }}
        >
          Today
        </span>
        {packoutPct !== null && (
          <span
            className="pcs-timeline__label pcs-timeline__label--packout"
            style={{ left: `${packoutPct}%` }}
          >
            Pack-out<br />{shortDate(new Date(optionalPackoutDate! + "T00:00:00"))}
          </span>
        )}
        <span className="pcs-timeline__label pcs-timeline__label--end">
          PCS<br />{shortDate(end)}
        </span>
      </div>
    </div>
  );
}

function PackingListView({ projectId }: { projectId: string; onBack: () => void }) {
  const [data, setData] = useState<{ project: Project; rooms: Room[]; packingList: { recommendation: string; items: Item[] }[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getProjectExport(projectId).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <p className="loading">Loading packing list...</p>;
  if (!data) return <p className="empty">Failed to load packing list.</p>;

  const roomMap = new Map(data.rooms.map(r => [r.id, r.roomName]));

  return (
    <div className="packing-list">
      <div className="packing-list__header">
        <h2 className="packing-list__title">{data.project.projectName}</h2>
        <div className="packing-list__meta">
          <span className="packing-list__meta-item">{data.project.currentLocation} → {data.project.destination}</span>
          <span className="packing-list__meta-item">PCS: {formatDate(data.project.hardMoveDate)}</span>
          {data.project.optionalPackoutDate && (
            <span className="packing-list__meta-item">Pack-out: {formatDate(data.project.optionalPackoutDate)}</span>
          )}
        </div>
      </div>

      <div className="packing-list__groups">
        {data.packingList.map(group => (
          <div key={group.recommendation} className="packing-list__group">
            <div className="packing-list__group-heading">
              <span className={`rec-badge rec-badge--${group.recommendation.toLowerCase().replace("_", "-")}`}>
                {label(group.recommendation)}
              </span>
              <span className="packing-list__group-count">
                ({group.items.length} items)
                {(() => {
                  const gw = group.items.reduce((s, i) => s + (i.weightLbs ?? 0), 0);
                  return gw > 0 ? <span className="packing-list__group-weight"> · {gw} lbs</span> : null;
                })()}
              </span>
            </div>
            <div className="packing-list__table-wrap">
              <table className="packing-list__table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Room</th>
                    <th>Category</th>
                    <th>Condition</th>
                    <th>Size</th>
                    <th>Weight</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map(item => (
                    <tr key={item.id}>
                      <td className="pl-col--name">{item.itemName}</td>
                      <td className="pl-col--room">{roomMap.get(item.roomId) ?? "—"}</td>
                      <td className="pl-col--category">{item.category}</td>
                      <td className="pl-col--condition">{label(item.condition)}</td>
                      <td className="pl-col--size">{label(item.sizeClass)}</td>
                      <td className="pl-col--weight">{item.weightLbs != null ? `${item.weightLbs} lbs` : "—"}</td>
                      <td className="pl-col--notes">{item.notes ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {(() => {
        const grandTotal = data.packingList.reduce((s, g) => s + g.items.reduce((s2, i) => s2 + (i.weightLbs ?? 0), 0), 0);
        return grandTotal > 0 ? <p className="packing-list__grand-total">Total estimated weight: {grandTotal} lbs</p> : null;
      })()}

      <button className="btn-print" onClick={() => window.print()}>Print</button>
    </div>
  );
}

function WeightAllowanceCard({
  totalWeight,
  allowance,
  itemsWithWeight,
  itemsWithoutWeight,
}: {
  totalWeight: number;
  allowance: number | undefined;
  itemsWithWeight: number;
  itemsWithoutWeight: number;
}) {
  if (!allowance && totalWeight === 0) return null;

  const pct = allowance ? Math.min((totalWeight / allowance) * 100, 150) : 0;
  const remaining = allowance ? allowance - totalWeight : 0;
  const isOver = allowance ? totalWeight > allowance : false;
  const isNear = allowance ? pct >= 80 && !isOver : false;

  let statusClass = "weight-calc--ok";
  if (isOver) statusClass = "weight-calc--over";
  else if (isNear) statusClass = "weight-calc--near";

  return (
    <div className={`weight-calc ${statusClass}`}>
      <div className="weight-calc__header">
        <span className="weight-calc__title">Weight Summary</span>
      </div>

      <div className="weight-calc__numbers">
        <div className="weight-calc__stat">
          <span className="weight-calc__stat-value">{totalWeight.toLocaleString()}</span>
          <span className="weight-calc__stat-label">lbs estimated</span>
        </div>
        {allowance != null && (
          <>
            <div className="weight-calc__stat">
              <span className="weight-calc__stat-value">{allowance.toLocaleString()}</span>
              <span className="weight-calc__stat-label">lbs allowance</span>
            </div>
            <div className="weight-calc__stat">
              <span className={`weight-calc__stat-value ${isOver ? "weight-calc__over-value" : ""}`}>
                {isOver ? "+" : ""}{Math.abs(remaining).toLocaleString()}
              </span>
              <span className="weight-calc__stat-label">{isOver ? "lbs over" : "lbs remaining"}</span>
            </div>
          </>
        )}
      </div>

      {allowance != null && (
        <div className="weight-calc__bar-track">
          <div
            className="weight-calc__bar-fill"
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
          {isOver && (
            <div
              className="weight-calc__bar-overage"
              style={{ width: `${Math.min(pct - 100, 50)}%` }}
            />
          )}
        </div>
      )}

      {itemsWithoutWeight > 0 && (
        <p className="weight-calc__caveat">
          {itemsWithoutWeight} of {itemsWithWeight + itemsWithoutWeight} items have no weight estimate
        </p>
      )}
    </div>
  );
}

interface Props {
  projectId: string;
  onBack: () => void;
  onSelectRoom: (id: string, name: string, type: string) => void;
  roomsRefreshKey: number;
}

export function ProjectDetailView({ projectId, onBack, onSelectRoom, roomsRefreshKey }: Props) {
  const [project, setProject] = useState<Project | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [itemCounts, setItemCounts] = useState<Record<string, number>>({});
  const [reviewedCounts, setReviewedCounts] = useState<Record<string, number>>({});
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [totalItems, setTotalItems] = useState(0);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [loadingProject, setLoadingProject] = useState(true);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [localRoomsKey, setLocalRoomsKey] = useState(0);

  // Weight data
  const [weightData, setWeightData] = useState<{ totalWeight: number; roomWeights: Record<string, number>; itemsWithWeight: number; itemsWithoutWeight: number } | null>(null);

  // Packing list state
  const [showPackingList, setShowPackingList] = useState(false);

  // Search/filter state
  const [searchText, setSearchText] = useState("");
  const [filterRec, setFilterRec] = useState("");
  const [filterRoom, setFilterRoom] = useState("");

  // Add room form state
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [roomType, setRoomType] = useState(ROOM_TYPES[0]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Room edit state
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editRoomName, setEditRoomName] = useState("");
  const [editRoomType, setEditRoomType] = useState(ROOM_TYPES[0]);
  const [roomSaving, setRoomSaving] = useState(false);
  const [roomEditError, setRoomEditError] = useState("");

  // Project edit state
  const [editingProject, setEditingProject] = useState(false);
  const [editProjectName, setEditProjectName] = useState("");
  const [editCurrentLocation, setEditCurrentLocation] = useState("");
  const [editDestination, setEditDestination] = useState("");
  const [editMoveType, setEditMoveType] = useState<MoveType>("CONUS");
  const [editPlanningStartDate, setEditPlanningStartDate] = useState("");
  const [editHardMoveDate, setEditHardMoveDate] = useState("");
  const [editOptionalPackoutDate, setEditOptionalPackoutDate] = useState("");
  const [editHousingAssumption, setEditHousingAssumption] = useState<HousingAssumption>("SAME");
  const [editUserGoal, setEditUserGoal] = useState<UserGoal>("BALANCED");
  const [editWeightAllowance, setEditWeightAllowance] = useState("");
  const [projectSaving, setProjectSaving] = useState(false);
  const [projectEditError, setProjectEditError] = useState("");

  useEffect(() => {
    setLoadingProject(true);
    api
      .getProject(projectId)
      .then(setProject)
      .catch(() => setProject(null))
      .finally(() => setLoadingProject(false));
  }, [projectId]);

  useEffect(() => {
    setLoadingRooms(true);
    api.getProjectWeight(projectId).then(setWeightData).catch(() => setWeightData(null));
    Promise.all([
      api.listRooms(projectId),
      api.listItems({ projectId }),
      api.getProjectSummary(projectId),
    ])
      .then(([fetchedRooms, fetchedItems, fetchedSummary]: [Room[], Item[], Record<string, number>]) => {
        setRooms(fetchedRooms);
        const counts: Record<string, number> = {};
        const reviewed: Record<string, number> = {};
        for (const item of fetchedItems) {
          counts[item.roomId] = (counts[item.roomId] ?? 0) + 1;
          if (item.status !== "UNREVIEWED") {
            reviewed[item.roomId] = (reviewed[item.roomId] ?? 0) + 1;
          }
        }
        setItemCounts(counts);
        setReviewedCounts(reviewed);
        setSummary(fetchedSummary);
        setTotalItems(fetchedItems.length);
        setAllItems(fetchedItems);
      })
      .catch(() => {
        setRooms([]);
        setItemCounts({});
        setReviewedCounts({});
        setSummary({});
        setTotalItems(0);
        setAllItems([]);
      })
      .finally(() => setLoadingRooms(false));
  }, [projectId, localRoomsKey, roomsRefreshKey]);

  async function handleAddRoom(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError("");
    try {
      await api.createRoom({ projectId, roomName, roomType });
      setRoomName("");
      setRoomType(ROOM_TYPES[0]);
      setShowAddRoom(false);
      setLocalRoomsKey((k) => k + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create room");
    } finally {
      setSubmitting(false);
    }
  }

  function startEditRoom(room: Room) {
    setEditingRoomId(room.id);
    setEditRoomName(room.roomName);
    setEditRoomType(room.roomType);
    setRoomEditError("");
  }

  async function handleRoomSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editingRoomId) return;
    setRoomSaving(true);
    setRoomEditError("");
    try {
      await api.updateRoom(editingRoomId, { roomName: editRoomName, roomType: editRoomType });
      setEditingRoomId(null);
      setLocalRoomsKey((k) => k + 1);
    } catch (err) {
      setRoomEditError(err instanceof Error ? err.message : "Failed to save room");
    } finally {
      setRoomSaving(false);
    }
  }

  async function handleRoomDelete(roomId: string, name: string) {
    if (!window.confirm(`Delete room "${name}"? All items in this room will also be deleted.`)) return;
    try {
      await api.deleteRoom(roomId);
      setEditingRoomId(null);
      setLocalRoomsKey((k) => k + 1);
    } catch (err) {
      setRoomEditError(err instanceof Error ? err.message : "Failed to delete room");
    }
  }

  function startEditProject(p: Project) {
    setEditProjectName(p.projectName);
    setEditCurrentLocation(p.currentLocation);
    setEditDestination(p.destination);
    setEditMoveType(p.moveType);
    setEditPlanningStartDate(p.planningStartDate);
    setEditHardMoveDate(p.hardMoveDate);
    setEditOptionalPackoutDate(p.optionalPackoutDate ?? "");
    setEditHousingAssumption(p.housingAssumption);
    setEditUserGoal(p.userGoal);
    setEditWeightAllowance(p.weightAllowanceLbs?.toString() ?? "");
    setProjectEditError("");
    setEditingProject(true);
  }

  async function handleProjectSave(e: React.FormEvent) {
    e.preventDefault();
    setProjectSaving(true);
    setProjectEditError("");
    try {
      await api.updateProject(projectId, {
        projectName: editProjectName,
        currentLocation: editCurrentLocation,
        destination: editDestination,
        moveType: editMoveType,
        planningStartDate: editPlanningStartDate,
        hardMoveDate: editHardMoveDate,
        optionalPackoutDate: editOptionalPackoutDate || undefined,
        housingAssumption: editHousingAssumption,
        userGoal: editUserGoal,
        weightAllowanceLbs: editWeightAllowance.trim() ? parseFloat(editWeightAllowance) : null,
      });
      const updated = await api.getProject(projectId);
      setProject(updated);
      setEditingProject(false);
    } catch (err) {
      setProjectEditError(err instanceof Error ? err.message : "Failed to save project");
    } finally {
      setProjectSaving(false);
    }
  }

  async function handleProjectDelete() {
    if (!project) return;
    if (!window.confirm(`Delete "${project.projectName}"? All rooms and items will also be deleted.`)) return;
    try {
      await api.deleteProject(projectId);
      onBack();
    } catch (err) {
      setProjectEditError(err instanceof Error ? err.message : "Failed to delete project");
    }
  }

  if (loadingProject) return <p className="loading">Loading project...</p>;
  if (!project) return <p className="empty">Project not found.</p>;

  // Packing list view — check before editingProject
  if (showPackingList) {
    return (
      <div>
        <button className="back-btn" onClick={() => setShowPackingList(false)}>← Back to Project</button>
        <PackingListView projectId={projectId} onBack={() => setShowPackingList(false)} />
      </div>
    );
  }

  // Project edit view
  if (editingProject) {
    return (
      <div>
        <button className="back-btn" onClick={() => setEditingProject(false)}>
          ← Cancel
        </button>

        <form className="project-form" onSubmit={handleProjectSave}>
          <h2>Edit Project</h2>

          {projectEditError && <p className="form-error">{projectEditError}</p>}

          <label>
            Project Name
            <input
              type="text"
              value={editProjectName}
              onChange={(e) => setEditProjectName(e.target.value)}
              required
            />
          </label>

          <label>
            Current Location
            <input
              type="text"
              value={editCurrentLocation}
              onChange={(e) => setEditCurrentLocation(e.target.value)}
              required
            />
          </label>

          <label>
            Destination
            <input
              type="text"
              value={editDestination}
              onChange={(e) => setEditDestination(e.target.value)}
              required
            />
          </label>

          <label>
            Move Type
            <select
              value={editMoveType}
              onChange={(e) => setEditMoveType(e.target.value as MoveType)}
            >
              {(["CONUS", "OCONUS", "JAPAN", "EUROPE", "STORAGE_ONLY"] as MoveType[]).map((t) => (
                <option key={t} value={t}>{label(t)}</option>
              ))}
            </select>
          </label>

          <label>
            Planning Start Date
            <input
              type="date"
              value={editPlanningStartDate}
              onChange={(e) => setEditPlanningStartDate(e.target.value)}
              required
            />
          </label>

          <label>
            Hard Move Date (PCS Date)
            <input
              type="date"
              value={editHardMoveDate}
              onChange={(e) => setEditHardMoveDate(e.target.value)}
              required
            />
          </label>

          <label>
            Pack-out Date (optional)
            <input
              type="date"
              value={editOptionalPackoutDate}
              onChange={(e) => setEditOptionalPackoutDate(e.target.value)}
            />
          </label>

          <label>
            Housing Assumption
            <select
              value={editHousingAssumption}
              onChange={(e) => setEditHousingAssumption(e.target.value as HousingAssumption)}
            >
              {(["SMALLER", "SAME", "LARGER", "UNKNOWN"] as HousingAssumption[]).map((h) => (
                <option key={h} value={h}>{label(h)}</option>
              ))}
            </select>
          </label>

          <label>
            Goal
            <select
              value={editUserGoal}
              onChange={(e) => setEditUserGoal(e.target.value as UserGoal)}
            >
              {(["MAXIMIZE_CASH", "REDUCE_STRESS", "REDUCE_SHIPMENT_BURDEN", "FIT_SMALLER_HOME", "BALANCED"] as UserGoal[]).map((g) => (
                <option key={g} value={g}>{label(g)}</option>
              ))}
            </select>
          </label>

          <label>
            Weight Allowance (lbs)
            <div className="weight-input-group">
              <input
                className="weight-input-group__input"
                type="number"
                step="1"
                min="0"
                inputMode="numeric"
                placeholder="e.g. 18000"
                value={editWeightAllowance}
                onChange={(e) => setEditWeightAllowance(e.target.value)}
              />
              <span className="weight-input-group__suffix">lbs</span>
            </div>
          </label>

          <button type="submit" disabled={projectSaving}>
            {projectSaving ? "Saving..." : "Save Changes"}
          </button>

          <div className="item-edit-delete-zone">
            <button type="button" className="item-delete-btn" onClick={handleProjectDelete}>
              Delete this project
            </button>
          </div>
        </form>
      </div>
    );
  }

  // Compute filter state
  const hasFilters = searchText || filterRec || filterRoom;
  const filteredItems = hasFilters ? allItems.filter(item => {
    if (searchText && !item.itemName.toLowerCase().includes(searchText.toLowerCase()) && !item.category.toLowerCase().includes(searchText.toLowerCase())) return false;
    if (filterRec && item.recommendation !== filterRec) return false;
    if (filterRoom && item.roomId !== filterRoom) return false;
    return true;
  }) : [];

  return (
    <div>
      <button className="back-btn" onClick={onBack}>
        ← All Projects
      </button>

      <div className="detail-header">
        <div className="detail-title-block">
          <h2 className="detail-name">{project.projectName}</h2>
          <p className="detail-route">
            {project.currentLocation} → {project.destination}
          </p>
          <button className="project-edit-trigger" onClick={() => startEditProject(project)}>
            Edit Project
          </button>
        </div>
        <PcsCountdown hardMoveDate={project.hardMoveDate} />
      </div>

      <dl className="detail-meta">
        <dt>Move Type</dt>
        <dd>{label(project.moveType)}</dd>
        <dt>PCS Date</dt>
        <dd>{formatDate(project.hardMoveDate)}</dd>
        {project.optionalPackoutDate && (
          <>
            <dt>Pack-out</dt>
            <dd>{formatDate(project.optionalPackoutDate)}</dd>
          </>
        )}
        <dt>Housing</dt>
        <dd>{label(project.housingAssumption)}</dd>
        <dt>Goal</dt>
        <dd>{label(project.userGoal)}</dd>
      </dl>

      <PcsTimeline
        planningStartDate={project.planningStartDate}
        hardMoveDate={project.hardMoveDate}
        optionalPackoutDate={project.optionalPackoutDate}
      />

      {totalItems > 0 && !editingProject && (
        <div className="items-search">
          <div className="items-search__controls">
            <input
              className="items-search__input"
              type="text"
              placeholder="Search items..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
            />
            <select className="items-search__select" value={filterRec} onChange={e => setFilterRec(e.target.value)}>
              <option value="">All Recommendations</option>
              {REC_ORDER.map(r => <option key={r} value={r}>{REC_LABELS[r]}</option>)}
            </select>
            <select className="items-search__select" value={filterRoom} onChange={e => setFilterRoom(e.target.value)}>
              <option value="">All Rooms</option>
              {rooms.map(r => <option key={r.id} value={r.id}>{r.roomName}</option>)}
            </select>
            {(searchText || filterRec || filterRoom) && (
              <button className="items-search__clear" onClick={() => { setSearchText(""); setFilterRec(""); setFilterRoom(""); }}>
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {((weightData?.totalWeight ?? 0) > 0 || !!project.weightAllowanceLbs) && (
        <WeightAllowanceCard
          totalWeight={weightData?.totalWeight ?? 0}
          allowance={project.weightAllowanceLbs}
          itemsWithWeight={weightData?.itemsWithWeight ?? 0}
          itemsWithoutWeight={weightData?.itemsWithoutWeight ?? 0}
        />
      )}

      {hasFilters ? (
        <section className="search-results">
          <p className="search-results__count">{filteredItems.length} items match</p>
          {filteredItems.length === 0 ? (
            <p className="empty">No items match your filters.</p>
          ) : (
            <div className="item-list">
              {filteredItems.map(item => {
                const roomName = rooms.find(r => r.id === item.roomId)?.roomName ?? "—";
                return (
                  <div key={item.id} className="item-card">
                    <div className="item-card__header">
                      <span className="item-card__name">{item.itemName}</span>
                      <span className={`rec-badge rec-badge--${item.recommendation.toLowerCase().replace("_", "-")}`}>
                        {label(item.recommendation)}
                      </span>
                    </div>
                    <div className="item-card__meta">
                      <span className="item-card__room-tag">{roomName}</span>
                      <span>{item.category}</span>
                      <span>·</span>
                      <span>{label(item.condition)}</span>
                      <span>·</span>
                      <span>{label(item.sizeClass)}</span>
                    </div>
                    {item.notes && <p className="item-card__notes">{item.notes}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        <>
          {totalItems > 0 && (
            <section className="rec-summary">
              <p className="rec-summary__total">
                {totalItems} items total
                {weightData && weightData.totalWeight > 0 && (
                  <span className="rec-summary__weight"> · Est. weight: {weightData.totalWeight} lbs</span>
                )}
              </p>
              <div className="rec-summary__row">
                {REC_ORDER.filter(r => (summary[r] ?? 0) > 0).map(r => (
                  <div key={r} className={`rec-stat rec-stat--${r.toLowerCase().replace("_", "-")}`}>
                    <span className="rec-stat__count">{summary[r]}</span>
                    <span className="rec-stat__label">{REC_LABELS[r]}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {totalItems > 0 && !editingProject && (
            <button className="btn-export-packing-list" onClick={() => setShowPackingList(true)}>
              Print Packing List
            </button>
          )}

          <section>
            <h3 className="section-heading">Rooms</h3>

            {loadingRooms ? (
              <p className="loading">Loading rooms...</p>
            ) : rooms.length === 0 ? (
              <p className="empty">No rooms yet. Add one below.</p>
            ) : (
              <div className="room-grid">
                {rooms.map((room) => {
                  const count = itemCounts[room.id] ?? 0;
                  const rev = reviewedCounts[room.id] ?? 0;

                  if (editingRoomId === room.id) {
                    return (
                      <div key={room.id} className="room-card room-card--editing">
                        <form className="room-edit-form" onSubmit={handleRoomSave}>
                          <label>
                            Room Name
                            <input
                              type="text"
                              value={editRoomName}
                              onChange={(e) => setEditRoomName(e.target.value)}
                              required
                            />
                          </label>
                          <label>
                            Room Type
                            <select
                              value={editRoomType}
                              onChange={(e) => setEditRoomType(e.target.value)}
                            >
                              {ROOM_TYPES.map((t) => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                          </label>
                          {roomEditError && <p className="form-error">{roomEditError}</p>}
                          <div className="item-edit-actions">
                            <button type="button" className="btn-cancel" onClick={() => setEditingRoomId(null)}>
                              Cancel
                            </button>
                            <button type="submit" className="btn-save" disabled={roomSaving}>
                              {roomSaving ? "Saving..." : "Save"}
                            </button>
                          </div>
                          <div className="item-edit-delete-zone">
                            <button
                              type="button"
                              className="item-delete-btn"
                              onClick={() => handleRoomDelete(room.id, room.roomName)}
                            >
                              Delete this room
                            </button>
                          </div>
                        </form>
                      </div>
                    );
                  }

                  return (
                    <div key={room.id} className="room-card">
                      <div
                        className="room-card__nav-area"
                        role="button"
                        tabIndex={0}
                        onClick={() => onSelectRoom(room.id, room.roomName, room.roomType)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            onSelectRoom(room.id, room.roomName, room.roomType);
                          }
                        }}
                      >
                        <p className="room-card__name">{room.roomName}</p>
                        <p className="room-card__type">{room.roomType}</p>
                        <p className="room-card__item-count">
                          {count} {count === 1 ? "item" : "items"}
                        </p>
                        {count > 0 && (
                          <div className="room-card__progress">
                            <p className="room-card__progress-label">
                              {rev} / {count} {rev === count ? "done" : "reviewed"}
                            </p>
                            <div className="room-card__progress-track">
                              <div
                                className={`room-card__progress-fill${rev === count ? " room-card__progress-fill--complete" : ""}`}
                                style={{ width: `${Math.round((rev / count) * 100)}%` }}
                              />
                            </div>
                          </div>
                        )}
                        {weightData && (weightData.roomWeights[room.id] ?? 0) > 0 && (
                          <p className="room-card__weight">~{weightData.roomWeights[room.id]} lbs</p>
                        )}
                      </div>
                      <button
                        className="item-card__edit-btn"
                        onClick={(e) => { e.stopPropagation(); startEditRoom(room); }}
                      >
                        Edit
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              className="add-room-toggle"
              type="button"
              onClick={() => setShowAddRoom((v) => !v)}
            >
              {showAddRoom ? "Cancel" : "+ Add a Room"}
            </button>

            {showAddRoom && (
              <form className="project-form add-room-form" onSubmit={handleAddRoom}>
                {formError && <p className="form-error">{formError}</p>}

                <label>
                  Room Name
                  <input
                    type="text"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="e.g. Master Bedroom"
                    required
                  />
                </label>

                <label>
                  Room Type
                  <select
                    value={roomType}
                    onChange={(e) => setRoomType(e.target.value)}
                  >
                    {ROOM_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>

                <button type="submit" disabled={submitting}>
                  {submitting ? "Adding..." : "Add Room"}
                </button>
              </form>
            )}
          </section>
        </>
      )}
    </div>
  );
}
