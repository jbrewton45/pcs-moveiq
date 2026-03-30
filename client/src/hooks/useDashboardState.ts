import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../api";
import type { SizeClass } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Unified item model — single canonical shape for ALL intake methods
// ---------------------------------------------------------------------------

export type InputMethod = "manual" | "voice" | "photo" | "walkthrough";

export type DashboardItemStatus =
  | "identifying"          // AI vision running
  | "needs_confirmation"   // AI result ready, user must confirm
  | "pending"              // confirmed, queued for pricing
  | "analyzing"            // pricing in progress
  | "analyzed"             // fully priced with urgency/channels
  | "failed"               // error during identification or pricing
  | "sold";                // user marked as sold

export interface DetectedAccessory {
  name: string;
  included: boolean;       // user-confirmed inclusion
}

export interface ItemIdentification {
  suggestedName: string;
  category: string;
  condition: string;
  sizeClass: string;
  notes: string;
  accessories: DetectedAccessory[];
}

export interface DashboardItem {
  id: string;
  query: string;                    // confirmed item name used for pricing
  inputMethod: InputMethod;
  sizeClass?: SizeClass;
  condition?: string;
  weightLbs?: number;
  notes?: string;
  status: DashboardItemStatus;
  priority: import("../types").SellPriorityResult | null;
  error: string | null;
  analyzedAt: string | null;
  addedAt: string;
  soldAt?: string;
  soldPrice?: number;
  // Photo fields
  photos: string[];                 // array of compressed thumbnail data URLs
  // Identification fields
  identification?: ItemIdentification;
  confirmedIdentity?: boolean;
  // Voice transcript (if applicable)
  transcript?: string;
}

