# PCS MoveIQ — Phase 4 UI Design Specification

Author: UI Designer
Date: 2026-03-28
Status: Ready for implementation

---

## Design Principles Carried Forward

All Phase 4 patterns extend the existing vocabulary without introducing new
primitives. The system already has:

- Inline edit transitions (item-card → item-card--editing with accent left border)
- Delete confirmation as a plain underlined text link in a bordered delete-zone
- Save/Cancel as a flex row of btn-save (accent-filled) + btn-cancel (ghost)
- Section headings as h3.section-heading
- project-form class for any data-entry form block
- rec-badge color tokens for all seven recommendation types
- Custom properties: --color-accent, --color-border, --color-bg, --color-bg-soft

Dark mode is handled by the existing @media (prefers-color-scheme: dark) block.
All new tokens follow the same override pattern.

---

## 1. Summary Dashboard (ProjectDetailView)

### Placement

Inserted between `<PcsTimeline />` and the `<section>` containing the Rooms
heading. This is a standalone `<section>` element with no heading — the
total-count label acts as its caption.

### HTML Structure

```
<section class="rec-summary">
  <p class="rec-summary__total">12 items total</p>
  <div class="rec-summary__row">
    <div class="rec-stat rec-stat--sell-now">
      <span class="rec-stat__count">3</span>
      <span class="rec-stat__label">Sell Now</span>
    </div>
    <div class="rec-stat rec-stat--ship">
      <span class="rec-stat__count">7</span>
      <span class="rec-stat__label">Ship</span>
    </div>
    <!-- only rendered for recs with count > 0 -->
  </div>
</section>
```

### CSS Classes

```css
/* Summary dashboard */
.rec-summary {
  margin-bottom: 1.5rem;
}

.rec-summary__total {
  font-size: 0.8rem;
  font-weight: 600;
  opacity: 0.6;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 0 0 0.6rem;
}

.rec-summary__row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

/* Stat card — inherits rec-badge color tokens */
.rec-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.45rem 0.75rem;
  border-radius: 0.5rem;
  min-width: 3.5rem;
  gap: 0.1rem;
}

.rec-stat__count {
  font-size: 1.4rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.03em;
}

.rec-stat__label {
  font-size: 0.6rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  white-space: nowrap;
}

/*
  Color modifiers mirror rec-badge exactly.
  Each .rec-stat--{x} sets background + color
  using the same values as .rec-badge--{x}.
*/
.rec-stat--sell-now  { background: #fee2e2; color: #b91c1c; }
.rec-stat--sell-soon { background: #fef3c7; color: #92400e; }
.rec-stat--ship      { background: #dbeafe; color: #1d4ed8; }
.rec-stat--store     { background: #ede9fe; color: #6d28d9; }
.rec-stat--donate    { background: #dcfce7; color: #15803d; }
.rec-stat--discard   { background: #f3f4f6; color: #4b5563; }
.rec-stat--keep      { background: #ccfbf1; color: #0f766e; }

/* Dark mode overrides — same dark values as rec-badge dark overrides */
@media (prefers-color-scheme: dark) {
  .rec-stat--sell-now  { background: #450a0a; color: #fca5a5; }
  .rec-stat--sell-soon { background: #451a03; color: #fcd34d; }
  .rec-stat--ship      { background: #172554; color: #93c5fd; }
  .rec-stat--store     { background: #2e1065; color: #c4b5fd; }
  .rec-stat--donate    { background: #052e16; color: #86efac; }
  .rec-stat--discard   { background: #1f2937; color: #9ca3af; }
  .rec-stat--keep      { background: #042f2e; color: #5eead4; }
}
```

### Render Logic (design intent, not code)

1. Fetch all items for the project alongside rooms (already done in the
   useEffect that builds itemCounts — extend it to also build recCounts).
2. Build a map: { SELL_NOW: 3, SHIP: 7, KEEP: 2, ... }
3. Iterate the canonical order array:
   [SELL_NOW, SELL_SOON, SHIP, STORE, DONATE, DISCARD, KEEP]
4. Render a rec-stat card only when count > 0.
5. Total = sum of all counts → displayed in rec-summary__total.
6. If total === 0 (no items in project yet), omit the entire rec-summary section.

### Responsive Behavior

flex-wrap: wrap handles all breakpoints. On a 320px screen, cards at ~3.5rem
min-width wrap naturally into 2-3 per row. No media query needed.
The row is left-aligned to match section-heading and other left-edge elements.

