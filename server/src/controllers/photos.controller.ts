import type { Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { setItemPhoto, removeItemPhoto, getItemPhoto } from "../services/items.service.js";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

export function uploadPhoto(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  // Delete old photo file if exists
  const oldPhotoPath = getItemPhoto(id);
  if (oldPhotoPath) {
    const oldFile = path.join(UPLOADS_DIR, oldPhotoPath);
    if (fs.existsSync(oldFile)) {
      fs.unlinkSync(oldFile);
    }
  }

  const item = setItemPhoto(id, file.filename);
  if (!item) {
    // Item not found — clean up uploaded file
    fs.unlinkSync(file.path);
    return res.status(404).json({ error: "Item not found" });
  }

  return res.status(200).json(item);
}

export function deletePhoto(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const photoPath = getItemPhoto(id);
  if (!photoPath) {
    return res.status(404).json({ error: "No photo found for this item" });
  }

  // Delete file from filesystem
  const filePath = path.join(UPLOADS_DIR, photoPath);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  const item = removeItemPhoto(id);
  if (!item) {
    return res.status(404).json({ error: "Item not found" });
  }

  return res.status(200).json(item);
}
