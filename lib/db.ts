import "server-only";
import { PrismaClient } from "@/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured.");
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
  return client;
}
