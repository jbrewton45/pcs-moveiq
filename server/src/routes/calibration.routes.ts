import { Router } from "express";
import { getCalibrationHandler } from "../controllers/calibration.controller.js";

export const calibrationRouter = Router();

calibrationRouter.get("/", getCalibrationHandler);
