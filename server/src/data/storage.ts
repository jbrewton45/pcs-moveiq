import path from "path";
import fs from "fs";

const DEFAULT_UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

function resolveUploadsDir(): string {
  const configured = process.env.UPLOADS_DIR?.trim();
  if (configured && configured.length > 0) {
    return path.isAbsolute(configured) ? configured : path.resolve(configured);
  }
  return DEFAULT_UPLOADS_DIR;
}

const UPLOADS_DIR = resolveUploadsDir();

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export function getUploadsDir(): string {
  return UPLOADS_DIR;
}
