# Item Identification + Pricing Guidance — UX Design Specification
## PCS MoveIQ · RoomDetailView · ItemReadCard Extension

---

## 1. Design Foundation

These features are extensions of the existing `ItemReadCard` component. All new elements must
inherit the established token set and not introduce new base colors.

### Token Reference (from index.css + App.css)

| Token | Light | Dark |
|---|---|---|
| `--accent` | `#aa3bff` | `#c084fc` |
| `--accent-bg` | `rgba(170,59,255,0.1)` | `rgba(192,132,252,0.15)` |
| `--accent-border` | `rgba(170,59,255,0.5)` | `rgba(192,132,252,0.5)` |
| `--text` | `#6b6375` | `#9ca3af` |
| `--text-h` | `#08060d` | `#f3f4f6` |
| `--bg` | `#fff` | `#16171d` |
| `--border` | `#e5e4e7` | `#2e303a` |
| `color-accent` (App.css alias) | `#aa3bff` | inherits |
| `color-border` (App.css alias) | `#e0e0e0` | inherits |
| `color-bg-soft` | `#fafafa` | inherits |

New semantic tokens to add:

```css
--status-suggested-bg:   #fefce8;   /* amber-50 */
--status-suggested-text: #92400e;   /* amber-800 */
--status-suggested-border: #fde68a; /* amber-200 */

--status-confirmed-bg:   #f0fdf4;   /* green-50 */
--status-confirmed-text: #15803d;   /* green-700 */
--status-confirmed-border: #bbf7d0; /* green-200 */

--status-edited-bg:   #eff6ff;      /* blue-50 */
--status-edited-text: #1d4ed8;      /* blue-700 */
--status-edited-border: #bfdbfe;    /* blue-200 */

--confidence-empty: var(--border);
--confidence-fill:  var(--accent);

/* Dark mode overrides */
/* suggested */ #451a03 / #fcd34d / #78350f
/* confirmed */ #052e16 / #86efac / #14532d
/* edited    */ #172554 / #93c5fd / #1e3a5f
```

---

## 2. Updated ItemReadCard DOM Order

The full card structure after these features are added:

```
.item-card
  .item-card__header          (photo thumb · name · edit btn · rec badge)
  .item-card__meta            (category · condition · size · weight)
  .item-card__notes           (optional italic notes, 2-line clamp)
  .item-card__flags           (Sentimental · Keep pills — conditional)
  ─────────────────────────── divider: 1px solid var(--border), margin 0.5rem 0
  .item-card__identification  (conditional: only when identificationStatus !== "NONE")
  .item-card__pricing         (conditional: only when pricing data exists)
  ─────────────────────────── divider: 1px solid var(--border), margin 0.5rem 0
  .item-card__actions         (Identify btn · Get Pricing btn)
```

The two dividers use `border-top: 1px solid var(--color-border, #e5e4e7)` and
`padding-top: 0.5rem`. They are actual DOM elements — `<div class="item-card__divider">` —
rather than CSS tricks, so they can be conditionally rendered.

---

## 3. Action Buttons — `.item-card__actions`

### Layout

```
Mobile  (<640px):  column, each button 100% width, gap 0.4rem
Desktop (≥640px):  row, buttons auto-width (shrink to content), gap 0.5rem, justify flex-start
```

### Button Anatomy — `.btn-identify`, `.btn-pricing`

Both share the same visual treatment. The naming difference only matters for future
event tracking or targeted overrides.

```
size:         font-size 0.78rem, font-weight 600
padding:      0.3rem 0.75rem
border-radius: 0.375rem
border:       1.5px solid var(--accent-border, rgba(170,59,255,0.5))
background:   transparent
color:        var(--accent, #aa3bff)
cursor:       pointer
transition:   background 0.15s, border-color 0.15s
```

Hover state:
```
background: var(--accent-bg, rgba(170,59,255,0.1))
border-color: var(--accent, #aa3bff)
```

