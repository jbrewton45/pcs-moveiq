import type { Project, Room, Item, Comparable, ProjectWorkspace, UserPublic } from "./types";

const BASE = "/api";

let authToken: string | null = localStorage.getItem("moveiq_token");

export function setToken(token: string | null) {
  authToken = token;
  if (token) localStorage.setItem("moveiq_token", token);
  else localStorage.removeItem("moveiq_token");
}

export function getToken(): string | null {
  return authToken;
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  return headers;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: authHeaders(),
    ...options,
  });
  if (res.status === 401) {
    setToken(null);
    window.dispatchEvent(new Event("moveiq:logout"));
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as Record<string, unknown>).error as string ?? `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // Auth
  signup: (email: string, password: string, displayName: string) =>
    request<{ user: UserPublic; token: string }>("/auth/signup", {
      method: "POST", body: JSON.stringify({ email, password, displayName }),
    }),

  login: (email: string, password: string) =>
    request<{ user: UserPublic; token: string }>("/auth/login", {
      method: "POST", body: JSON.stringify({ email, password }),
    }),

  getMe: () => request<UserPublic>("/auth/me"),

  updateMe: (data: { displayName?: string; branchOfService?: string | null; dutyStation?: string | null; preferredMarketplace?: string | null }) =>
    request<UserPublic>("/auth/me", { method: "PUT", body: JSON.stringify(data) }),

  // Health
  getHealth: () => request<{ ok: boolean }>("/health"),

  // Projects
  listProjects: () => request<Project[]>("/projects"),

  getProject: (id: string) => request<Project>(`/projects/${id}`),

  createProject: (
    data: Omit<Project, "id" | "userId" | "createdAt" | "updatedAt">
  ) => request<Project>("/projects", { method: "POST", body: JSON.stringify(data) }),

  listRooms: (projectId: string) =>
    request<Room[]>(`/rooms?projectId=${projectId}`),

  createRoom: (data: { projectId: string; roomName: string; roomType: string }) =>
    request<Room>("/rooms", { method: "POST", body: JSON.stringify(data) }),

  listItems: (params: { projectId?: string; roomId?: string }) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null))
    ).toString();
    return request<Item[]>(`/items?${qs}`);
  },

  createItem: (
    data: Omit<Item, "id" | "recommendation" | "status" | "identificationStatus" | "createdAt" | "updatedAt">
  ) => request<Item>("/items", { method: "POST", body: JSON.stringify(data) }),

  updateItem: (
    id: string,
    data: Partial<Pick<Item, "itemName" | "category" | "condition" | "sizeClass" | "notes" | "weightLbs" | "sentimentalFlag" | "keepFlag" | "willingToSell">>
  ) => request<Item>(`/items/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  deleteItem: (id: string) =>
    fetch(`${BASE}/items/${id}`, { method: "DELETE", headers: authHeaders() }).then((res) => {
      if (!res.ok) throw new Error("Failed to delete item");
    }),

  getProjectSummary: (id: string) =>
    request<Record<string, number>>(`/projects/${id}/summary`),

  updateProject: (id: string, data: Omit<Partial<Omit<Project, "id" | "userId" | "createdAt" | "updatedAt">>, "weightAllowanceLbs"> & { weightAllowanceLbs?: number | null }) =>
    request<Project>(`/projects/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  deleteProject: (id: string) =>
    fetch(`${BASE}/projects/${id}`, { method: "DELETE", headers: authHeaders() }).then(res => {
      if (!res.ok) throw new Error("Failed to delete project");
    }),

  updateRoom: (id: string, data: { roomName?: string; roomType?: string }) =>
    request<Room>(`/rooms/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  deleteRoom: (id: string) =>
    fetch(`${BASE}/rooms/${id}`, { method: "DELETE", headers: authHeaders() }).then(res => {
      if (!res.ok) throw new Error("Failed to delete room");
    }),

  bulkUpdateStatus: (itemIds: string[], status: string) =>
    request<{ updated: number }>("/items/bulk-update", { method: "POST", body: JSON.stringify({ itemIds, status }) }),

  bulkDeleteItems: (itemIds: string[]) =>
    request<{ deleted: number }>("/items/bulk-delete", { method: "POST", body: JSON.stringify({ itemIds }) }),

  getProjectExport: (id: string) =>
    request<{ project: Project; rooms: Room[]; packingList: { recommendation: string; items: Item[] }[] }>(`/projects/${id}/export`),

  getProjectWeight: (id: string) =>
    request<{ totalWeight: number; roomWeights: Record<string, number>; itemsWithWeight: number; itemsWithoutWeight: number }>(`/projects/${id}/weight`),

  getProjectWorkspace: (id: string) =>
    request<ProjectWorkspace>(`/projects/${id}/workspace`),

  uploadItemPhoto: (id: string, file: File) => {
    const form = new FormData();
    form.append("photo", file);
    const headers: Record<string, string> = {};
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
    return fetch(`${BASE}/items/${id}/photo`, { method: "POST", body: form, headers })
      .then(async res => {
        if (!res.ok) throw new Error("Upload failed");
        return res.json() as Promise<Item>;
      });
  },

  deleteItemPhoto: (id: string) => request<Item>(`/items/${id}/photo`, { method: "DELETE" }),

  identifyItem: (id: string) => request<Item>(`/items/${id}/identify`, { method: "POST" }),

  confirmIdentification: (id: string, edits?: { identifiedName?: string; identifiedCategory?: string; identifiedBrand?: string; identifiedModel?: string }) =>
    request<Item>(`/items/${id}/confirm-identification`, {
      method: "POST",
      body: edits ? JSON.stringify(edits) : "{}",
    }),

  getItemPricing: (id: string) =>
    request<{ item: Item; comparables: Comparable[] }>(`/items/${id}/pricing`, { method: "POST" }),

  getComparables: (id: string) => request<Comparable[]>(`/items/${id}/comparables`),

  getProviderStatus: () => request<ProviderStatus>("/providers/status"),

  testClaude: () => request<ProviderTestResult>("/providers/test/claude", { method: "POST" }),

  testEbay: () => request<ProviderTestResult>("/providers/test/ebay", { method: "POST" }),

  testOpenAI: () => request<ProviderTestResult>("/providers/test/openai", { method: "POST" }),

  submitClarifications: (itemId: string, answers: Record<string, string>) =>
    request<Item>(`/items/${itemId}/clarifications`, {
      method: "POST",
      body: JSON.stringify({ answers }),
    }),

  batchIdentifyPrice: (itemIds: string[]) =>
    request<{
      results: Array<{
        itemId: string;
        status: "complete" | "no_estimate" | "error";
        item?: Item;
      }>;
    }>("/items/batch-identify-price", {
      method: "POST",
      body: JSON.stringify({ itemIds }),
    }),

  parseVoiceTranscript: (transcript: string, roomType?: string) =>
    request<{
      itemName: string;
      category: string;
      condition: string;
      sizeClass: string;
      notes: string;
      willingToSell: boolean;
      keepFlag: boolean;
      sentimentalFlag: boolean;
    }>("/items/parse-voice", {
      method: "POST",
      body: JSON.stringify({ transcript, roomType }),
    }),

  parseVoiceWithPhoto: (transcript: string, photo: File, roomType?: string) => {
    const form = new FormData();
    form.append("transcript", transcript);
    if (roomType) form.append("roomType", roomType);
    form.append("photo", photo);
    const headers: Record<string, string> = {};
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
    return fetch(`${BASE}/items/parse-voice-photo`, { method: "POST", body: form, headers })
      .then(async res => {
        if (res.status === 401) { setToken(null); window.dispatchEvent(new Event("moveiq:logout")); }
        if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error((body as Record<string, unknown>).error as string ?? `${res.status}`); }
        return res.json() as Promise<{
          itemName: string;
          category: string;
          condition: string;
          sizeClass: string;
          notes: string;
          willingToSell: boolean;
          keepFlag: boolean;
          sentimentalFlag: boolean;
        }>;
      });
  },
};

export interface ProviderTestResult {
  ok: boolean;
  message: string;
  testedAt: string;
}

export interface ProviderStatus {
  claude: {
    configured: boolean;
    maskedKey: string | null;
    mode: "live" | "unavailable";
    lastTest?: ProviderTestResult;
  };
  openai: {
    configured: boolean;
    maskedKey: string | null;
    mode: "live" | "unavailable";
    lastTest?: ProviderTestResult;
  };
  ebay: {
    configured: boolean;
    maskedAppId: string | null;
    hasCertId: boolean;
    mode: "live" | "unavailable";
    lastTest?: ProviderTestResult;
  };
  overallMode: "live" | "fallback" | "mock";
}
