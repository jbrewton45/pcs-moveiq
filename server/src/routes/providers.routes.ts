import { Router } from "express";
import { getProviderStatus, testClaude, testEbay } from "../controllers/providers.controller.js";

export const providersRouter = Router();

providersRouter.get("/status", getProviderStatus);
providersRouter.post("/test/claude", testClaude);
providersRouter.post("/test/ebay", testEbay);
