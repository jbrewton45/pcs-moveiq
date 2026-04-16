import type { Project, Room, Item, Comparable, ProjectWorkspace, UserPublic, EbayAnalysisResult, SellPriorityResult, RoomScanData, RoomScan, ItemPlacementInput, OrphanedItem, PrioritizedItem, ItemDecisionAction, CategoryCalibration } from "./types";
import { Capacitor } from "@capacitor/core";

const configuredApiOrigin = (import.meta.env.VITE_API_ORIGIN as string | undefined)?.trim();
const apiOrigin = configuredApiOrigin ? configuredApiOrigin.replace(/\/$/, "") : "";

if (Capacitor.isNativePlatform() && !apiOrigin) {
  // Native builds cannot rely on a same-origin proxy; VITE_API_ORIGIN must be
  // baked in at build time. Fail loudly instead of silently hitting a wrong host.
  console.error(
    "[api] VITE_API_ORIGIN is not set. Rebuild the web bundle with VITE_API_ORIGIN=https://<your-railway-domain> before running `npx cap sync ios`."
  );
}

const BASE = Capacitor.isNativePlatform() ? `${apiOrigin}/api` : "/api";

export function getUploadUrl(photoPath?: string): string | null {
  if (!photoPath) return null;
  const base = Capacitor.isNativePlatform() ? apiOrigin : "";
  return `${base}/uploads/${photoPath}`;
}

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
  const url = `${BASE}${path}`;
  const method = options?.method ?? "GET";
  const bodyPreview = typeof options?.body === "string" ? options.body : options?.body ? "[binary body]" : undefined;
  console.log(`[api] → ${method} ${url}`, bodyPreview ? { body: bodyPreview } : "");

  let res: Response;
  try {
    res = await fetch(url, {
      headers: authHeaders(),
      ...options,
    });
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(`[api] ✗ NETWORK FAIL ${method} ${url} — ${detail}`);
    throw new Error(`Network request failed: ${detail} (url=${url})`);
  }

  console.log(`[api] ← ${res.status} ${res.statusText} ${url}`);

  if (res.status === 401) {
    setToken(null);
    window.dispatchEvent(new Event("moveiq:logout"));
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = (body as Record<string, unknown>).error as string ?? `${res.status} ${res.statusText}`;
    console.error(`[api] ✗ ${method} ${url} → ${msg}`);
    throw new Error(msg);
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

  // Room visualization — scan persistence
  putRoomScan: (roomId: string, scan: RoomScanData) =>
    request<RoomScan>(`/rooms/${roomId}/scan`, { method: "PUT", body: JSON.stringify(scan) }),

  getRoomScan: async (roomId: string): Promise<RoomScan | null> => {
    try {
      return await request<RoomScan>(`/rooms/${roomId}/scan`);
    } catch (err) {
      // Server returns 404 when there's no scan yet; treat as null rather than an error.
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("404") || msg.toLowerCase().includes("no scan")) return null;
      throw err;
    }
  },

  updateItemPlacement: (itemId: string, placement: ItemPlacementInput) =>
    request<Item>(`/items/${itemId}/placement`, {
      method: "PUT",
      body: JSON.stringify(placement),
    }),

  getOrphanedItems: (roomId: string) =>
    request<OrphanedItem[]>(`/rooms/${roomId}/orphaned-items`),

  // Phase 16: edit a detected object's user-supplied label.
  //   pass null to clear the override and fall back to the detected label.
  updateRoomObject: (roomId: string, objectId: string, patch: { userLabel: string | null }) =>
    request<RoomScan>(`/rooms/${roomId}/object/${objectId}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    }),

  getPrioritizedItems: (projectId: string) =>
    request<PrioritizedItem[]>(`/items/prioritized?projectId=${encodeURIComponent(projectId)}`),

  applyItemAction: (
    itemId: string,
    action: ItemDecisionAction,
    opts: { soldPriceUsd?: number } = {}
  ) =>
    request<Item>(`/items/${itemId}/action`, {
      method: "POST",
      body: JSON.stringify(
        opts.soldPriceUsd !== undefined
          ? { action, soldPriceUsd: opts.soldPriceUsd }
          : { action }
      ),
    }),

  applyBulkItemAction: (itemIds: string[], action: ItemDecisionAction) =>
    request<{ updated: number; items: Item[] }>(`/items/bulk-action`, {
      method: "POST",
      body: JSON.stringify({ itemIds, action }),
    }),

  updateItemListing: (itemId: string, listingUrl: string | null) =>
    request<Item>(`/items/${itemId}/listing`, {
      method: "PUT",
      body: JSON.stringify({ listingUrl }),
    }),

  updateItemSoldPrice: (itemId: string, soldPriceUsd: number | null) =>
    request<Item>(`/items/${itemId}/sold-price`, {
      method: "PUT",
      body: JSON.stringify({ soldPriceUsd }),
    }),

  getCalibration: (projectId: string) =>
    request<CategoryCalibration[]>(`/calibration?projectId=${encodeURIComponent(projectId)}`),

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

  listItemPhotos: (id: string) =>
    request<Array<{ id: string; itemId: string; photoPath: string; isPrimary: boolean; createdAt: string }>>(`/items/${id}/photos`),

  addItemPhoto: (id: string, file: File) => {
    const form = new FormData();
    form.append("photo", file);
    const headers: Record<string, string> = {};
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
    return fetch(`${BASE}/items/${id}/photos`, { method: "POST", body: form, headers })
      .then(async res => {
        if (!res.ok) throw new Error("Upload failed");
        return res.json() as Promise<Item>;
      });
  },

  deleteItemPhotoById: (id: string, photoId: string) =>
    request<Item>(`/items/${id}/photos/${photoId}`, { method: "DELETE" }),

  setItemPrimaryPhoto: (id: string, photoId: string) =>
    request<Item>(`/items/${id}/photos/${photoId}/primary`, { method: "PUT" }),

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

  analyzeEbayPricing: (query: string, limit?: number) => {
    const params = new URLSearchParams({ q: query });
    if (limit) params.set("limit", String(limit));
    return request<EbayAnalysisResult>(`/ebay/analyze?${params.toString()}`);
  },

  getSellPriority: (params: {
    query: string;
    limit?: number;
    pcsDate?: string;
    packoutDate?: string;
    condition?: string;
    sizeClass?: string;
    userGoal?: string;
    weightLbs?: number;
    sentimentalFlag?: boolean;
    region?: string;
  }) =>
    request<SellPriorityResult>("/ebay/analyze/priority", {
      method: "POST",
      body: JSON.stringify(params),
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
