import { useState } from "react";
import type { Item } from "../types";

export const CATEGORY_OPTIONS = [
  "Furniture",
  "Electronics",
  "Appliance",
  "Kitchen",
  "Tools",
  "Sporting Goods",
  "Outdoor",
  "Toys",
  "Clothing",
  "Decor",
  "Media",
  "Linens",
  "Baby",
  "Pet",
  "Office",
  "Other",
] as const;

export interface IdentificationCorrectionFormProps {
  item: Item;
  variant: "weak" | "medium";
  submitting: boolean;
  errorMsg: string | null;
  onSubmit: (edits: {
    identifiedName: string;
    identifiedCategory: string;
    identifiedBrand: string | null;
    identifiedModel: string | null;
  }) => void;
  onCancel?: () => void;
}

function resolveInitialCategory(item: Item): string {
  const raw = item.identifiedCategory ?? item.category ?? "";
  return (CATEGORY_OPTIONS as readonly string[]).includes(raw) ? raw : "Other";
}

export function IdentificationCorrectionForm({
  item,
  variant,
  submitting,
  errorMsg,
  onSubmit,
  onCancel,
}: IdentificationCorrectionFormProps) {
  const [name, setName] = useState(item.identifiedName ?? item.itemName ?? "");
  const [category, setCategory] = useState<string>(resolveInitialCategory(item));
  const [brand, setBrand] = useState(item.identifiedBrand ?? "");
  const [model, setModel] = useState(item.identifiedModel ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    onSubmit({
      identifiedName: trimmedName,
      identifiedCategory: category,
      identifiedBrand: brand.trim() || null,
      identifiedModel: model.trim() || null,
    });
  }

  const bannerClass =
    variant === "weak" ? "id-correction-banner" : "id-correction-banner--medium";

  const headline =
    variant === "weak"
      ? "We couldn't confidently identify this item."
      : "Improve accuracy";

  const subhead =
    variant === "weak"
      ? "Please correct the details below — pricing will be calculated after you confirm."
      : "Refine these details for more accurate pricing.";

  const trimmedName = name.trim();
  const submitDisabled = submitting || !trimmedName;

  return (
    <div>
      <div className={bannerClass}>
        <p className="id-correction-banner__headline">{headline}</p>
        <p className="id-correction-banner__sub">{subhead}</p>
      </div>

      <form className="id-correction-form" onSubmit={handleSubmit}>
        <div className="id-correction-form__field">
          <label htmlFor={`icf-name-${item.id}`}>Name</label>
          <input
            id={`icf-name-${item.id}`}
            type="text"
            required
            maxLength={200}
            placeholder="e.g. Ryobi 18V cordless fan"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="id-correction-form__field">
          <label htmlFor={`icf-category-${item.id}`}>Category</label>
          <select
            id={`icf-category-${item.id}`}
            required
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>

        <div className="id-correction-form__field">
          <label htmlFor={`icf-brand-${item.id}`}>Brand</label>
          <input
            id={`icf-brand-${item.id}`}
            type="text"
            maxLength={100}
            placeholder="Brand (optional)"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
          />
        </div>

        <div className="id-correction-form__field">
          <label htmlFor={`icf-model-${item.id}`}>Model</label>
          <input
            id={`icf-model-${item.id}`}
            type="text"
            maxLength={100}
            placeholder="Model (optional)"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </div>

        {errorMsg && (
          <p className="item-error-text">{errorMsg}</p>
        )}

        <div className="id-correction-form__actions">
          <button
            type="submit"
            className="id-correction-form__submit btn-confirm"
            disabled={submitDisabled}
          >
            {submitting ? "Correcting..." : "Confirm & price"}
          </button>
          {onCancel && (
            <button
              type="button"
              className="btn-cancel"
              disabled={submitting}
              onClick={onCancel}
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
