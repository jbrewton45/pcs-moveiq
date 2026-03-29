import type { Request, Response } from "express";
import { signup, login, getUserById, updateUser, toPublic } from "../services/auth.service.js";

export async function postSignup(req: Request, res: Response): Promise<void> {
  const { email, password, displayName } = req.body ?? {};

  if (!email || !password || !displayName) {
    res.status(400).json({ error: "email, password, and displayName are required" });
    return;
  }
  if (typeof password !== "string" || password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  try {
    const result = await signup(email, password, displayName);
    res.status(201).json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Signup failed";
    res.status(409).json({ error: msg });
  }
}

export async function postLogin(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  try {
    const result = await login(email, password);
    res.status(200).json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Login failed";
    res.status(401).json({ error: msg });
  }
}

export async function getMe(req: Request, res: Response): Promise<void> {
  const user = await getUserById(req.userId!);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(toPublic(user));
}

export async function putMe(req: Request, res: Response): Promise<void> {
  const updated = await updateUser(req.userId!, req.body);
  if (!updated) { res.status(404).json({ error: "User not found" }); return; }
  res.json(updated);
}
