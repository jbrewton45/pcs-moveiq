import { Router } from "express";
import { getRooms, postRoom, putRoom, removeRoom } from "../controllers/rooms.controller.js";

export const roomsRouter = Router();

roomsRouter.get("/", getRooms);
roomsRouter.post("/", postRoom);
roomsRouter.put("/:id", putRoom);
roomsRouter.delete("/:id", removeRoom);
