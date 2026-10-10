// ============================================================
// RateLimiter Durable Object — fixed-window counters with
// per-key isolation. Used for auth endpoints, code requests
// and other abuse-prone routes.
// ============================================================

interface WindowRec {
  count: number;
  resetAt: number;
}

export class RateLimiter implements DurableObject {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response('method_not_allowed', { status: 405 });
    let body: { limit?: number; windowMs?: number };
    try {
      body = await request.json();
    } catch {
      return Response.json({ allowed: false, remaining: 0, resetAt: 0 }, { status: 400 });
    }
    const limit = Math.max(1, Math.min(10000, body.limit ?? 10));
    const windowMs = Math.max(1000, Math.min(86400000, body.windowMs ?? 60000));

    const nowMs = Date.now();
    const result = await this.state.blockConcurrencyWhile(async () => {
      let rec = (await this.state.storage.get<WindowRec>('w')) || { count: 0, resetAt: nowMs + windowMs };
      if (nowMs >= rec.resetAt) rec = { count: 0, resetAt: nowMs + windowMs };
      rec.count += 1;
      await this.state.storage.put('w', rec);
      const allowed = rec.count <= limit;
      return { allowed, remaining: Math.max(0, limit - rec.count), resetAt: rec.resetAt };
    });

    return Response.json(result, { status: result.allowed ? 200 : 429 });
  }
}