Disabled / loading state (while async call is in-flight):
```
opacity: 0.5
cursor: not-allowed
border-color: var(--color-border, #e0e0e0)
color: var(--text, #6b6375)
```

Button labels and visibility rules:

| Button | Class | Visible when |
|---|---|---|
| "Identify" | `.btn-identify` | `identificationStatus === "NONE"` |
| "Re-identify" | `.btn-identify` (same class, label swaps) | status is CONFIRMED or EDITED |
| "Get Pricing" | `.btn-pricing` | `item.itemName` and `item.category` both non-empty |

When `identificationStatus === "SUGGESTED"`, the Identify button is hidden — the confirm/edit
controls inside `.item-card__identification` serve that role instead.

---

## 4. Identification Section — `.item-card__identification`

Visible when `identificationStatus !== "NONE"`. Sits between flags and the action row.

### Sub-structure

```
.item-card__identification
  .id-status-badge              ← status pill
  .id-details
    .id-details__name           ← primary name + brand line
    .id-details__category       ← category label
    .confidence-dots            ← dot indicator
  .id-reasoning                 ← italic explanatory string
  .id-actions                   ← [Confirm] [Edit] — SUGGESTED only
```

### Status Badge — `.id-status-badge`

Three modifier variants. Each uses the semantic tokens defined in section 1.

```
.id-status-badge
  font-size:      0.65rem
  font-weight:    700
  letter-spacing: 0.06em
  text-transform: uppercase
  padding:        0.15em 0.5em
  border-radius:  999px
  display:        inline-flex
  margin-bottom:  0.4rem

.id-status-badge--suggested
  background: var(--status-suggested-bg)
  color:      var(--status-suggested-text)
  border:     1px solid var(--status-suggested-border)

.id-status-badge--confirmed
  background: var(--status-confirmed-bg)
  color:      var(--status-confirmed-text)
  border:     1px solid var(--status-confirmed-border)

.id-status-badge--edited
  background: var(--status-edited-bg)
  color:      var(--status-edited-text)
  border:     1px solid var(--status-edited-border)
```

### Identification Details — `.id-details`

```
.id-details
  display: flex
  flex-direction: column
  gap: 0.15rem
  margin-bottom: 0.35rem

.id-details__name
  font-size: 0.88rem
  font-weight: 600
  color: var(--text-h)
  ← render as: "Sectional Sofa" by IKEA (Friheten)
  ← "by IKEA (Friheten)" portion: font-weight 400, color: var(--text)

.id-details__category
  font-size: 0.75rem
  opacity: 0.7
  ← render as: "Category: Furniture"
```

### Reasoning Text — `.id-reasoning`

```
font-size:  0.75rem
font-style: italic
opacity:    0.7
margin-top: 0.25rem
```

### Inline Confirm/Edit Actions — `.id-actions`

Shown only when `identificationStatus === "SUGGESTED"`. These are not the same as the
bottom action row buttons — they are inline confirmation controls.

```
.id-actions
  display: flex
  gap: 0.4rem
  margin-top: 0.5rem
  flex-wrap: wrap          ← wrap on very narrow cards

[Confirm] button:
  font-size: 0.75rem, font-weight 600
  padding: 0.25rem 0.6rem
  border-radius: 0.375rem
  background: var(--status-confirmed-bg, #f0fdf4)
  color: var(--status-confirmed-text, #15803d)
  border: 1px solid var(--status-confirmed-border, #bbf7d0)
  cursor: pointer
  transition: opacity 0.15s

[Edit] button:
  same sizing as Confirm
  background: transparent
  color: var(--text)
  border: 1px solid var(--color-border, #e0e0e0)
  cursor: pointer
```

### SUGGESTED Highlight Bar

When `identificationStatus === "SUGGESTED"`, the entire `.item-card__identification` block
gets a left-border accent treatment to draw the eye:

```
.item-card__identification--pending
  border-left: 3px solid var(--status-suggested-border, #fde68a)
  padding-left: 0.6rem
  border-radius: 0 0.25rem 0.25rem 0
```

