import type { Request, Response } from "express";
import { createRoom, deleteRoom, listRoomsByProject, updateRoom } from "../services/rooms.service.js";
import { getProjectById } from "../services/projects.service.js";
import { CreateRoomSchema, UpdateRoomSchema } from "../validation/schemas.js";

export async function getRooms(req: Request, res: Response) {
  const projectId = req.query.projectId as string;

  if (!projectId) {
    return res.status(400).json({ error: "projectId is required" });
  }

  return res.status(200).json(await listRoomsByProject(projectId));
}

export async function postRoom(req: Request, res: Response) {
  const result = CreateRoomSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: "Validation failed", details: result.error.issues });
  }
  if (!(await getProjectById(result.data.projectId))) {
    return res.status(404).json({ error: "Project not found" });
  }
  const room = await createRoom(result.data);
  return res.status(201).json(room);
}

export async function putRoom(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const result = UpdateRoomSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: "Validation failed", details: result.error.issues });
  const room = await updateRoom(id, result.data);
  if (!room) return res.status(404).json({ error: "Room not found" });
  return res.status(200).json(room);
}

export async function removeRoom(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const deleted = await deleteRoom(id);
  if (!deleted) return res.status(404).json({ error: "Room not found" });
  return res.status(204).send();
}
