# PCS_MoveIQ — UX Workflow Audit

**Status:** Audit & design only. No code changes proposed in this document are implemented.
**Scope:** Photo capture → identification → model disambiguation → clarifications → pricing → decision → correction → execution tracking → priority panel.
**Bias:** Simplification over completeness. Tiebreakers — fewer buttons, fewer simultaneous states, one primary CTA per item state.

---

## 1. Current Workflow Diagram

```
APP OPEN
  │
  └─► AuthScreen
        │
        └─► HomeRoute (project list)
              │
              └─► ProjectDetailView
                    │
                    ├─► PriorityPanel  (top-N items across rooms, sorted by pcs-urgency-score)
                    │     │
                    │     └─► PriorityRow (collapsed → expanded on tap)
                    │           │
                    │           ├─ status !== "LISTED":
                    │           │     [List for sale] [Mark as donate] [Mark as ship] [Mark as keep]
                    │           │     long-press → multi-select → BulkActionBar [sell|keep|ship|donate]
                    │           │     POST /items/bulk-action
                    │           │
                    │           └─ status === "LISTED":
                    │                 [Open listing] [Mark as sold]
                    │                       │
                    │                       └─► SoldPriceSheet → POST /items/:id/action {action:"sold", soldPriceUsd}
                    │
                    └─► RoomDetailView  (/projects/:id/rooms/:id)
                          │
                          ├─ INTAKE (header)
                          │   [Add Item] → BottomSheet → [Take Photo] [Gallery] [Manual Entry]
                          │                  Photo path → createItem → uploadItemPhoto
                          │                              → identifyItem → getItemPricing  (silent auto-pipeline)
                          │   [Voice]    → BottomSheet → VoiceCapture (idle→recording→parsing→draft)
                          │   [Walkthrough] → batch VoiceCapture → batchIdentifyPrice
                          │
                          └─ ITEM LIST (ItemReadCard × N)
                                │
                                Every active card renders simultaneously:
                                  • RecBadge   • ID-status chip   • FMV chip
                                  • Show Details toggle
                                  • [Identify | Re-identify]   • [Get Pricing]
                                  • [Full Analysis]            • [Mark Done…]
                                  • Edit (top-right)
                                │
                                ├─ BRANCH A: identificationQuality === WEAK
                                │     inline IdentificationCorrectionForm (variant="weak")
                                │     [Confirm & price] → POST /items/:id/correct-and-reprice
                                │
                                ├─ BRANCH B: MEDIUM + status SUGGESTED
                                │     [Confirm] [Edit] [Improve accuracy]
                                │       Confirm           → POST /items/:id/confirm-identification
                                │       Edit              → BottomSheet ItemEditForm
                                │       Improve accuracy  → reveals IdentificationCorrectionForm (variant="medium")
                                │                         → POST /items/:id/correct-and-reprice
                                │
                                ├─ BRANCH C: requiresModelSelection === true
                                │     inline ModelSelectionPrompt (radios + Other)
                                │     [Use this model & reprice] → POST /items/:id/correct-and-reprice
                                │
                                ├─ BRANCH D: identificationStatus ∈ {NONE, CONFIRMED, EDITED}
                                │     [Identify] → POST /items/:id/identify
                                │     (re-enters A | B | C based on returned quality)
                                │
                                ├─ PRICING
                                │     [Get Pricing]   → POST /items/:id/pricing
                                │     [Full Analysis] → identify + pricing + eBay + decision (superset)
                                │     Result shown as 3-band display (Fast Sale / Fair Market / Reach)
                                │
                                ├─ CLARIFICATIONS  (if pendingClarifications)
                                │     inline questions mid-card
                                │     [Submit & Refresh Pricing] → POST /items/:id/clarifications
                                │
                                └─ COMPLETION
                                      [Mark Done…] → reveals popover [Sold|Donated|Shipped|Discarded]
                                        Sold → price input → [Confirm]
                                        POST /items/:id/action  {action, soldPriceUsd: finalPrice}

  Bulk (RoomDetailView select mode):
    [Select] → checkboxes → [Actions (N)] → BottomSheet
    dropdown of all 9 ItemStatus values → POST /items/bulk-update {itemIds, status}
    (different endpoint and vocabulary from PriorityPanel bulk — see P0-2/P1-4)
```

