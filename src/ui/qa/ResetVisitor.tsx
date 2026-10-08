import { useMemo, useState } from 'preact/hooks';
import type { PageState } from '../../core/state';
import { platformNames } from '../../core/qa/presentation';
import { browserEnv, planReset, resettablePlatforms, runReset, type VisitorItem } from '../../core/visitor-reset';
import { Empty, PlatformDot } from '../shared/components';
import ConfirmModal from '../shared/ConfirmModal';

const kindLabel = { cookie: 'cookie', local: 'local storage', session: 'session storage' } as const;

/** Forget a platform's stored assignment so the next load is bucketed again. */
export default function ResetVisitor({ state, onNotice, reload = () => location.reload() }: { state: PageState; onNotice: (message: string) => void; reload?: () => void }) {
  const detected = state.platforms.map(item => item.id as string).filter(id => resettablePlatforms.includes(id));
  const [off, setOff] = useState<string[]>([]);
  const [identity, setIdentity] = useState(true);
  const [version, setVersion] = useState(0);
  const [confirm, setConfirm] = useState<null | 'reload' | 'only'>(null);
  const [result, setResult] = useState<null | { cleared: number; remaining: VisitorItem[] }>(null);
  const selected = detected.filter(id => !off.includes(id));
  const items = useMemo(() => planReset(selected, browserEnv(), identity), [selected.join(','), identity, version]);
  if (!detected.length) return <Empty title="Nothing to reset">No supported experimentation platform has been detected on this page yet. Reset visitor appears once a platform is found.</Empty>;
  const perPlatform = (id: string) => items.filter(item => item.platform === id);
  const apply = (andReload: boolean) => {
    const outcome = runReset(items, browserEnv());
    setConfirm(null);
    setResult({ cleared: outcome.cleared.length, remaining: outcome.remaining });
    setVersion(value => value + 1);
    if (andReload && !outcome.remaining.length) { onNotice(`Cleared ${outcome.cleared.length} items. Reloading.`); reload(); }
    else onNotice(outcome.remaining.length ? `${outcome.remaining.length} items could not be cleared.` : `Cleared ${outcome.cleared.length} items.`);
  };
  return <section class="ss-stack ss-reset">
    <p class="ss-caption ss-muted">Forget the stored assignment for this site so the next page load buckets this browser again. Choose the platforms to reset. Only items that exist right now are listed, and nothing is removed until you confirm.</p>
    <div class="ss-reset-platforms" role="group" aria-label="Platforms to reset">{detected.map(id => <label key={id} class={'ss-reset-chip' + (selected.includes(id) ? ' ss-on' : '')}><input type="checkbox" checked={selected.includes(id)} onChange={e => setOff(e.currentTarget.checked ? off.filter(item => item !== id) : [...off, id])} /><PlatformDot platform={id} />{platformNames[id] || id}<small>{perPlatform(id).length}</small></label>)}</div>
    <label class="ss-setting ss-reset-switch"><span>Also reset the visitor ID<small>Most platforms pick a variation from the visitor ID, so keep this on to have a chance of landing in a different variation. In reports this browser then counts as a new visitor.</small></span><input class="ss-switch" type="checkbox" role="switch" checked={identity} onChange={e => setIdentity(e.currentTarget.checked)} /></label>
    <div class="ss-reset-list" aria-live="polite">
      <div class="ss-inline"><strong>{items.length} {items.length === 1 ? 'item' : 'items'} to clear</strong><button class="ss-link" onClick={() => { setResult(null); setVersion(value => value + 1); }}>Rescan</button></div>
      {items.length === 0 && <p class="ss-caption ss-muted">{selected.length ? 'No stored assignment found for the selected platforms. They may keep state on the server, or in names this list does not cover.' : 'Select at least one platform.'}</p>}
      {selected.map(id => perPlatform(id).length > 0 && <div key={id} class="ss-reset-group"><span class="ss-eyebrow"><PlatformDot platform={id} /> {platformNames[id] || id}</span>{perPlatform(id).map(item => <div class="ss-reset-row" key={item.kind + item.name}><code class="ss-wrap">{item.name}</code><span class={'ss-tag' + (item.group === 'identity' ? ' ss-tag-warn' : '')}>{item.group === 'identity' ? 'visitor ID' : kindLabel[item.kind]}</span></div>)}</div>)}
    </div>
    {result && (result.remaining.length > 0
      ? <div class="ss-note ss-note-warn" role="status"><strong>{result.remaining.length} could not be cleared</strong><span>These are likely HttpOnly cookies or set on another path. Clear them in the browser's site data settings, or from a server. Names: {result.remaining.map(item => item.name).join(', ')}.</span></div>
      : <p class="ss-note ss-note-ok" role="status">Cleared {result.cleared} {result.cleared === 1 ? 'item' : 'items'}. Reload to be bucketed again.</p>)}
    <div class="ss-actions"><button class="ss-button ss-primary" disabled={!items.length} onClick={() => setConfirm('reload')}>Clear and reload</button><button class="ss-button" disabled={!items.length} onClick={() => setConfirm('only')}>Clear without reloading</button></div>
    <p class="ss-note">Cookie names are matched by pattern and may not cover every setup. Platforms that assign on the server or by logged in user ID will bucket the same way again.</p>
    {confirm && <ConfirmModal title="Reset this visitor?" confirm={confirm === 'reload' ? 'Clear and reload' : 'Clear'} danger onConfirm={() => apply(confirm === 'reload')} onCancel={() => setConfirm(null)}>
      <p>This removes {items.length} {items.length === 1 ? 'item' : 'items'} for {selected.map(id => platformNames[id] || id).join(', ')} from this site{identity ? ', including the visitor ID' : ''}.</p>
      <p>Sign-in is not touched, but carts or other state kept by these tools may reset. It cannot be undone.</p>
    </ConfirmModal>}
  </section>;
}