---

## 2. Bulk Selection (RoomDetailView)

### Interaction Flow

State A — Normal mode (default):
  Items section heading row contains only:
    [h3.section-heading "Items"]   [button.bulk-select-btn "Select"]

State B — Selection mode active:
  Heading row becomes:
    [h3.section-heading "Items"]   [button.bulk-select-all "Select All"]
    (right side)                   [button.bulk-cancel-select "Cancel"]

  Each item-card gains a checkbox on its left edge.
  Clicking anywhere on the card (except Edit button) toggles selection.
  A floating action bar appears fixed at the bottom of the viewport.

State C — One or more selected:
  Action bar shows active controls (Update Status, Delete Selected).

State D — Confirm delete:
  window.confirm fires before any delete. If user cancels, nothing changes.

### HTML Structure — Heading Row

```
<div class="section-heading-row">
  <h3 class="section-heading">Items</h3>
  <div class="bulk-controls">
    <!-- Normal mode -->
    <button class="bulk-select-btn" type="button">Select</button>

    <!-- Selection mode — replaces the above -->
    <button class="bulk-select-all-btn" type="button">Select All</button>
    <button class="bulk-cancel-btn" type="button">Cancel</button>
  </div>
</div>
```

### HTML Structure — Item Card in Selection Mode

```
<div class="item-card item-card--selectable [item-card--selected]">
  <label class="item-card__select-area">
    <input
      class="item-card__checkbox"
      type="checkbox"
      checked={isSelected}
    />
    <!-- existing item-card__header, __meta, __flags content unchanged -->
  </label>
</div>
```

The entire card becomes a label wrapping the checkbox so the tap/click target
is the full card width. The Edit button inside uses e.stopPropagation() to
prevent accidental toggling.

### HTML Structure — Floating Action Bar

```
<div class="bulk-action-bar" aria-live="polite">
  <span class="bulk-action-bar__count">3 selected</span>

  <div class="bulk-action-bar__actions">
    <select class="bulk-status-select" aria-label="Update status">
      <option value="">Update Status…</option>
      <option value="UNREVIEWED">Unreviewed</option>
      <option value="REVIEWED">Reviewed</option>
      <option value="LISTED">Listed</option>
      <option value="SOLD">Sold</option>
      <option value="DONATED">Donated</option>
      <option value="STORED">Stored</option>
      <option value="SHIPPED">Shipped</option>
      <option value="DISCARDED">Discarded</option>
      <option value="KEPT">Kept</option>
    </select>

    <button
      class="bulk-delete-btn"
      type="button"
      disabled={selectedCount === 0}
    >
      Delete Selected
    </button>
  </div>
</div>
```

### CSS Classes

