import type { ReactNode } from "react";

interface BottomSheetProps {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
}

export function BottomSheet({ open, title, onClose, children }: BottomSheetProps) {
  if (!open) return null;

  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet__grabber" />
        <div className="sheet__header">
          <h3 className="sheet__title">{title ?? "Details"}</h3>
          <button type="button" className="sheet__close" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="sheet__content">{children}</div>
      </div>
    </div>
  );
}
