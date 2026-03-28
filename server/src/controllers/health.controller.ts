import type { Request, Response } from "express";

export function getHealth(_req: Request, res: Response) {
  res.status(200).json({
    ok: true,
    service: "pcs-moveiq-server",
    timestamp: new Date().toISOString()
  });
}