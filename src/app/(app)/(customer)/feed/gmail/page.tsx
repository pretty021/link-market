'use client';

import { AccountFeed } from '@/components/account-feed';

export default function GmailFeedPage() {
  return <AccountFeed kind="GMAIL" title="Gmail accounts" subtitle="Reviewed. Updated live." />;
}
