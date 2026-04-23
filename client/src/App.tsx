import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import { api, getToken, setToken } from "./api";
import { setUserId, clearUserId, clearAll as clearScanCache } from "./plugins/scanStore";
import type { UserPublic } from "./types";
import { AppLayout } from "./components/AppLayout";
import { AuthScreen } from "./components/AuthScreen";
import { ProfileView } from "./components/ProfileView";
import { ProjectDetailView } from "./components/ProjectDetailView";
import { PricingAnalysis } from "./components/PricingAnalysis";
import { MoreView } from "./components/MoreView";
import { SellDashboard } from "./components/dashboard/SellDashboard";
import { ProviderSettings } from "./components/ProviderSettings";
import { RoomDetailView } from "./components/RoomDetailView";
import { RoomsView } from "./components/RoomsView";
import { InventoryBrowser } from "./components/InventoryBrowser";
import { HomeWorkspace } from "./components/HomeWorkspace";
import { ActiveProjectProvider } from "./context/ActiveProjectContext";
import { ToastProvider } from "./components/ui/Toast";
import "./App.css";
import "./styles/screens.css";
import "./styles/ui.css";

function HomeRoute() {
  return <HomeWorkspace />;
}

function ProjectRoute() {
  const navigate = useNavigate();
  const params = useParams<{ projectId: string }>();

  if (!params.projectId) return <Navigate to="/" replace />;

  return (
    <ProjectDetailView
      projectId={params.projectId}
      onBack={() => navigate("/")}
      onSelectRoom={(roomId) => navigate(`/projects/${params.projectId}/rooms/${roomId}`)}
      roomsRefreshKey={0}
    />
  );
}

function RoomRoute() {
  const navigate = useNavigate();
  const params = useParams<{ projectId: string; roomId: string }>();
  const [roomMeta, setRoomMeta] = useState<{ name: string; type: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!params.projectId || !params.roomId) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const rooms = await api.listRooms(params.projectId);
        const room = rooms.find((r) => r.id === params.roomId);
        if (!cancelled) {
          setRoomMeta(room ? { name: room.roomName, type: room.roomType } : null);
        }
      } catch {
        if (!cancelled) setRoomMeta(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [params.projectId, params.roomId]);

  if (!params.projectId || !params.roomId) return <Navigate to="/" replace />;
  if (loading) return <p className="loading">Loading room...</p>;
  if (!roomMeta) return <p className="form-error">Room not found.</p>;

  return (
    <RoomDetailView
      projectId={params.projectId}
      roomId={params.roomId}
      roomName={roomMeta.name}
      roomType={roomMeta.type}
      onBack={() => navigate("/rooms")}
    />
  );
}

interface AuthedAppProps {
  user: UserPublic;
  onLogout: () => void;
  onUserUpdate: (next: UserPublic) => void;
}

function PricingRoute() {
  const navigate = useNavigate();
  return <PricingAnalysis onBack={() => navigate("/more")} />;
}

function DashboardRoute() {
  return <SellDashboard />;
}

function MoreRoute() {
  return <MoreView />;
}

function AuthedApp({ user, onLogout, onUserUpdate }: AuthedAppProps) {
  const navigate = useNavigate();

  return (
    <Routes>
      <Route path="/" element={<AppLayout userName={user.displayName} onLogout={onLogout} />}>
        <Route index element={<HomeRoute />} />
        <Route path="rooms" element={<RoomsView />} />
        <Route path="inventory" element={<InventoryBrowser />} />
        <Route path="sell" element={<DashboardRoute />} />
        <Route path="projects/:projectId" element={<ProjectRoute />} />
        <Route path="projects/:projectId/rooms/:roomId" element={<RoomRoute />} />
        <Route path="pricing" element={<PricingRoute />} />
        <Route path="more" element={<MoreRoute />} />
        <Route path="profile" element={<ProfileView user={user} onBack={() => navigate("/")} onUpdate={onUserUpdate} />} />
        <Route path="settings" element={<ProviderSettings onBack={() => navigate("/more")} />} />
        {/* Legacy redirects */}
        <Route path="dashboard" element={<Navigate to="/sell" replace />} />
        <Route path="valuation" element={<Navigate to="/inventory" replace />} />
        <Route path="floorplan" element={<Navigate to="/rooms" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (getToken()) {
      api
        .getMe()
        .then((u) => {
          if (!cancelled) { setUserId(u.id); setUser(u); }
        })
        .catch(() => {
          if (!cancelled) setToken(null);
        })
        .finally(() => {
          if (!cancelled) setAuthChecked(true);
        });
    } else {
      Promise.resolve().then(() => {
        if (!cancelled) setAuthChecked(true);
      });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleLogout() {
      setUser(null);
    }
    window.addEventListener("moveiq:logout", handleLogout);
    return () => window.removeEventListener("moveiq:logout", handleLogout);
  }, []);

  function handleLogout() {
    setToken(null);
    clearScanCache();
    clearUserId();
    setUser(null);
  }

  if (!authChecked) {
    return <div className="auth-screen"><p className="loading">Loading...</p></div>;
  }

  if (!user) {
    return <AuthScreen onAuth={setUser} />;
  }

  return (
    <BrowserRouter>
      <ActiveProjectProvider>
        <ToastProvider>
          <AuthedApp user={user} onLogout={handleLogout} onUserUpdate={setUser} />
        </ToastProvider>
      </ActiveProjectProvider>
    </BrowserRouter>
  );
}

export default App;