```css
/* Section heading row — shared pattern, reusable in ProjectDetailView too */
.section-heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

/* Remove the standalone margin when inside a row */
.section-heading-row .section-heading {
  margin-bottom: 0;
}

/* Bulk control buttons in heading row */
.bulk-controls {
  display: flex;
  gap: 0.4rem;
  align-items: center;
}

.bulk-select-btn {
  background: none;
  border: 1px solid var(--color-border, #ccc);
  border-radius: 0.375rem;
  padding: 0.25rem 0.6rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-accent, #aa3bff);
  cursor: pointer;
  transition: opacity 0.15s;
}
.bulk-select-btn:hover { opacity: 0.7; }

.bulk-select-all-btn {
  background: none;
  border: none;
  padding: 0.25rem 0.4rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-accent, #aa3bff);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.bulk-select-all-btn:hover { opacity: 0.7; }

.bulk-cancel-btn {
  background: none;
  border: 1px solid var(--color-border, #ccc);
  border-radius: 0.375rem;
  padding: 0.25rem 0.6rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: inherit;
  cursor: pointer;
  transition: opacity 0.15s;
}
.bulk-cancel-btn:hover { opacity: 0.7; }

/* Selectable item card */
.item-card--selectable {
  cursor: pointer;
}

.item-card__select-area {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  cursor: pointer;
  width: 100%;
}

.item-card__checkbox {
  /* Slightly larger than default for touch targets */
  width: 1.1rem;
  height: 1.1rem;
  margin-top: 0.15rem;
  flex-shrink: 0;
  accent-color: var(--color-accent, #aa3bff);
  cursor: pointer;
}

/* Visual selected state on the card */
.item-card--selected {
  border-color: var(--color-accent, #aa3bff);
  background: var(--accent-bg, rgba(170, 59, 255, 0.07));
}

/* Floating action bar */
.bulk-action-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 100;
  background: var(--color-bg, #fff);
  border-top: 2px solid var(--color-accent, #aa3bff);
  padding: 0.75rem 1rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.1);
}

/* Constrain action bar to match app max-width */
.bulk-action-bar::before {
  content: '';
  display: none;
}

@media (min-width: 49rem) {
  /* When viewport is wider than the app column, center the bar contents */
  .bulk-action-bar {
    justify-content: center;
  }
  .bulk-action-bar > * {
    max-width: 48rem;
  }
}

.bulk-action-bar__count {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--color-accent, #aa3bff);
  white-space: nowrap;
}

.bulk-action-bar__actions {
  display: flex;
  gap: 0.5rem;
  flex: 1;
  flex-wrap: wrap;
  align-items: center;
}

.bulk-status-select {
  flex: 1;
  min-width: 8rem;
  padding: 0.45rem 0.5rem;
  font-size: 0.85rem;
  border: 1px solid var(--color-border, #ccc);
  border-radius: 0.375rem;
  background: var(--color-bg, #fff);
  color: inherit;
  font-family: inherit;
  cursor: pointer;
}

.bulk-delete-btn {
  padding: 0.45rem 0.75rem;
  font-size: 0.85rem;
  font-weight: 600;
  background: #dc2626;
  color: #fff;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity 0.15s;
}
.bulk-delete-btn:hover:not(:disabled) { opacity: 0.85; }
.bulk-delete-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .bulk-action-bar {
    background: var(--bg, #16171d);
    box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.4);
  }
  .bulk-delete-btn { background: #b91c1c; }
  .item-card--selected {
    border-color: var(--accent, #c084fc);
    background: var(--accent-bg, rgba(192, 132, 252, 0.1));
  }
}
```

### Behavior Notes

- Entering selection mode closes any open inline edit form (reset editingItemId).
- "Select All" label toggles: when all items are selected the button reads
  "Deselect All". This is a single button whose label is derived from
  selectedIds.size === items.length.
- Status update fires immediately on select change (no separate Apply button)
  — matches the pattern of low-friction inline edits already in the app.
  After API success: refresh items list, keep selection mode active so user
  can continue acting on other items.
- Delete confirmation: window.confirm(
    `Delete ${selectedIds.size} items? This cannot be undone.`
  ). On confirm, call bulk delete, then refresh and exit selection mode.
- The action bar adds padding-bottom to the item-list when active so the last
  card is not obscured by the fixed bar. Add class `has-bulk-bar` to the page
  root div when selection mode is active:

```css
.has-bulk-bar {
  padding-bottom: 5rem;
}
```

---

## 3. Room Edit/Delete (ProjectDetailView)

### Trigger

Each room card gets a small "Edit" button inside the card (same pattern as
item-card__edit-btn). Because room cards are currently `<button>` elements,
the Edit button must be a separate interactive element that stops propagation.

The room card structure changes from a single `<button>` to a composite
layout:

```
<div class="room-card room-card--with-edit">
  <button
    class="room-card__nav-area"
    type="button"
    onClick={navigate to room}
    aria-label="Open {roomName}"
  >
    <p class="room-card__name">{roomName}</p>
    <p class="room-card__type">{roomType}</p>
    <p class="room-card__item-count">{count} items</p>
  </button>
  <button
    class="room-card__edit-btn"
    type="button"
    onClick={e => { e.stopPropagation(); openEdit(room.id); }}
    aria-label="Edit {roomName}"
  >
    Edit
  </button>
</div>
```

### Inline Edit State

When editingRoomId === room.id, the room-card content is replaced by the edit
form (same card footprint — no layout shift in the grid):

```
<div class="room-card room-card--editing">
  <form class="room-edit-form" onSubmit={handleRoomSave}>

    <label>
      Room Name
      <input type="text" value={roomName} required />
    </label>

    <label>
      Room Type
      <select value={roomType}>
        {ROOM_TYPES.map…}
      </select>
    </label>

    {formError && <p class="form-error">{formError}</p>}

    <div class="item-edit-actions">
      <button class="btn-cancel" type="button">Cancel</button>
      <button class="btn-save" type="submit">Save</button>
    </div>

    <div class="item-edit-delete-zone">
      <button class="item-delete-btn" type="button">
        Delete this room
      </button>
    </div>

  </form>
</div>
```

