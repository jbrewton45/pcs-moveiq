import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../api";
import type { SizeClass } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DashboardItemStatus =
  | "pending" | "analyzing" | "analyzed" | "failed" | "sold"
  | "identifying" | "needs_confirmation";

export interface PhotoIdentification {
  suggestedName: string;
  category: string;
  condition: string;
  sizeClass: string;
  confidence: number;
  notes: string;
}

export interface DashboardItem {
  id: string;
  query: string;
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
  // Photo intake fields
  photoDataUrl?: string;        // base64 data URL for thumbnail display
  identification?: PhotoIdentification;
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

      // Remove the processed ID from the queue
      const idx = queueRef.current.indexOf(itemId);
      if (idx !== -1) queueRef.current.splice(idx, 1);
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
  const addItem = useCallback((query: string, opts?: { sizeClass?: SizeClass; condition?: string; weightLbs?: number; notes?: string }) => {
    const item: DashboardItem = {
      id: crypto.randomUUID(),
      query: query.trim(),
      sizeClass: opts?.sizeClass,
      condition: opts?.condition,
      weightLbs: opts?.weightLbs,
      notes: opts?.notes,
      status: "pending",
      priority: null,
      error: null,
      analyzedAt: null,
      addedAt: new Date().toISOString(),
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
        status: "pending" as const,
        priority: null,
        error: null,
        analyzedAt: null,
        addedAt: new Date().toISOString(),
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

  /** Add an item from a photo — starts identification immediately */
  const addPhotoItem = useCallback(async (file: File): Promise<string> => {
    let dataUrl: string;
    try {
      dataUrl = await compressToThumbnail(file);
    } catch {
      dataUrl = ""; // proceed without thumbnail if compression fails
    }

    const itemId = crypto.randomUUID();
    const item: DashboardItem = {
      id: itemId,
      query: "",
      status: "identifying",
      priority: null,
      error: null,
      analyzedAt: null,
      addedAt: new Date().toISOString(),
      photoDataUrl: dataUrl,
    };
    setItems(prev => [...prev, item]);

    // Call vision API (reuse parseVoiceWithPhoto with empty transcript)
    try {
      const result = await api.parseVoiceWithPhoto("", file);
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
                confidence: 0, // parseVoiceWithPhoto doesn't return confidence; 0 = unknown
                notes: result.notes,
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
  }, []);

  /** Confirm photo identification and proceed to pricing */
  const confirmIdentity = useCallback((id: string, confirmedName?: string) => {
    setItems(prev => {
      const item = prev.find(it => it.id === id);
      if (!item || item.status !== "needs_confirmation" || !item.identification) return prev;

      const name = confirmedName?.trim() || item.identification.suggestedName;
      return prev.map(it =>
        it.id === id
          ? {
              ...it,
              query: name,
              sizeClass: (item.identification!.sizeClass as SizeClass) || undefined,
              condition: item.identification!.condition || undefined,
              status: "pending" as const,
            }
          : it
      );
    });
    enqueue([id]);
  }, [enqueue]);

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
    addPhotoItem,
    confirmIdentity,
  };
}
