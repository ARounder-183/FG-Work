import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

function getJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV !== "production") return "dev-only-jwt-secret";

  throw new Error("JWT_SECRET is required in production");
}

const AUTH_USER_SELECT = {
  id: true,
  username: true,
  avatar: true,
  bio: true,
  role: true,
  createdAt: true,
  lastSeenAt: true,
} as const;

export type AuthUser = Awaited<ReturnType<typeof getCurrentUser>>;

export async function buildAuthUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: AUTH_USER_SELECT,
  });
}

export interface JwtPayload {
  userId: string;
  username: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as JwtPayload;
  } catch {
    return null;
  }
}

/** Get current user from cookie in Server Components / API routes */
export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload) return null;

  return buildAuthUser(payload.userId);
}

/** Require auth - returns user or throws Response */
export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    throw Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return user;
}

/** Require admin role - returns user or throws 403 */
export async function requireAdmin() {
  const user = await requireAuth();
  if (user.role !== "admin") {
    throw Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return user;
}
