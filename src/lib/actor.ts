import type { Role } from '@prisma/client';

export type AdminActor = { kind: 'admin'; id: string; name: string | null; email: string };
export type UserActor = { kind: 'user'; id: string; role: Role; name: string; email: string };
export type Actor = AdminActor | UserActor;

export const isAdmin = (a: Actor): a is AdminActor => a.kind === 'admin';
export const isClient = (a: Actor): a is UserActor => a.kind === 'user' && a.role === 'CLIENT';
export const isCustomer = (a: Actor): a is UserActor => a.kind === 'user' && a.role === 'CUSTOMER';
