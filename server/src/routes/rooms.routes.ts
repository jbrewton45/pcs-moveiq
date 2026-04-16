import { Router } from "express";
import { getRooms, postRoom, putRoom, removeRoom } from "../controllers/rooms.controller.js";
import { getRoomScanHandler, putRoomScanHandler, getOrphanedItemsHandler, putRoomObjectHandler } from "../controllers/room-scans.controller.js";

export const roomsRouter = Router();

roomsRouter.get("/", getRooms);
roomsRouter.post("/", postRoom);
roomsRouter.put("/:id", putRoom);
roomsRouter.delete("/:id", removeRoom);

// Room visualization — scan persistence
roomsRouter.get("/:id/scan", getRoomScanHandler);
roomsRouter.put("/:id/scan", putRoomScanHandler);
roomsRouter.get("/:id/orphaned-items", getOrphanedItemsHandler);

// Phase 16: edit a single scanned object's user-supplied label.
roomsRouter.put("/:id/object/:objectId", putRoomObjectHandler);
