import type { Adapter } from 'next-auth/adapters';
import type { PrismaClient } from '@prisma/client';

export declare function PrismaAdapter(prisma: PrismaClient): Adapter;
