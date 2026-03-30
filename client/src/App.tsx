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
import type { UserPublic } from "./types";
import { AppLayout } from "./components/AppLayout";
import { AuthScreen } from "./components/AuthScreen";
import { ProfileView } from "./components/ProfileView";
import { ProjectDetailView } from "./components/ProjectDetailView";
import { ProjectForm } from "./components/ProjectForm";
import { ProjectList } from "./components/ProjectList";
import { ProviderSettings } from "./components/ProviderSettings";
import { RoomDetailView } from "./components/RoomDetailView";
import "./App.css";
import "./styles/screens.css";

function HomeRoute() {
  const [refreshKey, setRefreshKey] = useState(0);
  const navigate = useNavigate();

  return (
    <section className="stacked-view">
      <ProjectForm onCreated={() => setRefreshKey((k) => k + 1)} />
      <ProjectList refreshKey={refreshKey} onSelect={(projectId) => navigate(`/projects/${projectId}`)} />
    </section>
  );
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
      onBack={() => navigate(`/projects/${params.projectId}`)}
    />
  );
}

interface AuthedAppProps {
  user: UserPublic;
  onLogout: () => void;
  onUserUpdate: (next: UserPublic) => void;
}

function AuthedApp({ user, onLogout, onUserUpdate }: AuthedAppProps) {
  const navigate = useNavigate();

  return (
    <Routes>
      <Route path="/" element={<AppLayout userName={user.displayName} onLogout={onLogout} />}>
        <Route index element={<HomeRoute />} />
        <Route path="projects/:projectId" element={<ProjectRoute />} />
        <Route path="projects/:projectId/rooms/:roomId" element={<RoomRoute />} />
        <Route path="profile" element={<ProfileView user={user} onBack={() => navigate(-1)} onUpdate={onUserUpdate} />} />
        <Route path="settings" element={<ProviderSettings onBack={() => navigate(-1)} />} />
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
          if (!cancelled) setUser(u);
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
      <AuthedApp user={user} onLogout={handleLogout} onUserUpdate={setUser} />
    </BrowserRouter>
  );
}

export default App;