Total visible steps end-to-end on the happy path: **~10** (capture → identify → confirm → model pick → clarify → price → review decision → mark done → pick action → enter price). Strong-confidence items still see most of the same UI — the system does not silence work it has already done with high confidence.

---

## 2. Issues Ranked by Severity

### P0 — Blocks completion or risks data loss

**P0-1. Dual "sold" call sites with mismatched field semantics.**
`client/src/api.ts:237-263`. `applyItemAction` sends `soldPriceUsd`; `markItemAction` accepts a parameter named `finalPrice` and remaps it to `soldPriceUsd` internally. Both POST `/items/:id/action`. Any caller that passes `opts.finalPrice` directly outside `markItemAction` silently sends `undefined` for the price. Fragile in refactor; semantically wrong today.

**P0-2. Bulk status update bypasses the action state machine.**
`client/src/components/RoomDetailView.tsx:1452-1458` and bulk sheet at `:2068-2094`; client `api.ts:286`. The room bulk sheet exposes all 9 raw `ItemStatus` values via `POST /items/bulk-update`. A user can stamp items `SOLD` with no `soldPriceUsd` and divergent `completedAt` semantics versus the action-endpoint path. Status validation and the `ACTION_MAP` guard are skipped entirely.

### P1 — Forces user to guess what to do next, or two paths reach the same outcome inconsistently

**P1-1. Four simultaneous CTAs on every active card with no visual primacy.**
`client/src/components/RoomDetailView.tsx:826-860`. `[Identify/Re-identify] [Get Pricing] [Full Analysis] [Mark Done…]` render at equal weight in a flat `item-card__actions` div. `Full Analysis` is a strict superset of `Identify` + `Get Pricing` but is presented as a peer. The user has no signal which to press first.

**P1-2. Three correction surfaces for one underlying action.**
`client/src/components/IdentificationCorrectionForm.tsx` (all), `client/src/components/ModelSelectionPrompt.tsx` (all), `RoomDetailView.tsx:576-731`. WEAK shows a full inline form; MEDIUM shows a collapsible "Improve accuracy" sub-form; ambiguous-model shows a third inline prompt. All three call `POST /items/:id/correct-and-reprice`. A user encountering each on different items perceives three unrelated interactions.

**P1-3. `ship` vocabulary collision.**
`client/src/types.ts:49-65`, `PriorityPanel.tsx:601` ("Mark as ship" → action `ship` → status `REVIEWED`), `RoomDetailView.tsx:329` ("Shipped" → action `shipped` → status `SHIPPED`). The Priority Panel button leaves the item in a non-terminal status that re-surfaces on next refresh; the user thinks they handled it. Loss of trust in the priority list.

**P1-4. Two bulk endpoints with overlapping but inconsistent capabilities.**
`client/src/api.ts:265-268` (`applyBulkItemAction` → `/items/bulk-action`, 4-bucket action vocabulary) vs. `:286-287` (`bulkUpdateStatus` → `/items/bulk-update`, 9 raw statuses). Same user, two views, different option counts and different downstream side effects — no UI explanation of the difference.

### P2 — Extra clicks / cognitive load

**P2-1. `[Get Pricing]` is dominated by `[Full Analysis]`.**
`RoomDetailView.tsx:836-848`. Wasted clicks if the user picks the smaller action first.

**P2-2. Mark-sold takes 4 taps.**
`RoomDetailView.tsx:240-348`. Reveal popover → tap Sold → type price → confirm. The price visible above the fold is not pre-filled into the input.

**P2-3. Clarification questions buried mid-card.**
`RoomDetailView.tsx:654-713`. Questions render between identification and pricing details; users either miss them or do not understand why pricing changes after answering.

**P2-4. `[Re-identify]` sits next to other CTAs on already-confirmed items.**
`RoomDetailView.tsx:827-830`. Invites accidental re-identification that overwrites confirmed data.

### P3 — Polish

- **P3-1.** `DecisionCard` renders below `MarkDonePopover` (`:862`) — recommendation appears after the completion control.
- **P3-2.** `ProviderBadge` and `ConfigTierBadge` (`:764-767`) add visual noise about which AI model was used.
- **P3-3.** `STATUS_OPTIONS` (`:19`) includes `UNREVIEWED`/`REVIEWED` as bulk dropdown values with no user-facing meaning.

---

## 3. User Friction Points

