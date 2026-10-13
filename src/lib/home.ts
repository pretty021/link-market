import { kindHref, type AccountKind } from './account-kinds';

export function homePath(me: { kind: 'admin' | 'user'; role?: 'CLIENT' | 'CUSTOMER'; sellerKinds?: AccountKind[] }) {
  if (me.kind === 'admin') return '/admin';
  if (me.role !== 'CLIENT') return '/feed';
  const kinds = me.sellerKinds?.length ? me.sellerKinds : (['LINKEDIN'] as AccountKind[]);
  return kinds.includes('LINKEDIN') ? '/client' : kindHref(kinds[0]!, 'client');
}