This mirrors the existing `.item-card--editing` left-border pattern already in App.css.

---

## 5. Confidence Dots — `.confidence-dots`

Used in both identification and pricing sections. Always a row of exactly 5 dots.

```
.confidence-dots
  display:     inline-flex
  gap:         0.2rem
  align-items: center
  margin-top:  0.2rem

.confidence-dot
  width:         8px
  height:        8px
  border-radius: 50%
  flex-shrink:   0

.confidence-dot--filled
  background: var(--confidence-fill, var(--accent))

.confidence-dot--empty
  background: var(--confidence-empty, var(--border))
```

Threshold mapping:

| Score | Filled dots | Label |
|---|---|---|
| 80–100% | 5 | High |
| 60–79%  | 4 | — |
| 40–59%  | 3 | — |
| 20–39%  | 2 | — |
| 0–19%   | 1 | Low |

### Low Confidence Warning — `.confidence-warning`

Rendered as a sibling immediately after `.confidence-dots` when score < 40%.

```
.confidence-warning
  display:     flex
  align-items: center
  gap:         0.3rem
  font-size:   0.72rem
  font-weight: 600
  color:       #b45309         ← amber-700
  margin-top:  0.25rem

  ← prepend a small inline warning icon (⚠ or SVG) at 0.85em
```

Dark mode override: `color: #fcd34d` (amber-300)

---

## 6. Pricing Section — `.item-card__pricing`

Visible when pricing data exists on the item. Sits below `.item-card__identification`
(or below flags if identification is absent).

### Sub-structure

```
.item-card__pricing
  .pricing-header             ← "Pricing Guidance" label + confidence dots on same row
  .pricing-bands              ← three price band cells
  .pricing-meta               ← channel + speed
  .pricing-reasoning          ← italic reasoning string
  .confidence-warning         ← conditional, if confidence < 40%
  .comp-list                  ← comparable items
```

### Pricing Header

```
.pricing-header
  display:         flex
  justify-content: space-between
  align-items:     center
  margin-bottom:   0.5rem

  Left:  "Pricing Guidance"
         font-size 0.78rem, font-weight 700, text-transform uppercase,
         letter-spacing 0.06em, opacity 0.6

  Right: .confidence-dots (inline, no label text here)
```

### Price Bands — `.pricing-bands`

```
.pricing-bands
  display:         grid
  gap:             0
  border:          1px solid var(--color-border, #e5e4e7)
  border-radius:   0.5rem
  overflow:        hidden
  margin-bottom:   0.6rem

Mobile  (<640px):  grid-template-columns: 1fr
                   each band has border-bottom on all but last

Desktop (≥640px):  grid-template-columns: 1fr 1fr 1fr
                   each band has border-right on all but last
                   border-bottom is removed
```

Each band — `.pricing-band`:

```
.pricing-band
  padding:    0.5rem 0.6rem
  display:    flex
  flex-direction: column
  gap:        0.1rem
  background: var(--color-bg-soft, #fafafa)

.pricing-band__value
  font-size:   1.1rem
  font-weight: 700
  color:       var(--text-h)
  letter-spacing: -0.02em

.pricing-band__label
  font-size:   0.65rem
  font-weight: 600
  text-transform: uppercase
  letter-spacing: 0.06em
  opacity:     0.6
```

The three band labels are "Fast Sale", "Fair Market", and "Reach".
No background color differentiation between bands — keep it neutral.
The visual hierarchy comes from the value being large and bold.

Mobile stacking: on narrow screens, each band occupies a full row as a horizontal flex row
with `.pricing-band__value` on the left and `.pricing-band__label` on the right, vertically
centered. This prevents the tall column layout feeling overly spacious on mobile.

Override for mobile band layout:

```
@media (max-width: 639px) {
  .pricing-band
    flex-direction: row
    align-items:    center
    justify-content: space-between

  .pricing-band__value
    font-size: 1rem

  .pricing-band__label
    text-align: right
}
```

