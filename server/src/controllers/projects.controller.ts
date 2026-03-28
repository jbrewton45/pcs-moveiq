import type { Request, Response } from "express";
import { createProject, deleteProject, getProjectById, listProjects, updateProject } from "../services/projects.service.js";
import { getPackingList, getProjectSummary, getProjectWeightSummary } from "../services/items.service.js";
import { listRoomsByProject } from "../services/rooms.service.js";
import { CreateProjectSchema, UpdateProjectSchema } from "../validation/schemas.js";

export function getProjects(_req: Request, res: Response) {
  res.status(200).json(listProjects());
}

export function getProject(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const project = getProjectById(id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  return res.status(200).json(project);
}

export function postProject(req: Request, res: Response) {
  const result = CreateProjectSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: "Validation failed", details: result.error.issues });
  }
  const project = createProject(result.data);
  return res.status(201).json(project);
}

export function getProjectItemSummary(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const project = getProjectById(id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  return res.status(200).json(getProjectSummary(id));
}

export function getProjectWeight(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const project = getProjectById(id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  return res.status(200).json(getProjectWeightSummary(id));
}

export function getProjectExport(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const project = getProjectById(id);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const rooms = listRoomsByProject(id);
  const packingList = getPackingList(id);

  return res.status(200).json({
    project,
    rooms,
    packingList,
  });
}

export function putProject(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const result = UpdateProjectSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: "Validation failed", details: result.error.issues });
  const project = updateProject(id, result.data);
  if (!project) return res.status(404).json({ error: "Project not found" });
  return res.status(200).json(project);
}

export function removeProject(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const deleted = deleteProject(id);
  if (!deleted) return res.status(404).json({ error: "Project not found" });
  return res.status(204).send();
}
