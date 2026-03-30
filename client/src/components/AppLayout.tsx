import { NavLink, Outlet, useLocation } from "react-router-dom";
import { UpdateBanner } from "./UpdateBanner";

interface Props {
  userName: string;
  onLogout: () => void;
}

function tabClass(isActive: boolean): string {
  return isActive ? "tabbar__tab tabbar__tab--active" : "tabbar__tab";
}

function titleForPath(pathname: string): string {
  if (pathname.startsWith("/projects/")) return "Project Workspace";
  if (pathname.startsWith("/projects")) return "Projects";
  if (pathname.startsWith("/dashboard")) return "Sell Dashboard";
  if (pathname.startsWith("/pricing")) return "Price Analysis";
  if (pathname.startsWith("/profile")) return "Profile";
  if (pathname.startsWith("/settings")) return "Settings";
  return "PCS MoveIQ";
}

export function AppLayout({ userName, onLogout }: Props) {
  const location = useLocation();

  return (
    <div className="mobile-app">
      <header className="topbar">
        <div className="topbar__brand">
          <p className="topbar__eyebrow">Field Briefing</p>
          <h1 className="topbar__title">{titleForPath(location.pathname)}</h1>
        </div>
        <div className="topbar__meta">
          <span className="topbar__user">{userName}</span>
          <button className="topbar__logout" type="button" onClick={onLogout}>
            Log Out
          </button>
        </div>
      </header>

      <UpdateBanner />
      <main className="mobile-app__content">
        <Outlet />
      </main>

      <nav className="tabbar" aria-label="Primary">
        <NavLink to="/" end className={({ isActive }) => tabClass(isActive)}>
          Projects
        </NavLink>
        <NavLink to="/dashboard" className={({ isActive }) => tabClass(isActive)}>
          Dashboard
        </NavLink>
        <NavLink to="/pricing" className={({ isActive }) => tabClass(isActive)}>
          Pricing
        </NavLink>
        <NavLink to="/profile" className={({ isActive }) => tabClass(isActive)}>
          Profile
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => tabClass(isActive)}>
          Settings
        </NavLink>
      </nav>
    </div>
  );
}
