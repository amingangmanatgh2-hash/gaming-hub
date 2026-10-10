// ============================================================
// Zarinpal Payment Gateway (REST v4) — real integration.
// Docs: https://www.zarinpal.com/docs/paymentGateway/
//
// Endpoints used (base configurable; sandbox supported):
//   POST {base}/payment/request.json
//   POST {base}/payment/verify.json
//
// Security: activation happens ONLY after server-side verify
// returns code 100 (success) or 101 (already verified — treated
// idempotently). Amount/currency/authority must match our own
// transaction record. ref_id uniqueness deduplicates replays.
// ============================================================

export interface ZpRequestResult {
  authority: string;
  fee: number;
  fee_type: string;
  payment_url: string;
}

export interface ZpVerifyResult {
  code: number;
  ref_id: number;
  card_pan?: string;
  card_hash?: string;
  message?: string;
}

interface ZpEnvelope<T> {
  data?: T;
  errors?: { code?: number; message?: string; validations?: unknown[] } | unknown[];
}

function gatewayUrl(base: string, sandbox: boolean): string {
  const clean = (base || 'https://api.zarinpal.com/pg/v4').replace(/\/+$/, '');
  if (sandbox && clean.includes('api.zarinpal.com')) return clean.replace('https://api.zarinpal.com', 'https://sandbox.zarinpal.com/pg/v4');
  return clean;
}

export function startPayUrl(merchantBase: string, sandbox: boolean, authority: string): string {
  const clean = (merchantBase || 'https://api.zarinpal.com/pg/v4').replace(/\/+$/, '');
  let host = 'https://www.zarinpal.com/pg/StartPay/';
  if (sandbox || clean.includes('sandbox')) host = 'https://sandbox.zarinpal.com/pg/StartPay/';
  // When a custom base_url is used (e.g. a test stub), derive StartPay from it:
  if (!clean.includes('zarinpal.com')) host = clean.replace(/\/pg\/v4.*$/, '') + '/pg/StartPay/';
  return host + authority;
}

export async function zpRequestPayment(opts: {
  base: string; sandbox: boolean; merchantId: string; amount: number;
  callbackUrl: string; description: string; email?: string; mobile?: string;
}): Promise<ZpRequestResult> {
  const url = gatewayUrl(opts.base, opts.sandbox) + '/payment/request.json';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      merchant_id: opts.merchantId,
      amount: opts.amount,
      callback_url: opts.callbackUrl,
      description: opts.description.slice(0, 500),
      metadata: { email: opts.email || '', mobile: opts.mobile || '' },
    }),
  });
  const body = (await res.json().catch(() => ({}))) as ZpEnvelope<{ authority?: string; code?: number; fee?: number; fee_type?: string }>;
  const data = body.data as { authority?: string; code?: number; fee?: number; fee_type?: string } | undefined;
  if (!res.ok || !data || !data.authority || !(data.code === 100)) {
    const msg = extractZpError(body);
    throw new Error('zp_request_failed: ' + msg);
  }
  return {
    authority: data.authority,
    fee: Number(data.fee ?? 0),
    fee_type: data.fee_type || 'Merchant',
    payment_url: startPayUrl(opts.base, opts.sandbox, data.authority),
  };
}

export async function zpVerifyPayment(opts: {
  base: string; sandbox: boolean; merchantId: string; amount: number; authority: string;
}): Promise<ZpVerifyResult> {
  const url = gatewayUrl(opts.base, opts.sandbox) + '/payment/verify.json';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ merchant_id: opts.merchantId, amount: opts.amount, authority: opts.authority }),
  });
  const body = (await res.json().catch(() => ({}))) as ZpEnvelope<{ code?: number; ref_id?: number; card_pan?: string; card_hash?: string }>;
  const data = (body.data || {}) as { code?: number; ref_id?: number; card_pan?: string; card_hash?: string; message?: string };
  const code = typeof data.code === 'number' ? data.code : extractZpErrorCode(body);
  return { code: code ?? -1, ref_id: data.ref_id ?? 0, card_pan: data.card_pan, card_hash: data.card_hash, message: data.message };
}

function extractZpError(body: ZpEnvelope<unknown>): string {
  const e = body.errors;
  if (e && !Array.isArray(e) && typeof e === 'object' && 'message' in e) return String((e as { message?: unknown }).message || 'unknown');
  return 'unknown';
}

function extractZpErrorCode(body: ZpEnvelope<unknown>): number | undefined {
  const e = body.errors;
  if (e && !Array.isArray(e) && typeof e === 'object' && 'code' in e) return Number((e as { code?: unknown }).code);
  return undefined;
}
