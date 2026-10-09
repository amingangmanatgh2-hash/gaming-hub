import { describe, it, expect, vi, afterEach } from 'vitest';
import { zpVerifyPayment, zpRequestPayment, startPayUrl } from '../../src/worker/lib/zarinpal';

describe('zarinpal gateway mapping', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('startPayUrl derives host from configured base', () => {
    expect(startPayUrl('https://api.zarinpal.com/pg/v4', false, 'A001')).toBe('https://www.zarinpal.com/pg/StartPay/A001');
    expect(startPayUrl('https://api.zarinpal.com/pg/v4', true, 'A001')).toBe('https://sandbox.zarinpal.com/pg/StartPay/A001');
    expect(startPayUrl('http://127.0.0.1:9999/zp/pg/v4', false, 'A001')).toBe('http://127.0.0.1:9999/zp/pg/StartPay/A001');
  });

  it('request payment parses code-100 authority', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: { code: 100, authority: 'A00000999', fee: 0, fee_type: 'Merchant' }, errors: {},
    }), { status: 200 })));
    const r = await zpRequestPayment({ base: 'https://x/pg/v4', sandbox: false, merchantId: 'm', amount: 1000, callbackUrl: 'https://cb', description: 'd' });
    expect(r.authority).toBe('A00000999');
    expect(r.payment_url.endsWith('/A00000999')).toBe(true);
  });

  it('request payment throws on gateway error codes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: {}, errors: { code: -12, message: 'invalid merchant' },
    }), { status: 200 })));
    await expect(zpRequestPayment({ base: 'https://x/pg/v4', sandbox: false, merchantId: 'm', amount: 1000, callbackUrl: 'https://cb', description: 'd' }))
      .rejects.toThrow('zp_request_failed');
  });

  it('verify returns code+ref_id from authoritative response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: { code: 100, ref_id: 123456, card_pan: '6104****8899' }, errors: {},
    }), { status: 200 })));
    const r = await zpVerifyPayment({ base: 'https://x/pg/v4', sandbox: false, merchantId: 'm', amount: 500, authority: 'A1' });
    expect(r.code).toBe(100);
    expect(r.ref_id).toBe(123456);
  });

  it('verify surfaces gateway error code when data is empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: {}, errors: { code: -54, message: 'authority not valid' },
    }), { status: 200 })));
    const r = await zpVerifyPayment({ base: 'https://x/pg/v4', sandbox: false, merchantId: 'm', amount: 500, authority: 'BAD' });
    expect(r.code).toBe(-54);
  });
});
