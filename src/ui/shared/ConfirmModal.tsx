import { useEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
/** Small confirmation dialog used for destructive or replacing actions. Escape and Cancel both dismiss it. */
export default function ConfirmModal({ title, children, confirm, cancel = 'Cancel', danger = false, busy = false, onConfirm, onCancel }: { title: string; children: ComponentChildren; confirm: string; cancel?: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const prior = document.activeElement; const node = dialog.current;
    if (node) { if (typeof node.showModal === 'function') node.showModal(); else node.setAttribute('open', ''); }
    return () => { if (node && typeof node.close === 'function') node.close(); if (prior instanceof HTMLElement) prior.focus(); };
  }, []);
  return <dialog ref={dialog} class="ss-dialog" aria-labelledby="ss-confirm-title" onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }} onCancel={event => { event.preventDefault(); onCancel(); }}>
    <h2 id="ss-confirm-title">{title}</h2><div class="ss-dialog-body">{children}</div>
    <div class="ss-actions ss-dialog-actions"><button class="ss-button" disabled={busy} onClick={onCancel}>{cancel}</button><button class={'ss-button ' + (danger ? 'ss-danger-fill' : 'ss-primary')} disabled={busy} onClick={onConfirm}>{confirm}</button></div>
  </dialog>;
}