- **First item after photo capture.** Photo path silently auto-runs identify + price. Card then appears with `[Identify] [Get Pricing] [Full Analysis] [Mark Done…]` all active. The user does not know whether the auto-pipeline ran. *"Do I press Identify again?"*
- **WEAK identification.** Inline correction form appears with no explanation of what triggered it. Pricing CTAs remain visible and clickable in the same row. *"Should I press Get Pricing or fill this form first?"*
- **MEDIUM + ambiguous model.** Three nested affordances appear simultaneously: AI suggestion text, `[Confirm | Edit | Improve accuracy]`, and `ModelSelectionPrompt`. *"Confirm first, or pick the model first? What if I do both?"*
- **Marking sold from RoomDetailView.** User must scroll to `[Mark Done…]`, tap, see grid, tap Sold, then transcribe a price they read three sections up. High abandonment on small screens.
- **`ship` action in PriorityPanel.** Item lands in `REVIEWED` and re-appears in the priority list. *"I just did this — why is it back?"*
- **Bulk sheet in RoomDetailView.** Dropdown shows 9 statuses including `SOLD`. Looks identical to the `Sold` button in MarkDonePopover but bypasses price capture and validation. *"Can I bulk-mark sold here?"*
- **Clarifications mid-card.** A price already shows above the questions. Users assume setup is done and skip the questions, missing better pricing.

---

## 4. Ideal Workflow

**Principles**

1. **One primary action per stage.** Each row exposes exactly one CTA the user is expected to press.
2. **Progressive disclosure.** Identification edits, model picks, clarification answers, pricing detail live behind a single "Refine" affordance.
3. **Default to acting on best guess.** STRONG/MEDIUM identifications commit silently; only WEAK interrupts.
4. **Correct retroactively.** Every committed value is editable from the same row. Corrections trigger `/correct-and-reprice` in the background; no waiting screen.
5. **Bulk-by-default.** The triage list with multi-select + 4-button action bar (already in `PriorityPanel`) is the *primary* execution surface, not an alternate.
6. **Terminal states are one tap from triage.** No separate execution screen.

**AI-confidence policy (the gating rules)**

| Signal | Threshold | Behavior |
|---|---|---|
| `identificationQuality === STRONG` (or `identificationConfidence ≥ 0.75`) | High | Skip correction UI. Pricing runs. Row shows name + price + recommendation. |
| `identificationQuality === MEDIUM` (or `0.45 ≤ confidence < 0.75`) | Medium | Commit best guess. Show "Looks like X — tap to refine" chip inline (collapsed). Pricing runs. No modal. |
| `identificationQuality === WEAK` (or `confidence < 0.45`) | Low | "Needs your eyes" badge. Item excluded from priority sort until refined. Tapping opens the *single* correction sheet. |
| `requiresModelSelection === true` AND identification ≥ MEDIUM | — | Auto-pick `likelyModelOptions[0]`. Show "Assumed: X · change" inline. No prompt. |
| `requiresModelSelection === true` AND identification === WEAK | — | Roll into the same correction sheet. |
| `pendingClarifications` AND `pricingConfidence ≥ 0.5` | Medium+ | Hide questions. Use defaults. Expose under "Refine pricing." |
| `pendingClarifications` AND `pricingConfidence < 0.5` | Low | Surface ONE question inline as a yes/no chip — the highest-impact one only. |
| `pricingConfidence < 0.3` | Very low | Show recommendation; suppress dollar amount. Display "Price unclear · refine." |

All "refine" interactions call `/items/:id/correct-and-reprice`. The row shimmers; the user does not wait.

---

## 5. Simplified Flow Proposal

Five user-visible steps end-to-end. STRONG-confidence items collapse to 4. Bulk actions from triage selection mode collapse to 3.

### Step 1 — Capture (voice + photo, bulk-friendly)

- **Shown:** Full-screen capture surface. One large mic, one camera. Each utterance/photo becomes a chip in a running list. One header CTA: **Done capturing**.
- **Hidden:** Identification, prices, recommendations, room assignment, condition pickers, brand/model fields.
- **Triggers next step:** Tap **Done capturing**. `/parse-voice-photo` and `/items/:id/identify` fan out in background; pricing pipeline runs as each identification resolves.
- **Gating:** None. Every item captured regardless of confidence.

### Step 2 — Triage list (single source of truth)

