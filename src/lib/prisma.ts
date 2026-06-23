import path from "path";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function resolveDatabaseUrl() {
  const configured = process.env.DATABASE_URL;
  if (configured) {
    if (configured.startsWith("file:")) {
      const relativePath = configured.slice("file:".length);
      return `file:${path.resolve(process.cwd(), relativePath)}`;
    }

    return configured;
  }

  return `file:${path.resolve(process.cwd(), "dev.db")}`;
}

const adapter = new PrismaLibSql({ url: resolveDatabaseUrl() });

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
