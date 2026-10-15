/* Reachability measurement only: HTTPS to this Worker, NOT a VLESS/VPN success claim. */
// A transient offline/5xx error must NEVER erase a bearer subscription URL.
export function subscriptionIsInvalid(status) { return [403, 404, 410].includes(status); }

export async function probeWorker({ count = 3, fetchFn = fetch, pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), onProgress = () => {}, timeoutMs = 3500 } = {}) {
  if (!Number.isInteger(count) || count < 1 || count > 10) throw new RangeError('count must be 1..10');
  const samples = [];
  let colo = '—';
  for (let i = 0; i < count; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = performance.now();
    try {
      const response = await fetchFn('/api/v1/ping', { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error('worker_unavailable');
      const data = await response.json();
      if (!data.ok) throw new Error('worker_unavailable');
      samples.push(Math.round(performance.now() - started));
      colo = data.colo || '—';
    } catch { /* include this failed attempt in the denominator */ }
    finally { clearTimeout(timer); }
    onProgress({ completed: i + 1, count, successes: samples.length });
    if (i + 1 < count) await pause(220);
  }
  samples.sort((a, b) => a - b);
  return { successes: samples.length, total: count, medianMs: samples.length ? samples[Math.floor(samples.length / 2)] : null, colo };
}
