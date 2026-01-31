'use client';

import { useMemo, useState } from 'react';

type Direction = 'UP' | 'DOWN' | 'STALE';
type Scope = 'local' | 'global';

function safeParseDate(d: string | Date | null | undefined): Date | null {
  if (!d) return null;
  if (d instanceof Date) return isFinite(d.getTime()) ? d : null;
  const ms = Date.parse(d);
  return isFinite(ms) ? new Date(ms) : null;
}

function isRtlFromDom(): boolean {
  if (typeof document === 'undefined') return false;
  const dir = (document.documentElement.getAttribute('dir') || '').toLowerCase();
  if (dir === 'rtl') return true;
  const lang = (document.documentElement.getAttribute('lang') || '').toLowerCase();
  return lang.startsWith('ar');
}

function formatHHMM(d: Date): string {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(d);
  } catch {
    return d.toLocaleTimeString();
  }
}

async function copyTextBestEffort(text: string): Promise<boolean> {
  // Clipboard API
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }

  // Fallback: hidden textarea + execCommand
  try {
    if (typeof document === 'undefined') return false;
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function SignalTrustBadges(props: {
  lastUpdatedAt?: string | Date | null;
  validatedAfterMinutes?: number | null;
  isValidated?: boolean;
  className?: string;
}) {
  const rtl = isRtlFromDom();
  const last = safeParseDate(props.lastUpdatedAt ?? null);
  const hhmm = last ? formatHHMM(last) : null;

  const lastUpdatedLabel = rtl ? 'آخر تحديث' : 'Last updated';

  return (
    <div className={`flex flex-wrap items-center gap-2 ${rtl ? 'flex-row-reverse' : ''} ${props.className ?? ''}`}>
      <span className="inline-flex items-center rounded-full border border-gray-700 bg-gray-950/40 px-2 py-0.5 text-xs text-gray-300">
        {lastUpdatedLabel}: {hhmm ?? '—'}
      </span>
    </div>
  );
}

export default function ShareSignalButton(props: {
  direction: Direction;
  country?: string;
  scope?: Scope;
  price?: number | null;
  currency?: string | null;
  lastUpdatedAt?: string | Date | null;
  validatedAfterMinutes?: number | null;
  href?: string;
  className?: string;
}) {
  const rtl = isRtlFromDom();
  const [toast, setToast] = useState<string | null>(null);

  const href = (props.href ?? 'https://egyptgoldpro.com').trim() || 'https://egyptgoldpro.com';

  const shareText = useMemo(() => {
    const lines: string[] = [];
    const dir = props.direction;

    if (dir === 'UP') lines.push(rtl ? 'الذهب يتحرك صعودًا' : 'Gold is moving UP');
    else if (dir === 'DOWN') lines.push(rtl ? 'الذهب يتحرك هبوطًا' : 'Gold is moving DOWN');
    else lines.push(rtl ? 'لا توجد إشارة (STALE)' : 'No signal (STALE)');

    if (props.country) lines.push(`${rtl ? 'الدولة' : 'Country'}: ${props.country}${props.scope ? ` (${props.scope})` : ''}`);

    if (typeof props.price === 'number' && isFinite(props.price)) {
      const cur = props.currency ? String(props.currency) : '';
      lines.push(`${rtl ? 'السعر' : 'Price'}: ${props.price.toLocaleString()}${cur ? ` ${cur}` : ''}`);
    }

    const last = safeParseDate(props.lastUpdatedAt ?? null);
    if (last) lines.push(`${rtl ? 'آخر تحديث' : 'Last updated'}: ${formatHHMM(last)}`);

    lines.push(rtl ? 'المصدر: EgyptGold Pro' : 'Source: EgyptGold Pro');
    lines.push(href);
    return lines.join('\n');
  }, [props.direction, props.country, props.scope, props.price, props.currency, props.lastUpdatedAt, href, rtl]);

  const label = rtl ? 'مشاركة' : 'Share';
  const copied = rtl ? 'تم النسخ' : 'Copied to clipboard';
  const couldNotCopy = rtl ? 'تعذر النسخ' : 'Could not copy';

  return (
    <div className={`flex items-center gap-2 ${rtl ? 'flex-row-reverse' : ''} ${props.className ?? ''}`}>
      <button
        type="button"
        onClick={async () => {
          setToast(null);
          try {
            if (typeof navigator !== 'undefined' && (navigator as any).share) {
              await (navigator as any).share({ title: 'EgyptGold Pro', text: shareText, url: href });
              return;
            }
            const ok = await copyTextBestEffort(shareText);
            setToast(ok ? copied : couldNotCopy);
            window.setTimeout(() => setToast(null), 1600);
          } catch {
            const ok = await copyTextBestEffort(shareText);
            setToast(ok ? copied : couldNotCopy);
            window.setTimeout(() => setToast(null), 1600);
          }
        }}
        className="inline-flex items-center gap-2 rounded-md border border-gray-700 bg-gray-950/40 px-3 py-1.5 text-sm font-semibold text-gray-200 hover:bg-gray-900"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-gray-300">
          <path
            d="M16 5a3 3 0 1 0-2.83-4H13a3 3 0 0 0 .17 1L8.91 7.09a3 3 0 1 0 0 4.82l4.26 5.09A3 3 0 1 0 14 16a3 3 0 0 0-.17 1h.17l-4.26-5.09a3 3 0 0 0 0-4.82L13.83 2H13a3 3 0 0 0 3 3Z"
            fill="currentColor"
          />
        </svg>
        <span>{label}</span>
      </button>

      {toast && (
        <span className="text-xs text-gray-300">{toast}</span>
      )}
    </div>
  );
}

