import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import fa, { type Dict } from './fa';
import en from './en';

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

function deepMerge<D>(base: D, override: DeepPartial<D>): D {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
    if (v === undefined) continue;
    const b = (base as Record<string, unknown>)[k];
    out[k] = v !== null && typeof v === 'object' && b !== null && typeof b === 'object' && !Array.isArray(v)
      ? deepMerge(b, v as never)
      : v;
  }
  return out as D;
}

const dicts: Record<string, Dict> = { fa, en: deepMerge(fa, en as DeepPartial<Dict>) };

export type Locale = 'fa' | 'en';

interface I18nCtx {
  locale: Locale;
  dir: 'rtl' | 'ltr';
  t: Dict;
  setLocale: (l: Locale) => void;
  /** interpolate {k:v} into template */
  fmt: (template: string, vars: Record<string, string | number>) => string;
}

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children, initial }: { children: React.ReactNode; initial?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (initial) return initial;
    const saved = localStorage.getItem('amin_locale');
    if (saved === 'en' || saved === 'fa') return saved;
    return 'fa';
  });

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'fa' ? 'rtl' : 'ltr';
    localStorage.setItem('amin_locale', locale);
  }, [locale]);

  const value = useMemo<I18nCtx>(() => ({
    locale,
    dir: locale === 'fa' ? 'rtl' : 'ltr',
    t: dicts[locale],
    setLocale: (l: Locale) => setLocaleState(l),
    fmt: (template, vars) => template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '')),
  }), [locale]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n outside provider');
  return v;
}

// ---------- Locale-aware formatting (Intl) ----------

const LOCALE_MAP: Record<string, string> = { fa: 'fa-IR', en: 'en-US' };

export function formatNumber(n: number, locale: string): string {
  return new Intl.NumberFormat(LOCALE_MAP[locale] || 'en-US').format(n);
}

export function formatDate(ts: number | null | undefined, locale: string, opts?: Intl.DateTimeFormatOptions): string {
  if (!ts) return '—';
  return new Intl.DateTimeFormat(LOCALE_MAP[locale] || 'en-US', { dateStyle: 'medium', ...opts }).format(new Date(ts));
}

export function formatDateTime(ts: number | null | undefined, locale: string): string {
  if (!ts) return '—';
  return new Intl.DateTimeFormat(LOCALE_MAP[locale] || 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ts));
}

export function formatPrice(irr: number, locale: string): string {
  if (irr <= 0) return locale === 'fa' ? 'رایگان' : 'Free';
  // Display in تومان for Persian (1 toman = 10 rials), IRR for English
  if (locale === 'fa') {
    const toman = Math.round(irr / 10);
    return new Intl.NumberFormat('fa-IR').format(toman) + ' تومان';
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'IRR', maximumFractionDigits: 0 }).format(irr);
}

export function formatBytes(bytes: number, locale: string): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return formatNumber(Math.round(mb / 102.4) / 10, locale) + ' GB';
  return formatNumber(Math.round(mb * 10) / 10, locale) + ' MB';
}

export function formatPhone(phone: string, countryCode: string, locale: string): string {
  // 간단한 localized display: group digits; country-aware grouping for IR
  const digits = phone.replace(/\D/g, '');
  if (countryCode === 'IR' && digits.length === 11 && digits.startsWith('09')) {
    return new Intl.NumberFormat(LOCALE_MAP[locale] || 'en-US', { useGrouping: false })
      .format(0) === '۰'
      ? toPersianDigits(`${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`)
      : `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  return phone;
}

export function toPersianDigits(s: string): string {
  const faDigits = '۰۱۲۳۴۵۶۷۸۹';
  return s.replace(/[0-9]/g, (d) => faDigits[parseInt(d, 10)]);
}