### Pricing Meta — `.pricing-meta`

```
.pricing-meta
  display:   flex
  flex-wrap: wrap
  gap:       0.5rem 1rem
  font-size: 0.78rem
  margin-bottom: 0.35rem

.pricing-meta__item
  display:     flex
  gap:         0.3rem
  align-items: baseline

  Label: font-weight 600, opacity 0.6   (e.g. "Best channel:")
  Value: color var(--text-h)             (e.g. "Facebook Marketplace")

  Speed value color coding:
    Fast     → var(--status-confirmed-text, #15803d)
    Moderate → var(--status-suggested-text, #92400e)
    Slow     → #dc2626 (red-600, existing error color)
```

### Pricing Reasoning — `.pricing-reasoning`

```
font-size:  0.75rem
font-style: italic
opacity:    0.7
margin-bottom: 0.6rem
```

---

## 7. Comparables — `.comp-list` + `.comp-card`

Sits at the bottom of `.item-card__pricing`. A plain vertical stack, no grid.

### List Container

```
.comp-list
  display:        flex
  flex-direction: column
  gap:            0.4rem
  margin-top:     0.5rem

  Preceding label row (not a separate component):
    font-size: 0.72rem, font-weight 700, text-transform uppercase,
    letter-spacing 0.06em, opacity 0.6, margin-bottom 0.25rem
    text: "Comparables"
```

### Comparable Card — `.comp-card`

```
.comp-card
  display:       flex
  flex-direction: row
  align-items:   flex-start
  justify-content: space-between
  padding:       0.45rem 0.6rem
  border:        1px solid var(--color-border, #e5e4e7)
  border-radius: 0.375rem
  background:    var(--color-bg-soft, #fafafa)
  gap:           0.5rem

Left column (flex 1, min-width 0):
  .comp-card__title
    font-size:  0.82rem
    font-weight: 600
    color:      var(--text-h)
    overflow: hidden
    white-space: nowrap
    text-overflow: ellipsis

  .comp-card__source
    font-size: 0.72rem
    opacity:   0.65
    margin-top: 0.1rem

Right column (flex-shrink 0, text-align right):
  .comp-card__price
    font-size:   0.88rem
    font-weight: 700
    color:       var(--text-h)

  .comp-card__status
    font-size:   0.65rem
    font-weight: 700
    text-transform: uppercase
    letter-spacing: 0.06em
    margin-top:  0.1rem
```

Status modifier variants:

```
.comp-card__status--sold
  color: #15803d  (green-700)

.comp-card__status--listed
  color: #1d4ed8  (blue-700)
```

Dark mode overrides:
```
.comp-card__status--sold  → color: #86efac (green-300)
.comp-card__status--listed → color: #93c5fd (blue-300)
```

---

## 8. Async Loading States

Both identification and pricing calls are async. Each button needs a loading state
that provides immediate feedback without a full spinner overlay.

### During "Identify" call in flight

The `.btn-identify` label changes to "Identifying..." and gains the disabled treatment
(opacity 0.5, cursor not-allowed). No other changes to the card.

### During "Get Pricing" call in flight

Same treatment on `.btn-pricing`: label → "Getting pricing..." + disabled state.

### Identification result just arrived (before user confirms)

The card transitions to the SUGGESTED state. The `.item-card__identification` block
slides in with a subtle fade — no transform needed, just:
```
animation: fadeIn 0.2s ease
@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
```

This matches the low-motion budget of the existing app (no existing motion beyond
`transform: translateY(-2px)` on hover).

---

## 9. Complete Card State Matrix

