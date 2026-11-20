import { PrismaClient } from "@prisma/client";
import { PRISMA_OMIT } from "@/lib/dbOmit";

const createClient = () => new PrismaClient({ omit: PRISMA_OMIT });
type Client = ReturnType<typeof createClient>;

const globalForPrisma = globalThis as unknown as { prisma?: Client };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