The form reuses: room-card as the card shell, item-edit-actions for the
Save/Cancel row, item-edit-delete-zone + item-delete-btn for the delete link.
Only the form field layout needs new CSS.

### Delete Confirmation Message

```
window.confirm(
  `Delete "${roomName}"? All items in this room will also be deleted. This cannot be undone.`
)
```

On confirm: call api.deleteRoom(roomId), then refresh rooms list.

### CSS Classes

```css
/* Room card composite layout */
.room-card--with-edit {
  position: relative;
  padding: 0;           /* remove card padding — inner areas own their spacing */
  display: flex;
  flex-direction: column;
}

.room-card__nav-area {
  /* inherits room-card text styles, gets its own padding */
  padding: 0.75rem 1rem 0.5rem;
  background: none;
  border: none;
  text-align: left;
  font: inherit;
  color: inherit;
  cursor: pointer;
  flex: 1;
  width: 100%;
}

.room-card__edit-btn {
  /* Positioned at bottom-right of the card */
  align-self: flex-end;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-accent, #aa3bff);
  padding: 0.3rem 0.75rem 0.5rem;
  opacity: 0.75;
  transition: opacity 0.15s;
}
.room-card__edit-btn:hover { opacity: 1; }

/* Room card in editing state */
.room-card--editing {
  border-left: 3px solid var(--color-accent, #aa3bff);
  cursor: default;
}
.room-card--editing:hover {
  /* Suppress the hover lift when editing */
  transform: none;
  box-shadow: none;
}

/* Room edit form fields — inherits item-edit-form field styles */
.room-edit-form label {
  display: block;
  margin-bottom: 0.75rem;
  font-size: 0.85rem;
  font-weight: 600;
}

.room-edit-form input,
.room-edit-form select {
  display: block;
  width: 100%;
  margin-top: 0.25rem;
  padding: 0.5rem;
  font-size: 1rem;
  border: 1px solid var(--color-border, #ccc);
  border-radius: 0.375rem;
  background: var(--color-bg, #fff);
  color: inherit;
  box-sizing: border-box;
  font-family: inherit;
}
```

### State Management Design

- `editingRoomId: string | null` in ProjectDetailView component state.
- Setting editingRoomId collapses any open addRoom form.
- On Save: PATCH room → refresh rooms → set editingRoomId to null.
- On Cancel: set editingRoomId to null.
- On Delete: confirm → DELETE room → refresh rooms + item counts → set
  editingRoomId to null.
- Only one room edits at a time (single editingRoomId slot).

---

## 4. Project Edit/Delete (ProjectDetailView)

### Trigger Placement

The "Edit Project" button sits inside the detail-header alongside the project
title block. It occupies a row below the title + route line, or as a small
ghost button to the right of the title block on wider viewports.

Recommended placement: below `detail-name` and `detail-route`, as a small
link-style button — consistent with how Edit appears on item cards.

```
<div class="detail-title-block">
  <h2 class="detail-name">{project.projectName}</h2>
  <p class="detail-route">{from} → {to}</p>
  <button class="project-edit-trigger" type="button">
    Edit Project
  </button>
</div>
```

### Edit State

When `editingProject === true`, the entire content area from the back button
downward is replaced by the edit form. The layout is a `project-form` block
with the same fields as ProjectForm, all pre-filled with current project data.

