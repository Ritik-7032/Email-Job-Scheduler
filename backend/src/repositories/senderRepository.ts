import { prisma } from '../lib/prisma.js';
import { Sender } from '@prisma/client';

export async function getAllSenders(): Promise<Sender[]> {
  return prisma.sender.findMany({
    orderBy: { createdAt: 'asc' },
  });
}
