import { describe, it, expect } from 'vitest';
import { dayKey, tierAtLeast } from '../../src/worker/lib/db';

describe('dayKey', () => {
  it('returns YYYY-MM-DD in the configured timezone', () => {
    const d = new Date('2026-01-15T10:00:00Z');
    expect(dayKey('UTC', d)).toBe('2026-01-15');
    expect(dayKey('Asia/Tehran', d)).toBe('2026-01-15');
  });
  it('rolls over day boundaries correctly', () => {
    const d = new Date('2026-01-15T23:30:00Z');
    expect(dayKey('UTC', d)).toBe('2026-01-15');
    // 23:30 UTC = 03:00 next day in Tehran
    expect(dayKey('Asia/Tehran', d)).toBe('2026-01-16');
    // 23:30 UTC = previous evening in New York
    expect(dayKey('America/New_York', d)).toBe('2026-01-15');
  });
});

describe('tier gating', () => {
  it('ranks basic < plus < pro', () => {
    expect(tierAtLeast('basic', 'basic')).toBe(true);
    expect(tierAtLeast('basic', 'plus')).toBe(false);
    expect(tierAtLeast('plus', 'basic')).toBe(true);
    expect(tierAtLeast('pro', 'plus')).toBe(true);
    expect(tierAtLeast('plus', 'pro')).toBe(false);
    expect(tierAtLeast('pro', 'pro')).toBe(true);
  });
  it('unknown tiers degrade to basic rank', () => {
    expect(tierAtLeast('weird', 'basic')).toBe(true);
    expect(tierAtLeast('weird', 'plus')).toBe(false);
  });
});
