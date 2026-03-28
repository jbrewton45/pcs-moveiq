import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  onSettings?: () => void;
}

export function AppShell({ children, onSettings }: Props) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>PCS MoveIQ</h1>
        <p>Downsizing assistant for military households</p>
        {onSettings && (
          <button className="app-header__settings-btn" type="button" onClick={onSettings}>
            Settings
          </button>
        )}
      </header>
      <main>{children}</main>
    </div>
  );
}
