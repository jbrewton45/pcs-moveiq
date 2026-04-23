import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useActiveProject } from "../context/ActiveProjectContext";

interface HeaderOverflowMenuProps {
  onLogout: () => void;
}

export function HeaderOverflowMenu({ onLogout }: HeaderOverflowMenuProps) {
  const navigate = useNavigate();
  const { activeProjectId } = useActiveProject();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function goto(path: string) {
    setOpen(false);
    navigate(path);
  }

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Menu"
        aria-expanded={open}
        style={{
          background: "transparent",
          border: "1px solid var(--border-soft)",
          borderRadius: 999,
          padding: "4px 10px",
          fontSize: 16,
          lineHeight: 1,
          cursor: "pointer",
          color: "var(--text-primary)",
        }}
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 180,
            background: "var(--bg-card)",
            border: "1px solid var(--border-soft)",
            borderRadius: "var(--radius-md)",
            boxShadow: "0 6px 24px rgba(0,0,0,0.08)",
            padding: 4,
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <MenuItem label="Profile" onClick={() => goto("/profile")} />
          <MenuItem label="Marketplace settings" onClick={() => goto("/settings")} />
          <MenuItem label="Pricing analysis" onClick={() => goto("/pricing")} />
          {activeProjectId && (
            <MenuItem
              label="Move settings"
              onClick={() => goto(`/projects/${activeProjectId}`)}
            />
          )}
          <div style={{ height: 1, background: "var(--border-soft)", margin: "4px 0" }} />
          <MenuItem label="Log out" danger onClick={() => { setOpen(false); onLogout(); }} />
        </div>
      )}
    </div>
  );
}

function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        background: "transparent",
        border: "none",
        textAlign: "left",
        padding: "10px 12px",
        fontSize: 14,
        fontWeight: 500,
        color: danger ? "#ef4444" : "var(--text-primary)",
        cursor: "pointer",
        borderRadius: 6,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-elevated)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {label}
    </button>
  );
}