- **Shown:** One scrollable list, sorted by `pcs-urgency-score`. Row = thumb · name · bucket pill (`sell|keep|ship|donate`) · price tier · expand chevron. Items with WEAK ID float in a small "Needs your eyes" section at top, capped at ≤ 3.
- **Hidden:** Identification reasoning, score breakdown bands, comparable listings, raw clarifications, `IdentificationCorrectionForm` modal, `ModelSelectionPrompt`.
- **Triggers next step:** Tap row → Step 3. Long-press → multi-select → bulk action bar → Step 4. Tap "Needs your eyes" row → inline correction sheet (still inside Step 2).
- **Gating:** STRONG/MEDIUM rows fully populated; MEDIUM gets a subtle "Looks like X · tap to refine" chip. WEAK rows get badge, no price, excluded from sort.

### Step 3 — Item detail (only when user opens a row)

- **Shown:** Expanded row in place. Photo · identified name (editable) · brand/model (editable) · condition · 4 primary buttons **Sell | Keep | Ship | Donate** (same vocabulary as `ACTION_MAP`). Price tier with one-line "why" caption. **Why this score** disclosure collapsed at bottom.
- **Hidden:** Multi-question clarification forms, comparable price tables, full `SellPriorityResult` payload, raw confidence numbers.
- **Triggers next step:** Tap one of the 4 action buttons.
- **Gating:** Inline edits pre-filled with AI's best guess. Model field pre-selected to `likelyModelOptions[0]`. Clarifications appear as toggle rows pre-set to AI's most likely answer. `pricingConfidence < 0.3` replaces dollar with "Price unclear" but keeps action buttons enabled.

### Step 4 — Commit action (one tap, immediate transition)

