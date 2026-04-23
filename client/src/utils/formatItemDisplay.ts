import type { Item } from "../types";

export const WEAK_NAME_LITERAL = "Scanned Item";
export const WEAK_CATEGORY_LITERAL = "Uncategorized";

export const WEAK_NAME_DISPLAY = "Unidentified item";
export const WEAK_CATEGORY_DISPLAY = "Uncategorized";

export interface ItemDisplay {
  displayName: string;
  displayCategory: string;
  isWeakName: boolean;
  isWeakCategory: boolean;
  isWeak: boolean;
}

type ItemLike = Pick<Item, "itemName" | "category" | "identifiedName" | "identifiedCategory">;

function isWeakNameValue(value: string | null | undefined): boolean {
  if (value == null) return true;
  const trimmed = value.trim();
  return trimmed.length === 0 || trimmed === WEAK_NAME_LITERAL;
}

function isWeakCategoryValue(value: string | null | undefined): boolean {
  if (value == null) return true;
  const trimmed = value.trim();
  return trimmed.length === 0 || trimmed === WEAK_CATEGORY_LITERAL;
}

export function formatItemDisplay(item: ItemLike): ItemDisplay {
  const isWeakName = isWeakNameValue(item.itemName);
  const isWeakCategory = isWeakCategoryValue(item.category);

  const identifiedNameUsable =
    item.identifiedName != null && !isWeakNameValue(item.identifiedName);
  const identifiedCategoryUsable =
    item.identifiedCategory != null && !isWeakCategoryValue(item.identifiedCategory);

  const displayName = isWeakName
    ? identifiedNameUsable
      ? (item.identifiedName as string)
      : WEAK_NAME_DISPLAY
    : item.itemName;

  const displayCategory = isWeakCategory
    ? identifiedCategoryUsable
      ? (item.identifiedCategory as string)
      : WEAK_CATEGORY_DISPLAY
    : item.category;

  return {
    displayName,
    displayCategory,
    isWeakName,
    isWeakCategory,
    isWeak: isWeakName || isWeakCategory,
  };
}

export function countWeakItems<T extends ItemLike>(items: readonly T[]): number {
  let n = 0;
  for (const it of items) {
    if (isWeakNameValue(it.itemName) || isWeakCategoryValue(it.category)) n += 1;
  }
  return n;
}

export function formatItemCountLabel(total: number, weakCount: number): string {
  const noun = total === 1 ? "item" : "items";
  if (weakCount <= 0) return `${total} ${noun}`;
  return `${total} ${noun} (${weakCount} unidentified)`;
}
