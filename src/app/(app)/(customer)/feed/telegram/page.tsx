'use client';

import { AccountFeed } from '@/components/account-feed';

export default function TelegramFeedPage() {
  return <AccountFeed kind="TELEGRAM" title="Telegram accounts" subtitle="Reviewed. Updated live." />;
}
