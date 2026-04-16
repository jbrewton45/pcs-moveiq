import type { Project, Room, Item } from "../types/domain.js";

interface Store {
  projects: Project[];
  rooms: Room[];
  items: Item[];
}

export const store: Store = {
  projects: [],
  rooms: [],
  items: [],
};
