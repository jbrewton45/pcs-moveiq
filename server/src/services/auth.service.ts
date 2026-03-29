import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../data/database.js";
import type { User, UserPublic } from "../types/domain.js";
import { createId } from "../utils/id.js";

const JWT_SECRET = process.env.JWT_SECRET || "moveiq-dev-secret-change-in-production";
const JWT_EXPIRES_IN = "7d";

function rowToUser(row: Record<string, unknown>): User {
  return {
    ...row,
    branchOfService: (row.branchOfService as string | null) ?? undefined,
    dutyStation: (row.dutyStation as string | null) ?? undefined,
    preferredMarketplace: (row.preferredMarketplace as string | null) ?? undefined,
    lastLoginAt: (row.lastLoginAt as string | null) ?? undefined,
  } as User;
}

export function toPublic(user: User): UserPublic {
  const { passwordHash: _, ...pub } = user;
  return pub;
}

export async function signup(email: string, password: string, displayName: string): Promise<{ user: UserPublic; token: string }> {
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) throw new Error("Email already registered");

  const passwordHash = await bcrypt.hash(password, 12);
  const now = new Date().toISOString();
  const id = createId("user");

  db.prepare(`
    INSERT INTO users (id, email, passwordHash, displayName, createdAt, updatedAt, lastLoginAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, email.toLowerCase().trim(), passwordHash, displayName.trim(), now, now, now);

  const user = getUserById(id)!;
  const token = generateToken(user.id);
  return { user: toPublic(user), token };
}

export async function login(email: string, password: string): Promise<{ user: UserPublic; token: string }> {
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase().trim());
  if (!row) throw new Error("Invalid email or password");

  const user = rowToUser(row as Record<string, unknown>);
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new Error("Invalid email or password");

  const now = new Date().toISOString();
  db.prepare("UPDATE users SET lastLoginAt = ? WHERE id = ?").run(now, user.id);

  const token = generateToken(user.id);
  return { user: toPublic({ ...user, lastLoginAt: now }), token };
}

export function getUserById(id: string): User | undefined {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  return row ? rowToUser(row as Record<string, unknown>) : undefined;
}

export function updateUser(id: string, data: {
  displayName?: string;
  branchOfService?: string | null;
  dutyStation?: string | null;
  preferredMarketplace?: string | null;
}): UserPublic | null {
  const user = getUserById(id);
  if (!user) return null;

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE users SET
      displayName = COALESCE(?, displayName),
      branchOfService = ?,
      dutyStation = ?,
      preferredMarketplace = ?,
      updatedAt = ?
    WHERE id = ?
  `).run(
    data.displayName ?? user.displayName,
    data.branchOfService !== undefined ? data.branchOfService : user.branchOfService ?? null,
    data.dutyStation !== undefined ? data.dutyStation : user.dutyStation ?? null,
    data.preferredMarketplace !== undefined ? data.preferredMarketplace : user.preferredMarketplace ?? null,
    now, id,
  );

  return toPublic(getUserById(id)!);
}

function generateToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
    return payload;
  } catch {
    return null;
  }
}
