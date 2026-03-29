import { useEffect, useState } from "react";
import { AppShell } from "./components/AppShell";
import { AuthScreen } from "./components/AuthScreen";
import { ProfileView } from "./components/ProfileView";
import { ProjectForm } from "./components/ProjectForm";
import { ProjectList } from "./components/ProjectList";
import { ProjectDetailView } from "./components/ProjectDetailView";
import { RoomDetailView } from "./components/RoomDetailView";
import { ProviderSettings } from "./components/ProviderSettings";
import { api, getToken, setToken } from "./api";
import type { UserPublic } from "./types";
import "./App.css";

function App() {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<{
    id: string;
    name: string;
    type: string;
  } | null>(null);
  const [roomsRefreshKey, setRoomsRefreshKey] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  // Check for existing token on mount
  useEffect(() => {
    let cancelled = false;
    if (getToken()) {
      api.getMe()
        .then(u => { if (!cancelled) setUser(u); })
        .catch(() => { if (!cancelled) setToken(null); })
        .finally(() => { if (!cancelled) setAuthChecked(true); });
    } else {
      // No token — skip async check, mark as checked via microtask
      Promise.resolve().then(() => { if (!cancelled) setAuthChecked(true); });
    }
    return () => { cancelled = true; };
  }, []);

  // Listen for forced logout (401 responses)
  useEffect(() => {
    function handleLogout() { setUser(null); }
    window.addEventListener("moveiq:logout", handleLogout);
    return () => window.removeEventListener("moveiq:logout", handleLogout);
  }, []);

  function handleLogout() {
    setToken(null);
    setUser(null);
    setSelectedProjectId(null);
    setSelectedRoom(null);
    setShowSettings(false);
    setShowProfile(false);
  }

  if (!authChecked) {
    return <div className="auth-screen"><p className="loading">Loading...</p></div>;
  }

  if (!user) {
    return <AuthScreen onAuth={setUser} />;
  }

  if (showProfile) {
    return (
      <AppShell userName={user.displayName} onLogout={handleLogout}>
        <ProfileView
          user={user}
          onBack={() => setShowProfile(false)}
          onUpdate={setUser}
        />
      </AppShell>
    );
  }

  if (showSettings) {
    return (
      <AppShell userName={user.displayName} onLogout={handleLogout}>
        <ProviderSettings onBack={() => setShowSettings(false)} />
      </AppShell>
    );
  }

  if (selectedRoom && selectedProjectId) {
    return (
      <AppShell userName={user.displayName} onLogout={handleLogout}>
        <RoomDetailView
          roomId={selectedRoom.id}
          projectId={selectedProjectId}
          roomName={selectedRoom.name}
          roomType={selectedRoom.type}
          onBack={() => {
            setSelectedRoom(null);
            setRoomsRefreshKey((k) => k + 1);
          }}
        />
      </AppShell>
    );
  }

  if (selectedProjectId) {
    return (
      <AppShell userName={user.displayName} onLogout={handleLogout}>
        <ProjectDetailView
          projectId={selectedProjectId}
          onBack={() => { setSelectedProjectId(null); setRefreshKey(k => k + 1); }}
          onSelectRoom={(id, name, type) => setSelectedRoom({ id, name, type })}
          roomsRefreshKey={roomsRefreshKey}
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      userName={user.displayName}
      onSettings={() => setShowSettings(true)}
      onProfile={() => setShowProfile(true)}
      onLogout={handleLogout}
    >
      <ProjectForm onCreated={() => setRefreshKey((k) => k + 1)} />
      <ProjectList refreshKey={refreshKey} onSelect={setSelectedProjectId} />
    </AppShell>
  );
}

export default App;