```
<div>
  <button class="back-btn" onClick={cancelEdit}>
    ← Cancel Edit
  </button>

  <form class="project-form project-edit-form" onSubmit={handleProjectSave}>

    <h2>Edit Project</h2>

    {formError && <p class="form-error">{formError}</p>}

    <label>
      Project Name
      <input type="text" value={projectName} required />
    </label>

    <label>
      Current Location
      <input type="text" value={currentLocation} required />
    </label>

    <label>
      Destination
      <input type="text" value={destination} required />
    </label>

    <label>
      Move Type
      <select value={moveType}>
        <option value="CONUS">CONUS</option>
        <option value="OCONUS">OCONUS</option>
        <option value="JAPAN">Japan</option>
        <option value="EUROPE">Europe</option>
        <option value="STORAGE_ONLY">Storage Only</option>
      </select>
    </label>

    <label>
      Planning Start Date
      <input type="date" value={planningStartDate} required />
    </label>

    <label>
      Hard Move Date (PCS Date)
      <input type="date" value={hardMoveDate} required />
    </label>

    <label>
      Pack-out Date (optional)
      <input type="date" value={optionalPackoutDate} />
    </label>

    <label>
      Housing at Destination
      <select value={housingAssumption}>
        <option value="SMALLER">Smaller</option>
        <option value="SAME">Same Size</option>
        <option value="LARGER">Larger</option>
        <option value="UNKNOWN">Unknown</option>
      </select>
    </label>

    <label>
      Primary Goal
      <select value={userGoal}>
        <option value="MAXIMIZE_CASH">Maximize Cash</option>
        <option value="REDUCE_STRESS">Reduce Stress</option>
        <option value="REDUCE_SHIPMENT_BURDEN">Reduce Shipment Burden</option>
        <option value="FIT_SMALLER_HOME">Fit Smaller Home</option>
        <option value="BALANCED">Balanced</option>
      </select>
    </label>

    <!-- Save/Cancel row — uses existing btn-save + btn-cancel with item-edit-actions layout -->
    <div class="item-edit-actions">
      <button class="btn-cancel" type="button" onClick={cancelEdit}>
        Cancel
      </button>
      <button class="btn-save" type="submit" disabled={saving}>
        {saving ? "Saving..." : "Save Project"}
      </button>
    </div>

    <!-- Delete zone — identical to item/room delete zone -->
    <div class="item-edit-delete-zone">
      <button class="item-delete-btn" type="button" onClick={handleProjectDelete}>
        Delete this project
      </button>
    </div>

  </form>
</div>
```

### Delete Confirmation Message

```
window.confirm(
  `Delete "${project.projectName}"? All rooms and items will also be deleted. This cannot be undone.`
)
```

On confirm: call api.deleteProject(projectId) → call onBack() (navigates to
project list).

### CSS Classes

```css
/* Edit trigger link-button in the title block */
.project-edit-trigger {
  display: inline-flex;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-accent, #aa3bff);
  padding: 0.1em 0;
  margin-top: 0.35rem;
  opacity: 0.75;
  transition: opacity 0.15s;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.project-edit-trigger:hover { opacity: 1; }

/* Project edit form — inherits project-form entirely,
   only needs a distinguishing class for potential future overrides */
.project-edit-form {
  /* No additional styles needed — project-form handles all layout */
}
```

The back-btn is repurposed during edit mode to say "← Cancel Edit" and calls
cancelEdit() instead of onBack(). This avoids adding a second back button to
the view and keeps the navigation chrome clean.

---

## 5. Dark Mode Coverage

All new components are covered by the existing dark mode patterns:

| Element | Token used | Dark value |
|---|---|---|
| rec-stat cards | Same tokens as rec-badge | Same dark overrides block |
| bulk-action-bar background | --bg / --color-bg | #16171d |
| bulk-action-bar border | --color-accent | #c084fc |
| item-card--selected border | --accent | #c084fc |
| item-card--selected bg | --accent-bg | rgba(192,132,252,0.1) |
| bulk-delete-btn | hardcoded #b91c1c in dark override | |
| room-card--editing border | --color-accent | #c084fc |
| project-edit-trigger | --color-accent | #c084fc |

Add this block to the existing dark mode override section in App.css:

```css
@media (prefers-color-scheme: dark) {
  .bulk-action-bar {
    background: #16171d;
    box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.4);
  }
  .bulk-delete-btn { background: #b91c1c; }
  .item-card--selected {
    border-color: #c084fc;
    background: rgba(192, 132, 252, 0.1);
  }
  /* rec-stat dark overrides are in Section 1 above */
}
```

---

## 6. Accessibility Annotations

### Summary Dashboard
- `<section>` has no heading; the `rec-summary__total` `<p>` serves as visual
  caption. Add `aria-label="Item recommendation summary"` to the section.
- Each rec-stat card is presentational (div) — no interactive role needed.

### Bulk Selection
- `<div class="bulk-action-bar" aria-live="polite">` announces count changes
  to screen readers without interrupting focus.
- The checkbox inside item-card has a visible label derived from the item name:
  `<input type="checkbox" aria-label="Select {item.itemName}" />`
- bulk-select-btn, bulk-select-all-btn, bulk-cancel-btn all have explicit
  type="button" to prevent form submission.
