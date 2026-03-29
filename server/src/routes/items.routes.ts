import { Router } from "express";
import { bulkDeleteItemsHandler, bulkUpdateItemStatus, getItems, postItem, putItem, removeItem, submitClarifications } from "../controllers/items.controller.js";
import { upload, uploadPhoto, deletePhoto } from "../controllers/photos.controller.js";
import { postIdentify, postConfirmIdentification, postPricing, getComparables } from "../controllers/identification.controller.js";

export const itemsRouter = Router();

itemsRouter.get("/", getItems);
itemsRouter.post("/bulk-update", bulkUpdateItemStatus);
itemsRouter.post("/bulk-delete", bulkDeleteItemsHandler);
itemsRouter.post("/", postItem);
itemsRouter.post("/:id/photo", upload.single("photo"), uploadPhoto);
itemsRouter.delete("/:id/photo", deletePhoto);
itemsRouter.post("/:id/identify", postIdentify);
itemsRouter.post("/:id/confirm-identification", postConfirmIdentification);
itemsRouter.post("/:id/pricing", postPricing);
itemsRouter.get("/:id/comparables", getComparables);
itemsRouter.post("/:id/clarifications", submitClarifications);
itemsRouter.put("/:id", putItem);
itemsRouter.delete("/:id", removeItem);
