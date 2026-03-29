import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  userName?: string;
  onSettings?: () => void;
  onProfile?: () => void;
  onLogout?: () => void;
}

export function AppShell({ children, userName, onSettings, onProfile, onLogout }: Props) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>PCS MoveIQ</h1>
        <p>Downsizing assistant for military households</p>
        {userName && (
          <div className="app-header__user-row">
            <span className="app-header__user-name">{userName}</span>
            {onProfile && (
              <button className="app-header__settings-btn" type="button" onClick={onProfile}>
                Profile
              </button>
            )}
            {onSettings && (
              <button className="app-header__settings-btn" type="button" onClick={onSettings}>
                Settings
              </button>
            )}
            {onLogout && (
              <button className="app-header__settings-btn app-header__logout-btn" type="button" onClick={onLogout}>
                Log Out
              </button>
            )}
          </div>
        )}
      </header>
      <main>{children}</main>
    </div>
  );
}
