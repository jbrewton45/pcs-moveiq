import { BottomSheet } from "./BottomSheet";

interface ConfirmSheetProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmTone?: "danger" | "neutral";
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmSheet({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmTone = "danger",
  onCancel,
  onConfirm,
}: ConfirmSheetProps) {
  return (
    <BottomSheet open={open} onClose={onCancel} title={title}>
      <p className="sheet__description">{description}</p>
      <div className="sheet__actions">
        <button type="button" className="sheet__btn sheet__btn--secondary" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={`sheet__btn ${confirmTone === "danger" ? "sheet__btn--danger" : "sheet__btn--primary"}`}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </BottomSheet>
  );
}
