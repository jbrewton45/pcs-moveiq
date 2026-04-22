import { Router } from "express";
import { bulkDeleteItemsHandler, getItems, getPrioritizedHandler, postBulkItemActionHandler, postItem, postItemActionHandler, putItem, putItemListingHandler, putItemPlacementHandler, putItemSoldPriceHandler, removeItem, submitClarificationsHandler, parseVoice, parseVoicePhoto, batchIdentifyPrice } from "../controllers/items.controller.js";
import { deleteAdditionalPhoto, deletePhoto, listPhotos, setAdditionalPhotoPrimary, upload, uploadAdditionalPhoto, uploadPhoto } from "../controllers/photos.controller.js";
import { postIdentify, postConfirmIdentification, postPricing, getComparables, postCorrectAndReprice } from "../controllers/identification.controller.js";

export const itemsRouter = Router();

itemsRouter.get("/prioritized", getPrioritizedHandler);
itemsRouter.get("/", getItems);
itemsRouter.post("/bulk-update", (_req, res) => {
  res.status(410).json({
    error: "Endpoint retired. Use POST /items/bulk-action with an action in {sell,keep,ship,donate,sold,discarded,shipped}.",
  });
});
itemsRouter.post("/bulk-delete", bulkDeleteItemsHandler);
itemsRouter.post("/bulk-action", postBulkItemActionHandler);
itemsRouter.post("/batch-identify-price", batchIdentifyPrice);
itemsRouter.post("/parse-voice", parseVoice);
itemsRouter.post("/parse-voice-photo", upload.single("photo"), parseVoicePhoto);
itemsRouter.post("/", postItem);
itemsRouter.post("/:id/photo", upload.single("photo"), uploadPhoto);
itemsRouter.delete("/:id/photo", deletePhoto);
itemsRouter.get("/:id/photos", listPhotos);
itemsRouter.post("/:id/photos", upload.single("photo"), uploadAdditionalPhoto);
itemsRouter.delete("/:id/photos/:photoId", deleteAdditionalPhoto);
itemsRouter.put("/:id/photos/:photoId/primary", setAdditionalPhotoPrimary);
itemsRouter.post("/:id/identify", postIdentify);
itemsRouter.post("/:id/confirm-identification", postConfirmIdentification);
itemsRouter.post("/:id/correct-and-reprice", postCorrectAndReprice);
itemsRouter.post("/:id/pricing", postPricing);
itemsRouter.get("/:id/comparables", getComparables);
itemsRouter.post("/:id/clarifications", submitClarificationsHandler);
itemsRouter.post("/:id/action", postItemActionHandler);
itemsRouter.put("/:id/listing", putItemListingHandler);
itemsRouter.put("/:id/sold-price", putItemSoldPriceHandler);
itemsRouter.put("/:id/placement", putItemPlacementHandler);
itemsRouter.put("/:id", putItem);
itemsRouter.delete("/:id", removeItem);
