import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret";

export interface JwtPayload {
  userId: string;
  username: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
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

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, username: true, avatar: true, bio: true, role: true, createdAt: true },
  });
  return user;
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
  if ((user as { role?: string }).role !== "admin") {
    throw Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return user;
}
