import { emit } from '@/lib/realtime';

type OutEvent = { to: string[]; event: string; payload: unknown };

/** Collects socket events during a transaction; flush() only after the transaction commits. */
export class Outbox {
  private events: OutEvent[] = [];

  push(to: string | (string | null | undefined)[], event: string, payload: unknown) {
    const list = (Array.isArray(to) ? to : [to]).filter((x): x is string => !!x);
    this.events.push({ to: list, event, payload });
  }

  flush() {
    for (const e of this.events) emit(e.to, e.event, e.payload);
    this.events = [];
  }
}
