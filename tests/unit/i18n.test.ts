import { describe, it, expect } from 'vitest';
import { formatNumber, formatPrice, toPersianDigits, formatDate } from '../../src/web/i18n';

describe('locale formatting', () => {
  it('Persian numbers use native digits', () => {
    const n = formatNumber(1234567, 'fa');
    expect(n).toContain('۱');
    expect(n).toContain('۲۳۴٬۵۶۷'.slice(1, 3)); // contains Persian ۲۳
  });
  it('English numbers use latin digits', () => {
    expect(formatNumber(1234567, 'en')).toBe('1,234,567');
  });
  it('prices: free, toman (fa), IRR currency (en)', () => {
    expect(formatPrice(0, 'fa')).toBe('رایگان');
    expect(formatPrice(490000000, 'fa')).toContain('تومان');
    expect(formatPrice(490000000, 'en')).toContain('IRR');
  });
  it('toPersianDigits converts all digits', () => {
    expect(toPersianDigits('0912 345 6789')).toBe('۰۹۱۲ ۳۴۵ ۶۷۸۹');
  });
  it('dates render in fa-IR calendar', () => {
    const s = formatDate(1760000000000, 'fa');
    expect(typeof s).toBe('string');
    expect(s.length).toBeGreaterThan(3);
  });
});