- When selection mode is active, the Edit button inside each item card should
  remain accessible. It retains its existing role — selection toggling is
  on the label wrapper, Edit fires its own handler.
- `bulk-status-select` has `aria-label="Update status for selected items"`.

### Room Edit
- `room-card__edit-btn` gets `aria-label="Edit {roomName}"` since "Edit" alone
  is ambiguous when multiple room cards are visible.
- When editing, the first input (Room Name) should receive focus
  programmatically via useEffect on editingRoomId change.

### Project Edit
- The "Edit Project" trigger is visually small — ensure it meets 44x44px touch
  target minimum by extending its padding area rather than its font size.
  Use padding: 0.5rem 0.5rem and margin: -0.5rem -0.5rem to create a larger
  hit area without affecting layout.
- Project edit form heading `<h2>Edit Project</h2>` provides document
  structure for screen readers.

---

## 7. Component Integration Map

```
ProjectDetailView
├── back-btn
├── [editingProject=false] →
│   ├── detail-header
│   │   ├── detail-title-block
│   │   │   ├── detail-name
│   │   │   ├── detail-route
│   │   │   └── project-edit-trigger       ← NEW
│   │   └── PcsCountdown
│   ├── detail-meta (dl)
│   ├── PcsTimeline
│   ├── rec-summary                        ← NEW
│   │   ├── rec-summary__total
│   │   └── rec-summary__row
│   │       └── rec-stat (×N, filtered)
│   └── section.rooms
│       ├── section-heading-row            ← NEW wrapper
│       │   └── section-heading "Rooms"
│       ├── room-grid
│       │   └── room-card--with-edit (×N) ← MODIFIED
│       │       ├── room-card__nav-area
│       │       ├── room-card__edit-btn    ← NEW
│       │       └── [editingRoomId=id] →
│       │           room-card--editing
│       │           └── room-edit-form
│       └── add-room-toggle + add-room-form
└── [editingProject=true] →
    └── project-edit-form                  ← NEW

RoomDetailView
├── back-btn
├── detail-header
└── section.items
    ├── section-heading-row                ← NEW wrapper
    │   ├── section-heading "Items"
    │   └── bulk-controls                  ← NEW
    │       └── [normal] bulk-select-btn
    │           [selecting] bulk-select-all-btn + bulk-cancel-btn
    ├── item-list
    │   └── [normal] ItemReadCard / ItemEditForm (unchanged)
    │       [selecting] item-card--selectable + item-card__select-area
    └── [selectMode=true] bulk-action-bar  ← NEW (fixed position)
```

---

## 8. CSS Delivery Plan

All new CSS belongs in `/client/src/App.css`, appended after the existing
dark mode override block at the bottom of the file. Groupings:

```
/* ── Phase 4: Summary Dashboard ── */
.rec-summary { … }
.rec-summary__total { … }
.rec-summary__row { … }
.rec-stat { … }
.rec-stat__count { … }
.rec-stat__label { … }
.rec-stat--sell-now  { … }  …all 7 modifiers

/* ── Phase 4: Bulk Selection ── */
.section-heading-row { … }
.bulk-controls { … }
.bulk-select-btn { … }
.bulk-select-all-btn { … }
.bulk-cancel-btn { … }
.item-card--selectable { … }
.item-card__select-area { … }
.item-card__checkbox { … }
.item-card--selected { … }
.bulk-action-bar { … }
.bulk-action-bar__count { … }
.bulk-action-bar__actions { … }
.bulk-status-select { … }
.bulk-delete-btn { … }
.has-bulk-bar { … }

/* ── Phase 4: Room Edit/Delete ── */
.room-card--with-edit { … }
.room-card__nav-area { … }
.room-card__edit-btn { … }
.room-card--editing { … }
.room-edit-form label { … }
.room-edit-form input,
.room-edit-form select { … }

/* ── Phase 4: Project Edit/Delete ── */
.project-edit-trigger { … }
.project-edit-form { … }  (empty — inherits project-form)

/* ── Phase 4: Dark mode additions ── */
@media (prefers-color-scheme: dark) {
  .rec-stat--sell-now  { … }  …all 7
  .bulk-action-bar { … }
  .bulk-delete-btn { … }
  .item-card--selected { … }
}
```

Total new CSS: approximately 120 lines.
No new imports, no new dependencies, no modals, no portals.
