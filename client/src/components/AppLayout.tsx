import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "../api";
import { UpdateBanner } from "./UpdateBanner";

interface Props {
  userName: string;
  onLogout: () => void;
}

function parseContext(pathname: string): { projectId?: string; roomId?: string } {
  const roomMatch = pathname.match(/^\/projects\/([^/]+)\/rooms\/([^/]+)/);
  if (roomMatch) return { projectId: roomMatch[1], roomId: roomMatch[2] };
  const projectMatch = pathname.match(/^\/projects\/([^/]+)/);
  if (projectMatch) return { projectId: projectMatch[1] };
  return {};
}

function titleForPath(pathname: string): string {
  if (pathname.startsWith("/rooms")) return "Rooms";
  if (pathname.startsWith("/inventory")) return "Inventory";
  if (pathname.startsWith("/sell")) return "Sell";
  if (pathname.startsWith("/projects/")) return "Rooms";
  if (pathname.startsWith("/profile")) return "Profile";
  if (pathname.startsWith("/pricing")) return "Pricing";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/more")) return "More";
  return "Home";
}

function IconHome() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  );
}

function IconMap() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M3 9h18M9 21V9"/>
    </svg>
  );
}

function IconTrending() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
      <polyline points="17 6 23 6 23 12"/>
    </svg>
  );
}

function IconGrid() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
    </svg>
  );
}

function IconMore() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>
    </svg>
  );
}

export function AppLayout({ userName, onLogout }: Props) {
  const location = useLocation();
  const [contextLabel, setContextLabel] = useState<string>("");

  const routeContext = useMemo(() => parseContext(location.pathname), [location.pathname]);

  useEffect(() => {
    let cancelled = false;
    async function loadContext() {
      if (!routeContext.projectId) {
        if (!cancelled) setContextLabel("");
        return;
      }
      try {
        const project = await api.getProject(routeContext.projectId);
        if (!routeContext.roomId) {
          if (!cancelled) setContextLabel(project.projectName);
          return;
        }
        const rooms = await api.listRooms(routeContext.projectId);
        const room = rooms.find((r) => r.id === routeContext.roomId);
        if (!cancelled) {
          setContextLabel(room ? `${project.projectName} › ${room.roomName}` : project.projectName);
        }
      } catch {
        if (!cancelled) setContextLabel("");
      }
    }
    void loadContext();
    return () => { cancelled = true; };
  }, [routeContext.projectId, routeContext.roomId]);

  const title = titleForPath(location.pathname);

  return (
    <div className="homer-app">
      <header className="homer-topbar">
        <div className="homer-topbar__left">
          <div className="homer-topbar__logo">
            <span className="homer-topbar__logo-icon">🏠</span>
            <span className="homer-topbar__logo-text">MoveIQ</span>
          </div>
          {contextLabel && <p className="homer-topbar__context">{contextLabel}</p>}
        </div>
        <div className="homer-topbar__right">
          <span className="homer-topbar__user">{userName}</span>
          <button className="homer-topbar__logout" type="button" onClick={onLogout}>
            Log Out
          </button>
        </div>
      </header>

      <UpdateBanner />

      <div className="homer-page-title">
        <h1>{title}</h1>
      </div>

      <main className="homer-main">
        <Outlet />
      </main>

      <nav className="homer-tabbar" aria-label="Primary navigation">
        <NavLink to="/" end className={({ isActive }) => `homer-tab ${isActive ? "homer-tab--active" : ""}`}>
          <IconHome />
          <span>Home</span>
        </NavLink>
        <NavLink to="/rooms" className={({ isActive }) => `homer-tab ${isActive ? "homer-tab--active" : ""}`}>
          <IconMap />
          <span>Rooms</span>
        </NavLink>
        <NavLink to="/inventory" className={({ isActive }) => `homer-tab ${isActive ? "homer-tab--active" : ""}`}>
          <IconGrid />
          <span>Inventory</span>
        </NavLink>
        <NavLink to="/sell" className={({ isActive }) => `homer-tab ${isActive ? "homer-tab--active" : ""}`}>
          <IconTrending />
          <span>Sell</span>
        </NavLink>
        <NavLink to="/more" className={({ isActive }) => `homer-tab ${isActive ? "homer-tab--active" : ""}`}>
          <IconMore />
          <span>More</span>
        </NavLink>
      </nav>
    </div>
  );
}
