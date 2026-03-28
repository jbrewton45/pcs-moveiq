import { Router } from "express";
import { getProject, getProjectExport, getProjectItemSummary, getProjectWeight, getProjects, postProject, putProject, removeProject } from "../controllers/projects.controller.js";

export const projectsRouter = Router();

projectsRouter.get("/", getProjects);
projectsRouter.post("/", postProject);
projectsRouter.get("/:id/summary", getProjectItemSummary);
projectsRouter.get("/:id/export", getProjectExport);
projectsRouter.get("/:id/weight", getProjectWeight);
projectsRouter.get("/:id", getProject);
projectsRouter.put("/:id", putProject);
projectsRouter.delete("/:id", removeProject);
