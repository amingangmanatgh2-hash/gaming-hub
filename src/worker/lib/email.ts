import type { Env } from '../env';

export interface SendResult {
  delivered: boolean;
  reason?: string;
}

/**
 * Transactional email via a Resend-compatible HTTP API.
 * When EMAIL_API_KEY is not configured the platform runs in
 * "email disabled" mode: codes can be surfaced to the owner via
 * dev echo (development only) and verification is optional.
 */
export async function sendEmail(env: Env, to: string, subject: string, html: string): Promise<SendResult> {
  const apiKey = env.EMAIL_API_KEY;
  if (!apiKey) return { delivered: false, reason: 'email_not_configured' };
  const from = env.EMAIL_FROM || 'AMIN AI ULTRA <no-reply@example.com>';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (!res.ok) return { delivered: false, reason: 'provider_error_' + res.status };
    return { delivered: true };
  } catch {
    return { delivered: false, reason: 'network_error' };
  }
}

export function codeEmailHtml(opts: { siteName: string; code: string; purposeFa: string }): string {
  return `<!doctype html><html dir="rtl" lang="fa"><body style="font-family:Tahoma,Arial;background:#0b0f0d;color:#e8f5ee;padding:32px">
  <div style="max-width:480px;margin:auto;background:#121a16;border:1px solid #1f2f26;border-radius:16px;padding:28px">
    <h2 style="color:#34d399;margin:0 0 8px">${opts.siteName}</h2>
    <p style="color:#a7c4b5">${opts.purposeFa}</p>
    <div style="font-size:34px;letter-spacing:8px;font-weight:700;color:#ffffff;background:#0d1712;border:1px dashed #2f5240;border-radius:12px;text-align:center;padding:16px;margin:18px 0;direction:ltr">${opts.code}</div>
    <p style="color:#7d9c8c;font-size:12px">این کد ۱۰ دقیقه معتبر است. اگر شما این درخواست را نداده‌اید، این پیام را نادیده بگیرید.</p>
  </div></body></html>`;
}
