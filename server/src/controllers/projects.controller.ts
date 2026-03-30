import type { Request, Response } from "express";
import { createProject, deleteProject, getProjectForUser, listProjects, updateProject } from "../services/projects.service.js";
import { getProjectSummary, getProjectWeightSummary, getPackingList, listItemsByProject } from "../services/items.service.js";
import { listRoomsByProject } from "../services/rooms.service.js";
import { CreateProjectSchema, UpdateProjectSchema } from "../validation/schemas.js";

export async function getProjects(req: Request, res: Response) {
  res.status(200).json(await listProjects(req.userId!));
}

export async function getProject(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const project = await getProjectForUser(id, req.userId!);
  if (!project) return res.status(404).json({ error: "Project not found" });
  return res.status(200).json(project);
}

export async function postProject(req: Request, res: Response) {
  const result = CreateProjectSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: "Validation failed", details: result.error.issues });
  }
  const project = await createProject({ ...result.data, userId: req.userId! });
  return res.status(201).json(project);
}

export async function getProjectItemSummary(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const project = await getProjectForUser(id, req.userId!);
  if (!project) return res.status(404).json({ error: "Project not found" });
  return res.status(200).json(await getProjectSummary(id));
}

export async function getProjectWeight(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const project = await getProjectForUser(id, req.userId!);
  if (!project) return res.status(404).json({ error: "Project not found" });
  return res.status(200).json(await getProjectWeightSummary(id));
}

export async function getProjectExport(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const project = await getProjectForUser(id, req.userId!);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const rooms = await listRoomsByProject(id);
  const packingList = await getPackingList(id);

  return res.status(200).json({
    project,
    rooms,
    packingList,
  });
}

export async function getProjectWorkspace(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const project = await getProjectForUser(id, req.userId!);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const [rooms, items, summary, weight] = await Promise.all([
    listRoomsByProject(id),
    listItemsByProject(id),
    getProjectSummary(id),
    getProjectWeightSummary(id),
  ]);

  return res.status(200).json({
    project,
    rooms,
    items,
    summary,
    weight,
  });
}

export async function putProject(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const result = UpdateProjectSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: "Validation failed", details: result.error.issues });
  const project = await updateProject(id, req.userId!, result.data);
  if (!project) return res.status(404).json({ error: "Project not found" });
  return res.status(200).json(project);
}

export async function removeProject(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const deleted = await deleteProject(id, req.userId!);
  if (!deleted) return res.status(404).json({ error: "Project not found" });
  return res.status(204).send();
}
