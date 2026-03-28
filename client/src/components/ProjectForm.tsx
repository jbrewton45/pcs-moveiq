import { useState } from "react";
import type { MoveType, HousingAssumption, UserGoal } from "../types";
import { api } from "../api";

const MOVE_TYPES: MoveType[] = ["CONUS", "OCONUS", "JAPAN", "EUROPE", "STORAGE_ONLY"];
const HOUSING_OPTIONS: HousingAssumption[] = ["SMALLER", "SAME", "LARGER", "UNKNOWN"];
const GOAL_OPTIONS: UserGoal[] = [
  "MAXIMIZE_CASH",
  "REDUCE_STRESS",
  "REDUCE_SHIPMENT_BURDEN",
  "FIT_SMALLER_HOME",
  "BALANCED",
];

function label(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface Props {
  onCreated: () => void;
}

export function ProjectForm({ onCreated }: Props) {
  const [projectName, setProjectName] = useState("");
  const [currentLocation, setCurrentLocation] = useState("");
  const [destination, setDestination] = useState("");
  const [moveType, setMoveType] = useState<MoveType>("CONUS");
  const [planningStartDate, setPlanningStartDate] = useState("");
  const [hardMoveDate, setHardMoveDate] = useState("");
  const [optionalPackoutDate, setOptionalPackoutDate] = useState("");
  const [housingAssumption, setHousingAssumption] = useState<HousingAssumption>("UNKNOWN");
  const [userGoal, setUserGoal] = useState<UserGoal>("BALANCED");
  const [weightAllowanceLbs, setWeightAllowanceLbs] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api.createProject({
        projectName,
        currentLocation,
        destination,
        moveType,
        planningStartDate,
        hardMoveDate,
        ...(optionalPackoutDate ? { optionalPackoutDate } : {}),
        housingAssumption,
        userGoal,
        ...(weightAllowanceLbs.trim() ? { weightAllowanceLbs: parseFloat(weightAllowanceLbs) } : {}),
      });
      setProjectName("");
      setCurrentLocation("");
      setDestination("");
      setMoveType("CONUS");
      setPlanningStartDate("");
      setHardMoveDate("");
      setOptionalPackoutDate("");
      setHousingAssumption("UNKNOWN");
      setUserGoal("BALANCED");
      setWeightAllowanceLbs("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="project-form" onSubmit={handleSubmit}>
      <h2>New Move Project</h2>

      {error && <p className="form-error">{error}</p>}

      <label>
        Project Name
        <input
          type="text"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="e.g. PCS to Humphreys 2026"
          required
        />
      </label>

      <label>
        Current Location
        <input
          type="text"
          value={currentLocation}
          onChange={(e) => setCurrentLocation(e.target.value)}
          placeholder="e.g. Fort Liberty, NC"
          required
        />
      </label>

      <label>
        Destination
        <input
          type="text"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="e.g. Camp Humphreys, KR"
          required
        />
      </label>

      <label>
        Move Type
        <select value={moveType} onChange={(e) => setMoveType(e.target.value as MoveType)}>
          {MOVE_TYPES.map((t) => (
            <option key={t} value={t}>
              {label(t)}
            </option>
          ))}
        </select>
      </label>

      <label>
        Planning Start Date
        <input
          type="date"
          value={planningStartDate}
          onChange={(e) => setPlanningStartDate(e.target.value)}
          required
        />
      </label>

      <label>
        Hard PCS Date
        <input
          type="date"
          value={hardMoveDate}
          onChange={(e) => setHardMoveDate(e.target.value)}
          required
        />
      </label>

      <label>
        Pack-out Date (optional)
        <input
          type="date"
          value={optionalPackoutDate}
          onChange={(e) => setOptionalPackoutDate(e.target.value)}
        />
      </label>

      <label>
        Housing at Destination
        <select
          value={housingAssumption}
          onChange={(e) => setHousingAssumption(e.target.value as HousingAssumption)}
        >
          {HOUSING_OPTIONS.map((h) => (
            <option key={h} value={h}>
              {label(h)}
            </option>
          ))}
        </select>
      </label>

      <label>
        Your Goal
        <select value={userGoal} onChange={(e) => setUserGoal(e.target.value as UserGoal)}>
          {GOAL_OPTIONS.map((g) => (
            <option key={g} value={g}>
              {label(g)}
            </option>
          ))}
        </select>
      </label>

      <label>
        Weight Allowance (lbs, optional)
        <div className="weight-input-group">
          <input
            className="weight-input-group__input"
            type="number"
            step="1"
            min="0"
            inputMode="numeric"
            placeholder="e.g. 18000"
            value={weightAllowanceLbs}
            onChange={(e) => setWeightAllowanceLbs(e.target.value)}
          />
          <span className="weight-input-group__suffix">lbs</span>
        </div>
      </label>

      <button type="submit" disabled={submitting}>
        {submitting ? "Creating..." : "Create Project"}
      </button>
    </form>
  );
}
