import type { Request, Response, NextFunction } from "express";
import { verifyToken, getUserById } from "../services/auth.service.js";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const token = header.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const user = await getUserById(payload.userId);
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  req.userId = payload.userId;
  next();
}
