import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "../api";
import { UpdateBanner } from "./UpdateBanner";

interface Props {
  userName: string;
  onLogout: () => void;
}

function tabClass(isActive: boolean): string {
  return isActive ? "tabbar__tab tabbar__tab--active" : "tabbar__tab";
}

function titleForPath(pathname: string): string {
  if (pathname.startsWith("/projects/")) return "Inventory";
  if (pathname.startsWith("/dashboard")) return "Sell Dashboard";
  if (pathname.startsWith("/profile")) return "Profile";
  if (pathname.startsWith("/pricing")) return "Pricing Analysis";
  if (pathname.startsWith("/settings")) return "Provider Settings";
  if (pathname.startsWith("/more")) return "More";
  return "Inventory";
}

function parseContext(pathname: string): { projectId?: string; roomId?: string } {
  const roomMatch = pathname.match(/^\/projects\/([^/]+)\/rooms\/([^/]+)/);
  if (roomMatch) return { projectId: roomMatch[1], roomId: roomMatch[2] };
  const projectMatch = pathname.match(/^\/projects\/([^/]+)/);
  if (projectMatch) return { projectId: projectMatch[1] };
  return {};
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
          setContextLabel(room ? `${project.projectName} / ${room.roomName}` : project.projectName);
        }
      } catch {
        if (!cancelled) setContextLabel("");
      }
    }

    void loadContext();

    return () => {
      cancelled = true;
    };
  }, [routeContext.projectId, routeContext.roomId]);

  return (
    <div className="mobile-app">
      <header className="topbar">
        <div className="topbar__brand">
          <p className="topbar__eyebrow">Field Briefing</p>
          <h1 className="topbar__title">{titleForPath(location.pathname)}</h1>
          {contextLabel && <p className="topbar__context">{contextLabel}</p>}
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
          Inventory
        </NavLink>
        <NavLink to="/dashboard" className={({ isActive }) => tabClass(isActive)}>
          Dashboard
        </NavLink>
        <NavLink to="/profile" className={({ isActive }) => tabClass(isActive)}>
          Profile
        </NavLink>
        <NavLink to="/more" className={({ isActive }) => tabClass(isActive)}>
          More
        </NavLink>
      </nav>
    </div>
  );
}
