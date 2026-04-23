import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";

const STORAGE_KEY = "moveiq:activeProjectId";

interface ActiveProjectState {
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;
  clearActiveProject: () => void;
}

const ActiveProjectContext = createContext<ActiveProjectState | null>(null);

function readStored(): string | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

function writeStored(id: string | null): void {
  try {
    if (id == null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // best-effort; ignore
  }
}

interface ActiveProjectProviderProps {
  children: ReactNode;
}

export function ActiveProjectProvider({ children }: ActiveProjectProviderProps) {
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(() => readStored());

  const setActiveProjectId = useCallback((id: string | null) => {
    setActiveProjectIdState(id);
    writeStored(id);
  }, []);

  const clearActiveProject = useCallback(() => {
    setActiveProjectIdState(null);
    writeStored(null);
  }, []);

  const value = useMemo<ActiveProjectState>(
    () => ({ activeProjectId, setActiveProjectId, clearActiveProject }),
    [activeProjectId, setActiveProjectId, clearActiveProject],
  );

  return <ActiveProjectContext.Provider value={value}>{children}</ActiveProjectContext.Provider>;
}

export function useActiveProject(): ActiveProjectState {
  const ctx = useContext(ActiveProjectContext);
  if (!ctx) throw new Error("useActiveProject must be used within ActiveProjectProvider");
  return ctx;
}

/**
 * Hydrate the active-project context from a URL :projectId param when present.
 * URL wins over stored value — deep links are authoritative.
 * Mount this hook inside any route that carries :projectId.
 */
export function useHydrateActiveProjectFromUrl(): void {
  const params = useParams<{ projectId?: string }>();
  const { activeProjectId, setActiveProjectId } = useActiveProject();
  useEffect(() => {
    if (params.projectId && params.projectId !== activeProjectId) {
      setActiveProjectId(params.projectId);
    }
  }, [params.projectId, activeProjectId, setActiveProjectId]);
}
