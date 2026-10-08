import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, resolveSession } from './auth';
import { homePath } from './home';
import { getMe } from '@/server/services/users';
import type { Me } from './client/types';

export async function currentActor() {
  return resolveSession(cookies().get(SESSION_COOKIE)?.value);
}

/** For server layouts: requires a session (and optionally a role), returns the serialized user. */
export async function requirePage(allow?: Array<'admin' | 'CLIENT' | 'CUSTOMER'>): Promise<Me> {
  const actor = await currentActor();
  if (!actor) redirect('/login');
  const key = actor.kind === 'admin' ? 'admin' : actor.role;
  if (allow && !allow.includes(key)) redirect(homePath(actor));
  return JSON.parse(JSON.stringify(await getMe(actor))) as Me;
}
