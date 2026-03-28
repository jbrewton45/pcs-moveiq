import { useState } from "react";
import { AppShell } from "./components/AppShell";
import { ProjectForm } from "./components/ProjectForm";
import { ProjectList } from "./components/ProjectList";
import { ProjectDetailView } from "./components/ProjectDetailView";
import { RoomDetailView } from "./components/RoomDetailView";
import { ProviderSettings } from "./components/ProviderSettings";
import "./App.css";

function App() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<{
    id: string;
    name: string;
    type: string;
  } | null>(null);
  const [roomsRefreshKey, setRoomsRefreshKey] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  if (showSettings) {
    return (
      <AppShell>
        <ProviderSettings onBack={() => setShowSettings(false)} />
      </AppShell>
    );
  }

  if (selectedRoom && selectedProjectId) {
    return (
      <AppShell>
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
      <AppShell>
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
    <AppShell onSettings={() => setShowSettings(true)}>
      <ProjectForm onCreated={() => setRefreshKey((k) => k + 1)} />
      <ProjectList refreshKey={refreshKey} onSelect={setSelectedProjectId} />
    </AppShell>
  );
}

export default App;