| Scenario | Actions row | Identification block | Pricing block |
|---|---|---|---|
| New item, no details | "Identify" only | hidden | hidden |
| Item has name + category | "Identify" + "Get Pricing" | hidden | hidden |
| Identification SUGGESTED | only Confirm/Edit inside id block; Identify hidden; Get Pricing if eligible | shown, --pending highlight | hidden or shown |
| Identification CONFIRMED | "Re-identify" + "Get Pricing" | shown, --confirmed | hidden or shown |
| Identification EDITED | "Re-identify" + "Get Pricing" | shown, --edited | hidden or shown |
| Pricing data present | unchanged | unchanged | shown |
| Both present | "Re-identify" + "Get Pricing" | shown | shown |

---

## 10. Responsive Breakpoints Summary

All within the existing 48rem max-width container.

| Element | < 640px | ≥ 640px |
|---|---|---|
| `.item-card__actions` | flex-direction: column, full-width buttons | flex-direction: row, auto-width buttons |
| `.pricing-bands` | 1-column grid, bands as horizontal rows | 3-column grid, bands as vertical columns |
| `.comp-list` | always vertical stack | always vertical stack |
| `.id-actions` | flex-wrap: wrap | flex-wrap: wrap (short buttons, rarely wraps) |

---

## 11. Dark Mode Additions

```css
@media (prefers-color-scheme: dark) {
  /* Status tokens */
  --status-suggested-bg:     #451a03;
  --status-suggested-text:   #fcd34d;
  --status-suggested-border: #78350f;

  --status-confirmed-bg:     #052e16;
  --status-confirmed-text:   #86efac;
  --status-confirmed-border: #14532d;

  --status-edited-bg:        #172554;
  --status-edited-text:      #93c5fd;
  --status-edited-border:    #1e3a5f;

  /* Comparables */
  .comp-card__status--sold   { color: #86efac; }
  .comp-card__status--listed { color: #93c5fd; }

  /* Warning */
  .confidence-warning        { color: #fcd34d; }

  /* Speed meta colors */
  /* Fast     → #86efac  */
  /* Moderate → #fcd34d  */
  /* Slow     → #fca5a5  */

  /* Pricing band borders */
  .comp-card, .pricing-bands {
    border-color: var(--border, #2e303a);
  }
}
```

---

## 12. Accessibility Annotations

### Button roles and labels

- `.btn-identify`: `type="button"`, `aria-busy="true"` during loading
- `.btn-pricing`:  `type="button"`, `aria-busy="true"` during loading
- Confirm/Edit inside `.id-actions`: `type="button"`, no form submission

### Confidence dots

The `.confidence-dots` container needs an accessible text equivalent:
```html
<span class="confidence-dots" aria-label="Confidence: 3 out of 5 (60%)">
  <!-- 5 dot spans, aria-hidden="true" -->
</span>
```

### Status badge

The badge text itself is sufficient — "Suggested", "Confirmed", "Edited" — no additional
aria attribute needed. The badge is not an interactive element.

### Color independence

All status states use both color and text. The confidence warning uses an icon plus text.
No information is conveyed by color alone.

### Focus management

After a successful "Identify" call, focus should programmatically move to the
`.item-card__identification` block (add `tabIndex={-1}` and call `.focus()`). This ensures
keyboard and screen reader users are aware of the newly appeared content.

---

## 13. CSS File Placement

All new rules should be appended to
`/Volumes/Clear_NVMe/dev/projects/PCS_MoveIQ/client/src/App.css`
as a clearly demarcated section:

```css
/* ─────────────────────────────────────────────────
   Item Identification + Pricing Guidance
   ───────────────────────────────────────────────── */
```

No new CSS files. The semantic tokens for status colors can be appended to the `:root`
block already present in `index.css`.

---

## 14. What Does Not Change

- The `.item-card__header`, `.item-card__meta`, `.item-card__notes`, `.item-card__flags`
  blocks are untouched.
- `ItemEditForm` is untouched. The new action buttons do not appear when a card is in edit
  mode (`item-card--editing`).
- Bulk select mode: when `selectMode === true`, the `.item-card__actions` row is hidden
  entirely. This matches the existing behavior where `.item-card__edit-btn` is also hidden
  in select mode.
- The photo thumbnail in the header is untouched.
