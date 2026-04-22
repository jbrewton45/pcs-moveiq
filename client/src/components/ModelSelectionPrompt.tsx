import { useState } from "react";

export interface ModelSelectionPromptProps {
  options: string[];              // from item.likelyModelOptions (already includes "Other" last)
  busy: boolean;
  errorMsg: string | null;
  onSubmit: (chosenModel: string) => void;
  itemLabelHint?: string;         // optional, e.g. "Pelican Air hard case"
}

export function ModelSelectionPrompt({
  options,
  busy,
  errorMsg,
  onSubmit,
  itemLabelHint,
}: ModelSelectionPromptProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [customValue, setCustomValue] = useState("");

  const isOtherSelected = selected === "Other";
  const trimmedCustom = customValue.trim();
  const canSubmit =
    !busy &&
    (selected !== null) &&
    (!isOtherSelected || trimmedCustom.length > 0);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit(isOtherSelected ? trimmedCustom : (selected as string));
  }

  return (
    <form className="model-selection-prompt" onSubmit={handleSubmit}>
      <p className="model-selection-prompt__headline">
        {itemLabelHint
          ? `We couldn't pin down the exact ${itemLabelHint} model. Pick one to refine the price.`
          : "We couldn't pin down the exact model. Pick one to refine the price."}
      </p>
      <div className="model-selection-prompt__options">
        {options.map((opt) => {
          const isOther = opt === "Other";
          const active = selected === opt;
          return (
            <button
              key={opt}
              type="button"
              disabled={busy}
              className={[
                "model-selection-prompt__option",
                isOther ? "model-selection-prompt__option--other" : "",
                active ? "model-selection-prompt__option--active" : "",
              ].filter(Boolean).join(" ")}
              onClick={() => setSelected(opt)}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {isOtherSelected && (
        <input
          type="text"
          className="model-selection-prompt__custom"
          placeholder="Enter model (e.g. 1637BA)"
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          maxLength={100}
          disabled={busy}
          aria-label="Custom model name"
        />
      )}
      {errorMsg && <p className="item-error-text">{errorMsg}</p>}
      <div className="model-selection-prompt__actions">
        <button
          type="submit"
          className="btn-confirm"
          disabled={!canSubmit}
        >
          {busy ? "Refining\u2026" : "Use this model & reprice"}
        </button>
      </div>
    </form>
  );
}
