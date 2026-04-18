const locks = new Map<string, Promise<void>>();

export class ItemBusyError extends Error {
  constructor(itemId: string) {
    super(`Item ${itemId} is busy`);
    this.name = "ItemBusyError";
  }
}

export async function withItemLock<T>(itemId: string, fn: () => Promise<T>): Promise<T> {
  if (locks.has(itemId)) throw new ItemBusyError(itemId);
  let release!: () => void;
  const p = new Promise<void>((res) => { release = res; });
  locks.set(itemId, p);
  try {
    return await fn();
  } finally {
    locks.delete(itemId);
    release();
  }
}
