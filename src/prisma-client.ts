// src/prisma-client.ts - Versión corregida para Prisma 7
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// ⚠️ IMPORTANTE: En Prisma 7 NO uses datasourceUrl en el constructor
export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}