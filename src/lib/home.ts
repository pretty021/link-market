export function homePath(me: { kind: 'admin' | 'user'; role?: 'CLIENT' | 'CUSTOMER' }) {
  if (me.kind === 'admin') return '/admin';
  return me.role === 'CLIENT' ? '/client' : '/feed';
}
