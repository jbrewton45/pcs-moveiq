import { useState } from "react";
import { api } from "../api";
import type { UserPublic } from "../types";

interface Props {
  user: UserPublic;
  onBack: () => void;
  onUpdate: (user: UserPublic) => void;
}

export function ProfileView({ user, onBack, onUpdate }: Props) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [branchOfService, setBranchOfService] = useState(user.branchOfService ?? "");
  const [dutyStation, setDutyStation] = useState(user.dutyStation ?? "");
  const [preferredMarketplace, setPreferredMarketplace] = useState(user.preferredMarketplace ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const updated = await api.updateMe({
        displayName: displayName.trim() || undefined,
        branchOfService: branchOfService.trim() || null,
        dutyStation: dutyStation.trim() || null,
        preferredMarketplace: preferredMarketplace.trim() || null,
      });
      onUpdate(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="profile-view">
      <button className="back-btn" onClick={onBack}>← Back</button>
      <h2>My Profile</h2>

      <div className="profile-info">
        <div className="profile-info__field">
          <span className="profile-info__label">Email</span>
          <span className="profile-info__value">{user.email}</span>
        </div>
        <div className="profile-info__field">
          <span className="profile-info__label">Member since</span>
          <span className="profile-info__value">
            {new Date(user.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
        </div>
      </div>

      <form className="project-form" onSubmit={handleSave}>
        {error && <p className="form-error">{error}</p>}
        {saved && <p className="form-success">Profile saved.</p>}

        <label>
          Display Name
          <input
            type="text"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            required
          />
        </label>

        <label>
          Branch of Service
          <select value={branchOfService} onChange={e => setBranchOfService(e.target.value)}>
            <option value="">Not specified</option>
            <option value="Army">Army</option>
            <option value="Navy">Navy</option>
            <option value="Air Force">Air Force</option>
            <option value="Marine Corps">Marine Corps</option>
            <option value="Space Force">Space Force</option>
            <option value="Coast Guard">Coast Guard</option>
          </select>
        </label>

        <label>
          Current Duty Station
          <input
            type="text"
            value={dutyStation}
            onChange={e => setDutyStation(e.target.value)}
            placeholder="e.g. Fort Liberty, NC"
          />
        </label>

        <label>
          Preferred Marketplace
          <select value={preferredMarketplace} onChange={e => setPreferredMarketplace(e.target.value)}>
            <option value="">Not specified</option>
            <option value="Facebook Marketplace">Facebook Marketplace</option>
            <option value="OfferUp">OfferUp</option>
            <option value="Craigslist">Craigslist</option>
            <option value="Base Yard Sale">Base Yard Sale</option>
            <option value="Nextdoor">Nextdoor</option>
          </select>
        </label>

        <button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save Profile"}
        </button>
      </form>
    </div>
  );
}
