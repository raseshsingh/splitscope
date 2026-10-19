import { useEffect, useRef } from 'preact/hooks';
import type { ForcePlan } from '../../core/model';
import { CopyButton } from '../shared/components';

const trackingText = { disabled: 'This preview disables vendor tracking, so the visit should not count in reports.', counted: 'This visit counts in the platform’s reports.', unknown: 'This visit may count in the platform’s reports.' } as const;

export default function ConfirmDialog({ proposal, onClose, onConfirm }: { proposal: { plan: ForcePlan; experiment: string; variation: string }; onClose: () => void; onConfirm: (target: 'current' | 'new') => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const prior = document.activeElement; dialog.current?.showModal(); return () => { dialog.current?.close(); if (prior instanceof HTMLElement) prior.focus(); }; }, []);
  const plan = proposal.plan;
  const linkable = plan.method === 'url' || plan.method === 'preview-link';
  const tracking = 'tracking' in plan && (plan.tracking === 'disabled' || plan.tracking === 'counted') ? plan.tracking : 'unknown';
  return <dialog ref={dialog} class="ss-dialog" aria-labelledby="ss-preview-title" onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }} onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <span class="ss-eyebrow">Preview variation</span>
    <h2 id="ss-preview-title">{proposal.variation}</h2>
    <p>{proposal.experiment}</p>
    <p class="ss-muted">{plan.explanation}</p>
    <p class={'ss-note ' + (tracking === 'disabled' ? 'ss-note-ok' : 'ss-note-warn')}>{trackingText[tracking]}</p>
    <p class="ss-caption ss-muted">{linkable && /__splitscope_/.test((plan as any).url) ? 'This link needs Splitscope in the destination browser. ' : ''}Tabs share this browser's visitor cookies, so a new tab is not a separate visitor.</p>
    <div class="ss-actions ss-dialog-actions">
      {linkable && <CopyButton value={(plan as any).url} label="Copy preview link" />}
      <button class="ss-button" onClick={onClose}>Cancel</button>
      {linkable && <button class="ss-button" onClick={() => onConfirm('new')}>Open in new tab</button>}
      <button class="ss-button ss-primary" onClick={() => onConfirm('current')}>Preview in this tab</button>
    </div>
  </dialog>;
}
