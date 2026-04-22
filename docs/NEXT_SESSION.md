# PCS_MoveIQ — Resume Point

## Current Status
- Step 1 COMPLETE: single CTA per item
- Step 2 COMPLETE: unified FixItemPanel (all correction flows merged)
- Backend deployed and working (photo-only fix included)

## What was just fixed
- Removed duplicate CTAs
- Unified correction flows
- Fixed transcript/photo pipeline
- Model disambiguation working
- Pricing gated correctly

## Current UX State
Flow is now:
1. Analyze Item
2. Fix Item (if needed)
3. View result
4. Mark Done

## Next Step
Step 3: Unify bulk action paths

Problem:
- Two endpoints: /bulk-action vs /bulk-update
- Different vocabularies
- Risk of inconsistent state and lost sold price

Goal:
- Single bulk action flow
- Use same logic as single-item actions
- Remove raw status-based updates

## Command to resume work

Run this in Claude Code:

Use voltagent-meta:workflow-orchestrator to plan and execute:

TASK:
Implement Step 3 from docs/UX_AUDIT.md: unify the bulk action path.

SOURCE OF TRUTH:
docs/UX_AUDIT.md

GOAL:
Ensure all bulk item completion/update actions go through one consistent action-based path.

FILES:
- client/src/components/PriorityPanel.tsx
- client/src/components/RoomDetailView.tsx
- client/src/api.ts
- server/src/routes/items.routes.ts
- server/src/services/items.service.ts

RULES:
- Step 3 only
- no scope creep
