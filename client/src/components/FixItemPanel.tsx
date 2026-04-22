import { useState } from "react";
import type { Item } from "../types";

export const CATEGORY_OPTIONS = [
  "Furniture", "Electronics", "Appliance", "Kitchen", "Tools",
  "Sporting Goods", "Outdoor", "Toys", "Clothing", "Decor",
  "Media", "Linens", "Baby", "Pet", "Office", "Other",
] as const;

export type FixItemMode = "weak" | "medium" | "model-pick";

export interface FixItemEdits {
  identifiedName: string;
  identifiedCategory: string;
  identifiedBrand: string | null;
  identifiedModel: string | null;
}

export interface FixItemPanelProps {
  item: Item;
  mode: FixItemMode;
  modelOptions?: string[];           // required when mode === "model-pick"
  submitting: boolean;
  errorMsg: string | null;
  onSubmit: (edits: FixItemEdits) => void | Promise<unknown>;
}

export function FixItemPanel({ item, mode, modelOptions, submitting, errorMsg, onSubmit }: FixItemPanelProps) {
  // medium mode is collapsed by default; weak and model-pick are always open
  const [expanded, setExpanded] = useState(mode !== "medium");

  // form state shared across modes
  const initialCategory = (CATEGORY_OPTIONS as readonly string[]).includes(item.identifiedCategory ?? item.category ?? "")
    ? (item.identifiedCategory ?? item.category)!
    : "Other";
  const [name, setName] = useState(item.identifiedName ?? item.itemName ?? "");
  const [category, setCategory] = useState<string>(initialCategory);
  const [brand, setBrand] = useState(item.identifiedBrand ?? "");
  const [model, setModel] = useState(item.identifiedModel ?? "");

  // model-pick mode state
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [customModel, setCustomModel] = useState("");
  const isOtherSelected = selectedModel === "Other";

  const collapsed = mode === "medium" && !expanded;

  if (collapsed) {
    return (
      <button
        type="button"
        className="fix-item-panel__toggle"
        onClick={() => setExpanded(true)}
      >
        &#9656; Refine identification (optional)
      </button>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "model-pick") {
      if (!selectedModel) return;
      const chosen = isOtherSelected ? customModel.trim() : selectedModel;
      if (!chosen) return;
      onSubmit({
        identifiedName: item.identifiedName ?? item.itemName,
        identifiedCategory: item.identifiedCategory ?? item.category,
        identifiedBrand: item.identifiedBrand ?? null,
        identifiedModel: chosen,
      });
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) return;
    onSubmit({
      identifiedName: trimmedName,
      identifiedCategory: category,
      identifiedBrand: brand.trim() || null,
      identifiedModel: model.trim() || null,
    });
  }

  // headline + subhead vary slightly by mode but layout is consistent
  const headline =
    mode === "weak" ? "Fix this item"
    : mode === "model-pick" ? "Pick the right model"
    : "Refine identification";
  const subhead =
    mode === "weak" ? "We couldn't confidently identify this. Fill in what you know — we'll re-price after."
    : mode === "model-pick" ? "Choose the model you have so we can refine the price."
    : "Optional — adjust the details and we'll re-price.";

  const submitLabel = submitting ? "Saving…" : "Save & Reprice";
  const canSubmit =
    mode === "model-pick"
      ? !submitting && selectedModel !== null && (!isOtherSelected || customModel.trim().length > 0)
      : !submitting && name.trim().length > 0;

  return (
    <div className="fix-item-panel">
      <div className="fix-item-panel__header">
        <p className="fix-item-panel__headline">{headline}</p>
        <p className="fix-item-panel__sub">{subhead}</p>
      </div>

      <form className="fix-item-panel__body" onSubmit={handleSubmit}>
        {mode === "model-pick" ? (
          <>
            <div className="fix-item-panel__model-options">
              {(modelOptions ?? []).map((opt) => {
                const active = selectedModel === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    disabled={submitting}
                    className={`fix-item-panel__model-option${active ? " fix-item-panel__model-option--active" : ""}`}
                    onClick={() => setSelectedModel(opt)}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
            {isOtherSelected && (
              <input
                type="text"
                className="fix-item-panel__custom-model"
                placeholder="Enter model (e.g. 1637BA)"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                maxLength={100}
                disabled={submitting}
                aria-label="Custom model name"
              />
            )}
          </>
        ) : (
          <>
            <div className="fix-item-panel__field">
              <label htmlFor={`fix-name-${item.id}`}>Name</label>
              <input id={`fix-name-${item.id}`} type="text" required maxLength={200}
                value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="fix-item-panel__field">
              <label htmlFor={`fix-category-${item.id}`}>Category</label>
              <select id={`fix-category-${item.id}`} required value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORY_OPTIONS.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
              </select>
            </div>
            <div className="fix-item-panel__field">
              <label htmlFor={`fix-brand-${item.id}`}>Brand</label>
              <input id={`fix-brand-${item.id}`} type="text" maxLength={100} placeholder="Brand (optional)"
                value={brand} onChange={(e) => setBrand(e.target.value)} />
            </div>
            <div className="fix-item-panel__field">
              <label htmlFor={`fix-model-${item.id}`}>Model</label>
              <input id={`fix-model-${item.id}`} type="text" maxLength={100} placeholder="Model (optional)"
                value={model} onChange={(e) => setModel(e.target.value)} />
            </div>
          </>
        )}

        {errorMsg && <p className="item-error-text">{errorMsg}</p>}

        <div className="fix-item-panel__actions">
          <button type="submit" className="btn-confirm fix-item-panel__submit" disabled={!canSubmit}>
            {submitLabel}
          </button>
          {mode === "medium" && (
            <button type="button" className="btn-cancel" disabled={submitting} onClick={() => setExpanded(false)}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
