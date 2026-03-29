import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { query } from "../data/database.js";
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
  const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
  if (existing.rows.length > 0) throw new Error("Email already registered");

  const passwordHash = await bcrypt.hash(password, 12);
  const now = new Date().toISOString();
  const id = createId("user");

  await query(
    `INSERT INTO users (id, email, "passwordHash", "displayName", "createdAt", "updatedAt", "lastLoginAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, email.toLowerCase().trim(), passwordHash, displayName.trim(), now, now, now]
  );

  const user = await getUserById(id);
  const token = generateToken(user!.id);
  return { user: toPublic(user!), token };
}

export async function login(email: string, password: string): Promise<{ user: UserPublic; token: string }> {
  const result = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
  if (result.rows.length === 0) throw new Error("Invalid email or password");

  const user = rowToUser(result.rows[0] as Record<string, unknown>);
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new Error("Invalid email or password");

  const now = new Date().toISOString();
  await query('UPDATE users SET "lastLoginAt" = $1 WHERE id = $2', [now, user.id]);

  const token = generateToken(user.id);
  return { user: toPublic({ ...user, lastLoginAt: now }), token };
}

export async function getUserById(id: string): Promise<User | undefined> {
  const result = await query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows.length > 0 ? rowToUser(result.rows[0] as Record<string, unknown>) : undefined;
}

export async function updateUser(id: string, data: {
  displayName?: string;
  branchOfService?: string | null;
  dutyStation?: string | null;
  preferredMarketplace?: string | null;
}): Promise<UserPublic | null> {
  const user = await getUserById(id);
  if (!user) return null;

  const now = new Date().toISOString();
  await query(
    `UPDATE users SET
      "displayName" = COALESCE($1, "displayName"),
      "branchOfService" = $2,
      "dutyStation" = $3,
      "preferredMarketplace" = $4,
      "updatedAt" = $5
    WHERE id = $6`,
    [
      data.displayName ?? user.displayName,
      data.branchOfService !== undefined ? data.branchOfService : user.branchOfService ?? null,
      data.dutyStation !== undefined ? data.dutyStation : user.dutyStation ?? null,
      data.preferredMarketplace !== undefined ? data.preferredMarketplace : user.preferredMarketplace ?? null,
      now, id,
    ]
  );

  return toPublic((await getUserById(id))!);
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