- **Shown:** Tap collapses row to one-line confirmation: e.g. **"Listed for sale · $225 · Sell now"** with a 5-second **Undo**. For `sell`, the existing `ListingModal` opens once, pre-filled.
- **Hidden:** Status names (`LISTED`/`KEPT`/`REVIEWED`/`DONATED`) replaced by plain English.
- **Triggers next step:** `keep | donate | ship` → row drops out of active list (back to Step 2's reduced list). `sell` → row stays as Listed; one final tap (Step 5) closes the loop.
- **Gating:** None.

### Step 5 — Mark complete (terminal, only for items that were listed)

- **Shown:** On the listed row, single CTA **Mark as sold** → existing `SoldPriceSheet` for `soldPriceUsd`. Alternates under "Other outcome" chevron: **Donated · Shipped · Discarded**.
- **Hidden:** Listing URL (saved at Step 4), every other item.
- **Triggers next step:** None — terminal. `completedAt` stamped. `CompletionStats` absorbs into running total.
- **Gating:** None — terminal states are user-asserted facts.

**Step count:** 5 visible. STRONG items collapse to 4 (skip Step 3). Bulk-from-Step-2 collapses to 3 (skip 3 and 5).

---

## 6. Component-Level UI Changes

| Issue | Component / File | Change Type | Detail |
|---|---|---|---|
| P0-1 | `client/src/api.ts:237-263` | **remove** `markItemAction` | Keep `applyItemAction` as the single mark-sold path; delete the `finalPrice` alias. |
| P0-2 | `RoomDetailView.tsx:1452-1458, 2068-2094` | **replace-with-progressive-disclosure** | Remove raw `STATUS_OPTIONS` dropdown; use the 4-bucket action grid (calling `applyBulkItemAction`). Raw-status override → admin-only escape hatch. |
| P1-1 | `RoomDetailView.tsx:826-860` (`item-card__actions`) | **hide-by-default** + **demote-to-secondary** + **replace-with-progressive-disclosure** | `[Identify]` only when `identificationStatus === "NONE"`. `[Get Pricing]` only when ID confirmed/edited and no pricing yet. `[Full Analysis]` becomes the single primary CTA (rename to "Get Recommendation"); hidden once pricing exists. `[Mark Done…]` only after pricing exists. Re-identify moves into ItemEditForm. |
| P1-2 | `IdentificationCorrectionForm.tsx`, `ModelSelectionPrompt.tsx`, `RoomDetailView.tsx:576-731` | **merge-with-X** | Create one `ItemCorrectionSheet` (BottomSheet) that handles WEAK full form, MEDIUM refinement, model disambiguation by props. Surface via single `[Refine]` CTA on the card. |
| P1-3 | `PriorityPanel.tsx:601`, `RoomDetailView.tsx:329, 333` | **replace-with-progressive-disclosure** | Rename PriorityPanel's "Mark as ship" → "Mark as shipped"; route to `applyItemAction(id, "shipped")` so resulting status is terminal. If planning vs. done must remain distinct, add a one-step confirmation sheet. |
| P1-4 | `client/src/api.ts:286-287`, `RoomDetailView.tsx:1452-1458` | **remove** `bulkUpdateStatus`; **merge-with-X** bulk sheet | Delete client-side `bulkUpdateStatus`. Reuse `BulkActionBar` from `PriorityPanel.tsx` in RoomDetailView select mode. Server `/items/bulk-update` returns 410 or admin-only. |
| P2-1 | `RoomDetailView.tsx:836-848` | **remove** `[Get Pricing]` | Subsumed by single primary CTA in P1-1. |
| P2-2 | `RoomDetailView.tsx:240-348` (`MarkDonePopover`) | **replace-with-progressive-disclosure** | When marking Sold and `priceFairMarket` exists, pre-fill the price input. Sold becomes 2 taps (Sold → Confirm), not 4. |
| P2-3 | `RoomDetailView.tsx:654-713` | **demote-to-secondary** | Move clarifications into the unified `ItemCorrectionSheet`; on row, surface one inline yes/no chip only when `pricingConfidence < 0.5`. |
| P2-4 | `RoomDetailView.tsx:827-830` | **hide-by-default** | Re-identify moves under Edit sheet; not a peer CTA. |

---

## 7. Validation Criteria & Acceptance Gates

### 7a. Quantitative validation criteria

1. **Workflow depth.** Voice/manual capture → terminal status takes ≤ 4 user-initiated network mutations on the happy path.
2. **State-machine coherence.** Every action in `ACTION_MAP` that the user can invoke produces exactly one status. No action lands in an intermediate status that requires a second action to reach the obviously-intended end.
3. **CTA scarcity.** Item card renders at most 1 visually-primary CTA and at most 2 secondary CTAs simultaneously, for any combination of `(identificationStatus, identificationQuality, priceFairMarket, status)`.
4. **NONE-state minimalism.** `identificationStatus === "NONE"` cards render exactly one actionable button (the identification trigger). Zero pricing/decision CTAs.
5. **WEAK-state gate.** `identificationQuality === "WEAK"` cards render zero pricing/decision CTAs until the WEAK gate is resolved.
6. **Pricing path uniqueness.** Exactly one client function is called for "refresh pricing on an already-identified item" within a given UI flow branch.
7. **Bulk path uniqueness.** Exactly one client-callable bulk mutation function exists. `grep -n "bulk-update\|bulkUpdateStatus" client/src/` returns zero matches outside admin code.
8. **Field-name uniqueness.** `grep -r "finalPrice" client/src/` returns zero matches.
9. **Correction form uniqueness.** `document.querySelectorAll('[data-testid="id-correction-form"], [data-testid="model-selection-prompt"]')` length ≤ 1 for any single item.
10. **Modal data persistence.** Modals collecting input retain in-progress state across dismiss/reopen within a session.
11. **Terminal-status guard.** Any action POST against an item already in `{SOLD, DONATED, SHIPPED, DISCARDED}` returns HTTP 409 with `existingStatus` in the body. Client surfaces an error and does not optimistically mutate local state.
12. **Sold-price round-trip.** After successful `sold`, `item.soldPriceUsd` in the response equals the submitted value.

### 7b. Test plan — user-journey scenarios

For each: precondition · steps · expected end state · assertions.

1. **Happy path** (STRONG ID, single model, no clarifications): identify → price → `sell` → `sold`. Exactly 4 mutations. No 4xx/5xx. Card has zero CTAs after `sold`. `recommendation === "COMPLETE"`.
2. **WEAK identification.** Identify → WEAK → submit correction → `correct-and-reprice` returns updated item with pricing. Before correction: 0 pricing/decision CTAs visible. After: pricing visible, `identificationStatus === "EDITED"`, `priceFairMarket` non-null.
3. **Ambiguous model.** Card shows model picker (only one of `IdentificationCorrectionForm` or `ModelSelectionPrompt` mounted). Pick → exactly one endpoint called. After: `requiresModelSelection === false`, picker absent from DOM.
4. **Pricing returns clarifications.** Before submit: no decision CTA visible. Submit → 200 with `pendingClarifications === null` and pricing populated. Form does not re-appear.
5. **Change mind on non-terminal.** `sell` → `LISTED`, then `ship`. After simplification, `ship` resolves to a single defined status; no 409; item remains modifiable.
6. **Terminal-status guard.** POST action against `SOLD` item → 409 with `existingStatus: "SOLD"`. Local state unchanged. UI shows non-empty error.
7. **Bulk action on 5+ items via PriorityPanel.** Exactly one HTTP request to a single bulk endpoint. `updated === 5`. All items now `DONATED`. `/items/bulk-update` not called.
8. **Mid-action network failure.** Identify succeeds, pricing fails (network). After failure: `identificationStatus` unchanged from step 1; user-readable error visible; retry affordance present. After retry success: error dismissed, pricing populated, no duplicate request.

### 7c. Acceptance gates per known P0/P1 issue

Each falsifiable as a before/after pair.

- **P0-1 (mark-sold field names).** Before: `markItemAction` accepts `opts.finalPrice` and remaps internally; `applyItemAction` accepts `soldPriceUsd`. After: one client function; `grep -r "finalPrice" client/src/` returns zero matches.
- **P0-2 (bulk bypasses state machine).** Before: `/items/bulk-update` accepts raw 9-status string; the room bulk sheet exposes it. After: `/items/bulk-update` returns 410 or is admin-only; no client UI dispatches to it; bulk mutations route through `ACTION_MAP` via `/items/bulk-action`.
- **P1-1 (4 simultaneous CTAs).** Before: `RoomDetailView.tsx:826-860` renders Identify/Get Pricing/Full Analysis/Mark Done at equal weight. After: for any `(identificationStatus, identificationQuality, priceFairMarket, status)` tuple, the action area has ≤ 1 primary and ≤ 2 secondary interactive elements; visually-primary count is exactly 1.
- **P1-2 (three correction surfaces).** Before: WEAK inline form, MEDIUM "Improve accuracy" sub-form, and `ModelSelectionPrompt` render in different conditions inside `RoomDetailView.tsx:576-731`. After: at most one correction component mounted per item; entry is a single `[Refine]` CTA → unified sheet.
- **P1-3 (`ship` vocabulary).** Before: PriorityPanel "Mark as ship" → status `REVIEWED`; item re-surfaces in priority list. After: PriorityPanel button is "Mark as shipped" and routes to `applyItemAction(id, "shipped")`; resulting status is `SHIPPED` and the item drops out of the active list.
- **P1-4 (two bulk endpoints).** Before: client exposes both `bulkUpdateStatus` and `applyBulkItemAction`. After: client exposes one; bulk UI in both PriorityPanel and RoomDetailView is the same component calling the same endpoint.
- **9-status × 7-action mismatch.** Before: `STORED` and `UNREVIEWED` have no actions; `ship` lands in `REVIEWED`. After: every user-reachable terminal status has exactly one action that produces it; non-actionable statuses (`UNREVIEWED`, `STORED`) are documented as system-only and unreachable via `POST /items/:id/action`.

---

## 8. Implementation Order

Five small, concrete, independently reviewable steps. Each narrows what's on screen and what calls the backend. Do them in order — earlier steps reduce surface area that later steps must reason about. None depends on a prior step's design, so any can be reverted in isolation.

### Step 1 — Prune the item-card CTAs

**Goal:** One primary CTA per item state. Eliminate the 4-button row.

**Files affected:**
- `client/src/components/RoomDetailView.tsx:826-860` (`item-card__actions`), `:827-830` (Re-identify visibility), `:836-848` (Get Pricing / Full Analysis)

**What to remove:**
- Standalone `[Get Pricing]` button (subsumed by primary CTA)
- `[Re-identify]` from the action row when `identificationStatus ∈ {CONFIRMED, EDITED}`
- `[Full Analysis]` as a peer button

**What to merge:**
- Promote `[Full Analysis]` into the single primary CTA, renamed **"Get Recommendation"**, visible only when `identificationStatus !== "NONE"` and pricing absent
- Move re-identify into the existing `ItemEditForm` (deliberate-entry only)

**Expected user-visible outcome:** An active card shows at most one primary CTA at a time. NONE → "Identify"; identified-no-price → "Get Recommendation"; priced → "Mark Done…". The card stops looking like a control panel.

---

### Step 2 — Collapse the three correction surfaces into one sheet

**Goal:** Single `ItemCorrectionSheet` for WEAK identification, MEDIUM refinement, and model disambiguation.

**Files affected:**
- `client/src/components/IdentificationCorrectionForm.tsx`
- `client/src/components/ModelSelectionPrompt.tsx`
- `client/src/components/RoomDetailView.tsx:576-731`
- New: a unified sheet built on existing `ui/BottomSheet.tsx`

**What to remove:**
- Inline-on-card rendering of `IdentificationCorrectionForm` (variants weak/medium)
- Inline-on-card rendering of `ModelSelectionPrompt`
- The MEDIUM "Improve accuracy" sub-disclosure

**What to merge:**
- One `ItemCorrectionSheet` with three modes (`weak | medium | model-pick`) chosen by props
- Single `[Refine]` CTA on the card opens the sheet; submission calls `POST /items/:id/correct-and-reprice` (no behavior change server-side)

**Expected user-visible outcome:** The item card stops growing inline forms. Refinement is one consistent sheet regardless of which gate triggered it. WEAK items get a "Needs your eyes" badge; everything else proceeds silently.

---

### Step 3 — Unify the bulk path on the action vocabulary

**Goal:** One bulk endpoint, one bulk UI component, used in both PriorityPanel and RoomDetailView.

**Files affected:**
- `client/src/api.ts:286-287` (`bulkUpdateStatus`)
- `client/src/components/RoomDetailView.tsx:1452-1458, 2068-2094` (bulk sheet)
- `client/src/components/PriorityPanel.tsx` (`BulkActionBar` — reused, not modified)
- `server/src/routes/items.routes.ts` (the `/items/bulk-update` route)

**What to remove:**
- Client function `bulkUpdateStatus`
- The 9-status raw dropdown in the room bulk sheet
- Client wiring to `/items/bulk-update` (server route may stay temporarily as admin-only or return 410)

**What to merge:**
- RoomDetailView select mode opens the same `BulkActionBar` (4 buttons: Sell · Keep · Ship · Donate) used in PriorityPanel, dispatching to `/items/bulk-action` via `applyBulkItemAction`

**Expected user-visible outcome:** Identical bulk UX in both views. Four buckets, not nine. Bulk-marking sold no longer skips price capture or state-machine validation.

---

### Step 4 — Unify the mark-sold call

**Goal:** One client function, one field name (`soldPriceUsd`), end-to-end.

**Files affected:**
- `client/src/api.ts:237-263` (`applyItemAction`, `markItemAction`)
- `client/src/components/RoomDetailView.tsx` (call sites of `markItemAction`)
- `client/src/components/PriorityPanel.tsx` (already on `applyItemAction` — verify only)

**What to remove:**
- `markItemAction` function
- The `finalPrice` parameter alias and its remap to `soldPriceUsd`

**What to merge:**
- All callers route through `applyItemAction` with `{ action, soldPriceUsd? }`

**Expected user-visible outcome:** No user-visible change. Behind the scenes, every "mark sold" goes through one path with one field name. `grep -r "finalPrice" client/src/` returns nothing.

---

### Step 5 — Fix the `ship` vocabulary collision

**Goal:** "Mark as shipped" in the PriorityPanel actually puts the item in `SHIPPED`, not `REVIEWED`.

**Files affected:**
- `client/src/components/PriorityPanel.tsx:601` (button label and action verb)
- `client/src/components/RoomDetailView.tsx:329, 333` (the existing "Shipped" path — already correct)
- `server/src/services/items.service.ts:335-343` (`ACTION_MAP` — verify `shipped` mapping; no change expected)

**What to remove:**
- The `ship`-as-planning button label in PriorityPanel (or the planning bucket entirely if not user-needed)

**What to merge:**
- PriorityPanel button becomes **"Mark as shipped"** and calls `applyItemAction(id, "shipped")`, landing the item in terminal status `SHIPPED`. If the planning bucket must remain distinct from the done state, surface it as a one-step confirmation sheet asking "Already shipped, or planning to ship?"

**Expected user-visible outcome:** Items the user "marks as shipped" in the PriorityPanel disappear from the active list and stop re-surfacing on refresh. Trust in the priority list is restored.
