import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { pretty, platformColors, statusNames } from '../../core/qa/presentation';
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, string> = { external: 'M14 3h7v7m0-7L10 14M10 3H3v18h18v-7', search: 'M21 21l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0', close: 'M6 6l12 12M6 18 18 6', arrow: 'm9 5 7 7-7 7', back: 'm15 5-7 7 7 7', refresh: 'M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 2M18 18A8 8 0 0 1 5 16', activity: 'M3 12h4l3-8 4 16 3-8h4', events: 'M5 4v16M9 6h11M9 12h8M9 18h11', page: 'M5 3h10l4 4v14H5zM14 3v5h5M8 12h8M8 16h6', tools: 'M4 7h16M4 17h16M8 4v6M16 14v6', export: 'M12 3v12m-4-4 4 4 4-4M4 15v6h16v-6', copy: 'M9 8h11v13H9zM15 8V3H4v13h5', pause: 'M8 5v14M16 5v14', play: 'm7 4 13 8-13 8z', minus: 'M5 12h14', dock: 'M3 4h18v16H3zM15 4v16', check: 'm4 12 5 5L20 6', target: 'M12 2v4M12 18v4M2 12h4M18 12h4M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0', settings: 'M4 7h16M4 17h16M8 4v6M16 14v6', gear: 'M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4', 'dock-bottom': 'M3 4h18v16H3zM3 14h18', 'dock-right': 'M3 4h18v16H3zM15 4v16', pin: 'M12 17v5M8 3h8l-1 7 3 3H6l3-3z', snow: 'M12 3v18M4 7.5l16 9M20 7.5l-16 9', trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3', download: 'M12 4v11M7 11l5 5 5-5M5 20h14', stop: 'M6 6h12v12H6z', eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0', wrap: 'M4 6h16M4 12h12a3 3 0 0 1 0 6h-4M4 18h4', plug: 'M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4', lock: 'M5 11h14v9H5zM8 11V8a4 4 0 0 1 8 0v3', warn: 'M12 4l9 16H3zM12 10v4M12 17v.5' };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={paths[name] || paths.activity} /></svg>;
}
export function Logo({ size = 22 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><path d="M12 1v5M12 18v5M1 12h5M18 12h5" opacity=".6" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /></svg>; }
export function Brand({ subtitle, version }: { subtitle?: string; version?: string }) { return <div class="ss-brand"><span class="ss-logo"><Logo /></span><div><strong>Splitscope{version && <span class="ss-ver">{version}</span>}</strong>{subtitle && <small>{subtitle}</small>}</div></div>; }
export function PlatformDot({ platform }: { platform: string }) { return <i class="ss-pd" style={{ background: platformColors[platform] || 'var(--muted)' }} aria-hidden="true" />; }
export function IconButton({ icon, label, onClick, on = false, size = 18, disabled = false }: { icon: string; label: string; onClick: () => void; on?: boolean; size?: number; disabled?: boolean }) { return <button class={'ss-icon-button' + (on ? ' ss-on' : '')} title={label} aria-label={label} aria-pressed={on || undefined} disabled={disabled} onClick={onClick}><Icon name={icon} size={size} /></button>; }
export function Status({ status, label }: { status: string; label?: string }) { return <span class={'ss-status ss-status-' + status}><i />{label || statusNames[status] || status}</span>; }
export function Empty({ title, children }: { title: string; children: ComponentChildren }) { return <div class="ss-empty"><span class="ss-empty-icon"><Icon name="search" size={26} /></span><h3>{title}</h3><div class="ss-empty-body">{children}</div></div>; }
/** navigator.clipboard is unavailable on http pages and in some frames; fall back to a hidden textarea. */
function legacyCopy(value: string): boolean {
  try {
    const area = document.createElement('textarea');
    area.value = value; area.setAttribute('readonly', ''); area.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
    document.body.append(area); area.select();
    const ok = document.execCommand('copy'); area.remove(); return ok;
  } catch { return false; }
}
export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [feedback, setFeedback] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => { try { await navigator.clipboard.writeText(value); setFeedback('Copied'); } catch { setFeedback(legacyCopy(value) ? 'Copied' : 'Copy unavailable'); } clearTimeout(timer.current); timer.current = setTimeout(() => setFeedback(''), 2200); };
  return <button class="ss-button ss-small" aria-live="polite" onClick={() => void copy()}><Icon name={feedback === 'Copied' ? 'check' : 'copy'} size={13} />{feedback || label}</button>;
}
export function JsonTree({ value, label = 'Payload', depth = 0, defaultOpen = false }: { value: unknown; label?: string; depth?: number; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [limit, setLimit] = useState(40);
  if (value === null || typeof value !== 'object') return <div class="ss-json-leaf"><span>{label}</span><code>{pretty(value)}</code></div>;
  const items = Object.entries(value);
  return <div class="ss-json-node"><button class="ss-tree-toggle" aria-expanded={open} onClick={() => setOpen(!open)}><span class={open ? 'ss-chevron ss-open' : 'ss-chevron'}><Icon name="arrow" size={12} /></span><b>{label}</b><span class="ss-muted">{Array.isArray(value) ? '[' + items.length + ' items]' : '{' + items.length + ' fields}'}</span></button>{open && <div class="ss-tree-children">{depth >= 12 ? <pre class="ss-code">{pretty(value)}</pre> : items.slice(0, limit).map(([key, child]) => <JsonTree key={key} label={key} value={child} depth={depth + 1} />)}{items.length > limit && <button class="ss-link" onClick={() => setLimit(limit + 40)}>Show 40 more fields</button>}</div>}</div>;
}
export function Disclosure({ title, meta, children }: { title: string; meta?: string; children: ComponentChildren }) {
  const [open, setOpen] = useState(false);
  return <section class="ss-disclosure"><button class="ss-disclosure-toggle" aria-expanded={open} onClick={() => setOpen(!open)}><span><strong>{title}</strong>{meta && <small>{meta}</small>}</span><span class={open ? 'ss-chevron ss-open' : 'ss-chevron'}><Icon name="arrow" size={15} /></span></button>{open && <div class="ss-disclosure-body">{children}</div>}</section>;
}
