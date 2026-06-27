import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import path from 'path'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function createPrismaClient() {
  const dbUrl = process.env.DATABASE_URL ?? 'file:./prisma/dev.db'
  const dbPath = dbUrl.startsWith('file:') ? dbUrl.slice(5) : dbUrl
  // Resolve relative to process.cwd() so it always finds the db in project root
  const resolvedPath = path.resolve(process.cwd(), dbPath)

  const adapter = new PrismaBetterSqlite3({ url: resolvedPath })

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  } as ConstructorParameters<typeof PrismaClient>[0])
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
