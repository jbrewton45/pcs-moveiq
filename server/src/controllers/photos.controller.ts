import type { Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { addItemPhoto, clearItemPhotos, getItemPhoto, getItemPhotos, removeItemPhoto, removeItemPhotoById, setItemPhoto, setPrimaryItemPhoto } from "../services/items.service.js";
import { getUploadsDir } from "../data/storage.js";

const UPLOADS_DIR = getUploadsDir();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, name);
  },
});

const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowed = [".jpg", ".jpeg", ".png", ".webp", ".heic"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Only image files (jpg, png, webp, heic) are allowed"));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

export async function uploadPhoto(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const oldPhotoPaths = await clearItemPhotos(id);
  for (const oldPhotoPath of oldPhotoPaths) {
    const oldFile = path.join(UPLOADS_DIR, oldPhotoPath);
    if (fs.existsSync(oldFile)) {
      fs.unlinkSync(oldFile);
    }
  }

  const item = await setItemPhoto(id, file.filename);
  if (!item) {
    fs.unlinkSync(file.path);
    return res.status(404).json({ error: "Item not found" });
  }

  return res.status(200).json(item);
}

export async function deletePhoto(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const photoPath = await getItemPhoto(id);
  if (!photoPath) {
    return res.status(404).json({ error: "No photo found for this item" });
  }

  const filePath = path.join(UPLOADS_DIR, photoPath);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  const item = await removeItemPhoto(id);
  if (!item) {
    return res.status(404).json({ error: "Item not found" });
  }

  return res.status(200).json(item);
}

export async function uploadAdditionalPhoto(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const file = req.file;
  if (!file) return res.status(400).json({ error: "No file uploaded" });
  const item = await addItemPhoto(id, file.filename);
  if (!item) {
    fs.unlink(file.path, () => {});
    return res.status(404).json({ error: "Item not found" });
  }
  return res.status(200).json(item);
}

export async function deleteAdditionalPhoto(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const photoId = Array.isArray(req.params.photoId) ? req.params.photoId[0] : req.params.photoId;
  const removed = await removeItemPhotoById(id, photoId);
  if (!removed) return res.status(404).json({ error: "Photo not found" });

  const filePath = path.join(UPLOADS_DIR, removed.removedPath);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  return res.status(200).json(removed.item);
}

export async function setAdditionalPhotoPrimary(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const photoId = Array.isArray(req.params.photoId) ? req.params.photoId[0] : req.params.photoId;
  const item = await setPrimaryItemPhoto(id, photoId);
  if (!item) return res.status(404).json({ error: "Photo not found" });
  return res.status(200).json(item);
}

export async function listPhotos(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const photos = await getItemPhotos(id);
  return res.status(200).json(photos);
}
