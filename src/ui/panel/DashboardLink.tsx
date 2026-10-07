import { useEffect, useRef, useState } from 'preact/hooks';
import type { NormalizedExperiment } from '../../core/model';
import { activityLinkKey, dashboardDestination, dashboardVariables, resolveDashboardTemplate, templateLinkKey, type DashboardLinks } from '../../core/dashboard-links';
import { kindNames, platformNames } from '../../core/qa/presentation';
import { CopyButton, Icon } from '../shared/components';

export function DashboardLink({ activity, links, onConfigure }: { activity: NormalizedExperiment; links?: DashboardLinks; onConfigure: () => void }) {
  const destination = dashboardDestination(activity, links);
  return <div class="ss-dashboard-actions">
    {destination.url && <a class="ss-link" href={destination.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" title={destination.reason} aria-label={`${destination.label} for ${activity.name} (new tab)`}>{destination.label}<Icon name="external" size={13} /></a>}
    <button class="ss-link ss-caption" onClick={onConfigure} title={destination.reason}>{destination.saved ? 'Edit link' : destination.direct ? 'Link settings' : 'Add direct link'}</button>
  </div>;
}

export function DashboardLinkDialog({ activity, links, onSave, onClose }: { activity: NormalizedExperiment; links: DashboardLinks; onSave: (links: DashboardLinks) => void; onClose: () => void }) {
  const exactKey = activityLinkKey(activity); const typeKey = templateLinkKey(activity);
  const [scope, setScope] = useState(links[exactKey] ? 'activity' : links[typeKey] ? 'type' : 'activity');
  const [value, setValue] = useState(links[exactKey] || links[typeKey] || '');
  const destination = dashboardDestination(activity, links);
  const result = resolveDashboardTemplate(value.trim(), activity);
  const error = scope === 'type' && !/\{(?:id|campaignId)\}/.test(value) ? 'A reusable link must contain {id} or {campaignId} so each activity opens its own page.' : result.error;
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const prior = document.activeElement; dialog.current?.showModal(); return () => { dialog.current?.close(); if (prior instanceof HTMLElement) prior.focus(); }; }, []);
  const save = () => {
    if (error || !result.url) return;
    const next = { ...links, [scope === 'activity' ? exactKey : typeKey]: value.trim() };
    if (scope === 'type') delete next[exactKey];
    onSave(next); onClose();
  };
  return <dialog ref={dialog} class="ss-dialog ss-dashboard-dialog" aria-labelledby="ss-dashboard-title" onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }} onCancel={event => { event.preventDefault(); onClose(); }}>
    <span class="ss-eyebrow">{platformNames[activity.platform]}</span><h2 id="ss-dashboard-title">Dashboard link</h2><p>{activity.name}</p>
    <p class="ss-caption ss-muted">{destination.reason}</p>
    <CopyButton value={activity.id} label="Copy activity ID" />
    <label class="ss-label">Use this link for<select value={scope} onChange={event => { const next = event.currentTarget.value; setScope(next); setValue(links[next === 'type' ? typeKey : exactKey] || ''); }}><option value="activity">This activity only</option><option value="type">{kindNames[activity.kind]} activities in {platformNames[activity.platform]} on this site</option></select></label>
    <label class="ss-label">Dashboard URL<textarea value={value} maxLength={4000} placeholder="Paste the activity link from your dashboard" spellcheck={false} onInput={event => setValue(event.currentTarget.value)} /></label>
    {scope === 'type' && <p class="ss-caption ss-muted">Replace the activity ID in your link with {'{id}'} or the campaign ID with {'{campaignId}'}. Reuse only when activities share the same account and dashboard route. Captured project/account IDs also restrict reuse; vendor subtypes may still need separate links.</p>}
    <details class="ss-caption"><summary>Available link placeholders</summary>{Object.entries(dashboardVariables(activity)).map(([key, item]) => <div class="ss-field" key={key}><code>{`{${key}}`}</code> · {item || 'Not exposed'}</div>)}</details>
    {value && <p class="ss-caption ss-wrap" role={error ? 'alert' : undefined}>{error || `Destination: ${result.url}`}</p>}
    <p class="ss-caption ss-muted">Saved locally for this website. Opens in a new tab using your existing platform sign-in. Saved links are included in workspace exports.</p>
    <div class="ss-actions">{links[scope === 'type' ? typeKey : exactKey] && <button class="ss-link" onClick={() => { const next = { ...links }; delete next[scope === 'type' ? typeKey : exactKey]; onSave(next); onClose(); }}>Remove saved link</button>}<button class="ss-button" onClick={onClose}>Cancel</button><button class="ss-button ss-primary" disabled={!!error || !result.url} onClick={save}>Save link</button></div>
  </dialog>;
}
