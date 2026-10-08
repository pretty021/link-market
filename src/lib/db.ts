import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Database clock as UTC `timestamp`. Prisma stores DateTime as UTC in `timestamp without time zone`
 * columns, while plain now() would be converted to the session's local time zone.
 */
export const DB_NOW = Prisma.raw(`(now() AT TIME ZONE 'UTC')`);

const g = globalThis as unknown as { __prisma?: PrismaClient };

export const prisma = g.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') g.__prisma = prisma;

export type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
