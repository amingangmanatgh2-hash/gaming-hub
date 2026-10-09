// ============================================================
// QuotaCoordinator Durable Object — one instance per user.
// Gives us atomic check-and-reserve semantics for daily quotas
// (messages / video jobs) so concurrent requests cannot
// overshoot the limit.
//
// Usage (POST JSON):
//   { action: "check",   kind, day, limit }
//   { action: "reserve", kind, day, limit }  -> { allowed, count, limit }
//   { action: "release", kind, day }         -> decrements (e.g. failed job)
//   { action: "usage",   day }               -> { message, video }
// ============================================================

type Kind = 'message' | 'video';

interface QuotaState {
  days: Record<string, Record<Kind, number>>;
}

export class QuotaCoordinator implements DurableObject {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  private async load(day: string): Promise<Record<Kind, number>> {
    const all = (await this.state.storage.get<QuotaState['days']>('days')) || {};
    // GC: keep only recent ~3 day keys
    const keys = Object.keys(all).sort();
    while (keys.length > 3) {
      const k = keys.shift()!;
      delete all[k];
    }
    if (!all[day]) all[day] = { message: 0, video: 0 };
    await this.state.storage.put('days', all);
    return all[day];
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response('method_not_allowed', { status: 405 });
    let body: { action?: string; kind?: Kind; day?: string; limit?: number };
    try {
      body = await request.json();
    } catch {
      return Response.json({ ok: false }, { status: 400 });
    }
    const { action, kind, day, limit } = body;
    if (!day) return Response.json({ ok: false, error: 'day required' }, { status: 400 });

    return this.state.blockConcurrencyWhile(async () => {
      const rec = await this.load(day);
      switch (action) {
        case 'check': {
          const k: Kind = kind === 'video' ? 'video' : 'message';
          const count = rec[k];
          const lim = limit ?? 0;
          return Response.json({ allowed: count < lim, count, limit: lim });
        }
        case 'reserve': {
          const k: Kind = kind === 'video' ? 'video' : 'message';
          const lim = limit ?? 0;
          if (rec[k] >= lim) return Response.json({ allowed: false, count: rec[k], limit: lim });
          rec[k] += 1;
          await this.persist(day, rec);
          return Response.json({ allowed: true, count: rec[k], limit: lim });
        }
        case 'release': {
          const k: Kind = kind === 'video' ? 'video' : 'message';
          if (rec[k] > 0) rec[k] -= 1;
          await this.persist(day, rec);
          return Response.json({ ok: true, count: rec[k] });
        }
        case 'usage': {
          return Response.json({ day, message: rec.message, video: rec.video });
        }
        default:
          return Response.json({ ok: false, error: 'unknown action' }, { status: 400 });
      }
    });
  }

  private async persist(day: string, rec: Record<Kind, number>): Promise<void> {
    const all = (await this.state.storage.get<QuotaState['days']>('days')) || {};
    all[day] = rec;
    await this.state.storage.put('days', all);
  }
}
