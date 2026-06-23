import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

/** Fetch (or lazily create) the singleton config row. */
export async function getConfig() {
  let config = await prisma.integratorConfig.findUnique({ where: { id: 1 } });
  if (!config) {
    config = await prisma.integratorConfig.create({ data: { id: 1 } });
  }
  return config;
}