export interface PcsContext {
  pcsDate: string;
  userGoal: string;
  region?: string; // "guam" | "hawaii" | "alaska" | "oconus" | undefined (CONUS default)
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

const ITEMS_KEY = "moveiq_dashboard_items";
const PCS_KEY = "moveiq_dashboard_pcs";

function loadItems(): DashboardItem[] {
  try {
    const raw = localStorage.getItem(ITEMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveItems(items: DashboardItem[]) {
  try {
    localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
  } catch {
    console.warn("[Dashboard] localStorage quota exceeded — data may not persist across refreshes");
  }
}

function loadPcs(): PcsContext {
  try {
    const raw = localStorage.getItem(PCS_KEY);
    return raw ? JSON.parse(raw) : { pcsDate: "", userGoal: "" };
  } catch { return { pcsDate: "", userGoal: "" }; }
}

function savePcs(ctx: PcsContext) {
  localStorage.setItem(PCS_KEY, JSON.stringify(ctx));
}

/** Parse accessory mentions from notes string into DetectedAccessory[] */
function parseAccessories(notes: string): DetectedAccessory[] {
  if (!notes) return [];
  const accessoryPatterns = /(?:with|includes?|comes with|has|plus)\s+([^,;.]+)/gi;
  const accessories: DetectedAccessory[] = [];
  let match;
  while ((match = accessoryPatterns.exec(notes)) !== null) {
    const name = match[1].trim();
    if (name.length > 2 && name.length < 60) {
      accessories.push({ name, included: true });
    }
  }
  return accessories;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDashboardState() {
  const [items, setItems] = useState<DashboardItem[]>(loadItems);
  const [pcsContext, setPcsContext] = useState<PcsContext>(loadPcs);
  const [isProcessing, setIsProcessing] = useState(false);
  const queueRef = useRef<string[]>([]);
  const processingRef = useRef(false);

  // Refs mirroring latest state — safe to read from async code
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);
  const pcsRef = useRef(pcsContext);
  useEffect(() => { pcsRef.current = pcsContext; }, [pcsContext]);

  // Persist on change
  useEffect(() => { saveItems(items); }, [items]);
  useEffect(() => { savePcs(pcsContext); }, [pcsContext]);

  // --- Queue processor ---
  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setIsProcessing(true);

    while (queueRef.current.length > 0) {
      const itemId = queueRef.current[0];

      // Read latest state from refs
      const currentItem = itemsRef.current.find(it => it.id === itemId);
      const currentCtx = pcsRef.current;

      // Skip if item was deleted, is in photo pipeline, or otherwise not ready
      if (!currentItem || currentItem.status === "identifying" || currentItem.status === "needs_confirmation") {
        queueRef.current.shift();
        continue;
      }

      // Mark analyzing
      setItems(prev => prev.map(it =>
        it.id === itemId ? { ...it, status: "analyzing" as const, error: null } : it
      ));

      try {
        const result = await api.getSellPriority({
          query: currentItem.query,
          pcsDate: currentCtx.pcsDate || undefined,
          userGoal: currentCtx.userGoal || undefined,
          sizeClass: currentItem.sizeClass || undefined,
          condition: currentItem.condition || undefined,
          weightLbs: currentItem.weightLbs,
          region: currentCtx.region || undefined,
        });

        // Only update if item still exists (wasn't deleted during await)
        setItems(prev => prev.map(it =>
          it.id === itemId
            ? { ...it, status: "analyzed" as const, priority: result, analyzedAt: new Date().toISOString() }
            : it
        ));
      } catch (err) {
        setItems(prev => prev.map(it =>
          it.id === itemId
            ? { ...it, status: "failed" as const, error: err instanceof Error ? err.message : "Analysis failed" }
            : it
        ));
      }

      // Remove the processed ID from the front of the queue
      queueRef.current.shift();
    }

    processingRef.current = false;
    setIsProcessing(false);
  }, []);

  const enqueue = useCallback((ids: string[]) => {
    const newIds = ids.filter(id => !queueRef.current.includes(id));
    queueRef.current.push(...newIds);
    void processQueue();
  }, [processQueue]);

  // --- CRUD ---
  // --- Unified item creation ---

  const addItem = useCallback((query: string, opts?: {
    sizeClass?: SizeClass; condition?: string; weightLbs?: number; notes?: string;
    inputMethod?: InputMethod; transcript?: string;
  }) => {
    const item: DashboardItem = {
      id: crypto.randomUUID(),
      query: query.trim(),
      inputMethod: opts?.inputMethod ?? "manual",
      sizeClass: opts?.sizeClass,
      condition: opts?.condition,
      weightLbs: opts?.weightLbs,
      notes: opts?.notes,
      status: "pending",
      priority: null,
      error: null,
      analyzedAt: null,
      addedAt: new Date().toISOString(),
      photos: [],
      transcript: opts?.transcript,
    };
    setItems(prev => [...prev, item]);
    enqueue([item.id]);
    return item.id;
  }, [enqueue]);

  const addMultiple = useCallback((queries: string[]) => {
    const newItems: DashboardItem[] = queries
      .map(q => q.trim())
      .filter(q => q.length > 0)
      .map(query => ({
        id: crypto.randomUUID(),
        query,
        inputMethod: "manual" as const,
        status: "pending" as const,
        priority: null,
        error: null,
        analyzedAt: null,
        addedAt: new Date().toISOString(),
        photos: [],
      }));
    setItems(prev => [...prev, ...newItems]);
    enqueue(newItems.map(it => it.id));
  }, [enqueue]);

  const removeItem = useCallback((id: string) => {
    queueRef.current = queueRef.current.filter(qid => qid !== id);
    setItems(prev => prev.filter(it => it.id !== id));
  }, []);

  const reanalyzeItem = useCallback((id: string) => {
    setItems(prev => prev.map(it =>
      it.id === id ? { ...it, status: "pending" as const, priority: null, error: null } : it
    ));
    enqueue([id]);
  }, [enqueue]);

  const reanalyzeAll = useCallback(() => {
    setItems(prev => {
      const reset = prev.map(it =>
        it.status === "analyzing" || it.status === "sold" || it.status === "identifying" || it.status === "needs_confirmation"
          ? it // don't reset in-flight, sold, or photo-pipeline items
          : { ...it, status: "pending" as const, priority: null, error: null }
      );
      const toEnqueue = reset.filter(it => it.status === "pending").map(it => it.id);
      enqueue(toEnqueue);
      return reset;
    });
  }, [enqueue]);

  const clearAll = useCallback(() => {
    queueRef.current = [];
    setItems([]);
  }, []);

  const updatePcsContext = useCallback((ctx: Partial<PcsContext>) => {
    setPcsContext(prev => ({ ...prev, ...ctx }));
  }, []);

  const markAsSold = useCallback((id: string, soldPrice?: number) => {
    setItems(prev => prev.map(it =>
      it.id === id
        ? { ...it, status: "sold" as const, soldAt: new Date().toISOString(), soldPrice }
        : it
    ));
  }, []);

  const undoSold = useCallback((id: string) => {
    setItems(prev => prev.map(it =>
      it.id === id && it.status === "sold"
        ? { ...it, status: "analyzed" as const, soldAt: undefined, soldPrice: undefined }
        : it
    ));
  }, []);

  /** Compress an image to a small thumbnail data URL for localStorage */
  const compressToThumbnail = useCallback(async (file: File): Promise<string> => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Failed to read image file"));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Failed to decode image"));
        img.onload = () => {
          const MAX = 120;
          let w = img.width, h = img.height;
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.6));
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });
  }, []);

  /** Add item from photo — creates draft, runs identification, awaits confirmation */
  const addPhotoItem = useCallback(async (file: File): Promise<string> => {
    let thumbnail = "";
    try { thumbnail = await compressToThumbnail(file); } catch { /* proceed without */ }

    const itemId = crypto.randomUUID();
    const item: DashboardItem = {
      id: itemId,
      query: "",
      inputMethod: "photo",
      status: "identifying",
      priority: null,
      error: null,
      analyzedAt: null,
      addedAt: new Date().toISOString(),
      photos: thumbnail ? [thumbnail] : [],
    };
    setItems(prev => [...prev, item]);

    try {
      const result = await api.parseVoiceWithPhoto("", file);
      const accessories = parseAccessories(result.notes);
      setItems(prev => prev.map(it =>
        it.id === itemId
          ? {
              ...it,
              status: "needs_confirmation" as const,
              query: result.itemName,
              identification: {
                suggestedName: result.itemName,
                category: result.category,
                condition: result.condition,
                sizeClass: result.sizeClass,
                notes: result.notes,
                accessories,
              },
            }
          : it
      ));
    } catch (err) {
      setItems(prev => prev.map(it =>
        it.id === itemId
          ? { ...it, status: "failed" as const, error: err instanceof Error ? err.message : "Identification failed" }
          : it
      ));
    }

    return itemId;
  }, [compressToThumbnail]);

  /** Confirm identification and proceed to pricing pipeline.
   *  Builds a bundle-aware query from core item + confirmed accessories. */
  const confirmIdentity = useCallback((id: string, opts?: {
    confirmedName?: string;
    accessories?: DetectedAccessory[];
    condition?: string;
  }) => {
    setItems(prev => {
      const item = prev.find(it => it.id === id);
      if (!item || item.status !== "needs_confirmation" || !item.identification) return prev;

      const coreName = opts?.confirmedName?.trim() || item.identification.suggestedName;
      const accessories = opts?.accessories ?? item.identification.accessories;
      const condition = opts?.condition || item.identification.condition;

      // Build bundle-aware query: "Sony A7R III with 28-70mm lens, battery grip"
      const includedAccessories = accessories.filter(a => a.included);
      const accessoryStr = includedAccessories.map(a => a.name).join(", ");
      const query = accessoryStr
        ? `${coreName} with ${accessoryStr}`
        : coreName;

      return prev.map(it =>
        it.id === id
          ? {
              ...it,
              query,
              sizeClass: (item.identification!.sizeClass as SizeClass) || undefined,
              condition: condition || undefined,
              notes: item.identification!.notes || undefined,
              identification: { ...item.identification!, accessories },
              confirmedIdentity: true,
              status: "pending" as const,
            }
          : it
      );
    });
    enqueue([id]);
  }, [enqueue]);

  /** Add an additional photo to an existing item (improves identification) */
  const addPhotoToItem = useCallback(async (id: string, file: File) => {
    let thumbnail = "";
    try { thumbnail = await compressToThumbnail(file); } catch { /* proceed without */ }

    // Append thumbnail and check status atomically via updater
    let shouldReIdentify = false;
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it;
      if (it.status === "needs_confirmation") shouldReIdentify = true;
      return thumbnail ? { ...it, photos: [...it.photos, thumbnail] } : it;
    }));

    // Re-run identification if item was awaiting confirmation
    if (shouldReIdentify) {
      setItems(prev => prev.map(it =>
        it.id === id ? { ...it, status: "identifying" as const } : it
      ));
      try {
        const result = await api.parseVoiceWithPhoto("", file);
        const accessories = parseAccessories(result.notes);
        setItems(prev => prev.map(it =>
          it.id === id
            ? {
                ...it,
                status: "needs_confirmation" as const,
                query: result.itemName,
                identification: {
                  suggestedName: result.itemName,
                  category: result.category,
                  condition: result.condition,
                  sizeClass: result.sizeClass,
                  notes: result.notes,
                  accessories,
                },
              }
            : it
        ));
      } catch (err) {
        setItems(prev => prev.map(it =>
          it.id === id
            ? { ...it, status: "needs_confirmation" as const, error: err instanceof Error ? err.message : "Re-identification failed" }
            : it
        ));
      }
    }
  }, [compressToThumbnail]);

  /** Update any editable fields on an item */
  const updateItem = useCallback((id: string, updates: Partial<Pick<DashboardItem, "query" | "sizeClass" | "condition" | "weightLbs" | "notes">>) => {
    setItems(prev => prev.map(it =>
      it.id === id ? { ...it, ...updates } : it
    ));
  }, []);

  const editSoldPrice = useCallback((id: string, soldPrice: number | undefined) => {
    setItems(prev => prev.map(it =>
      it.id === id && it.status === "sold"
        ? { ...it, soldPrice }
        : it
    ));
  }, []);

  /** Replace entire dashboard state (for session import) */
  const replaceAll = useCallback((newItems: DashboardItem[], newCtx: PcsContext) => {
    queueRef.current = [];
    setItems(newItems);
    setPcsContext(newCtx);
    // Auto-enqueue any imported items that were pending
    const pendingIds = newItems.filter(it => it.status === "pending").map(it => it.id);
    if (pendingIds.length > 0) enqueue(pendingIds);
  }, [enqueue]);

  return {
    items,
    pcsContext,
    isProcessing,
    addItem,
    addMultiple,
    removeItem,
    reanalyzeItem,
    reanalyzeAll,
    clearAll,
    updatePcsContext,
    replaceAll,
    markAsSold,
    undoSold,
    editSoldPrice,
    updateItem,
    addPhotoItem,
    addPhotoToItem,
    confirmIdentity,
  };
}
