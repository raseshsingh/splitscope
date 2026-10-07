import type { Browser } from 'wxt/browser';

export const BRIDGE_PROTOCOL = 3;
export const EXTENSION_BUILD = '0.1.12';
export function errorText(error: unknown): string {
  try {
    // Native extension errors can cross execution contexts; instanceof is unreliable.
    if (error && typeof error === 'object' && typeof (error as any).message === 'string') return `${(error as any).name || 'Error'}: ${(error as any).message}`;
  } catch {}
  if (typeof error === 'string') return error;
  try { return JSON.stringify(error) || 'Unknown error'; } catch { return 'Unserializable error'; }
}
export function unwrapReply<T = any>(reply: any): T {
  if (reply && typeof reply.__splitscopeError === 'string') throw new Error(reply.__splitscopeError);
  return reply as T;
}

// Explicit callback replies work throughout our supported Chrome range.
// Do not rely on Promise-returning onMessage listeners being enabled.
export function messageListener(
  accepts: (message: any) => boolean,
  handle: (message: any, sender: Browser.runtime.MessageSender) => unknown,
) {
  return (message: any, sender: Browser.runtime.MessageSender, respond: (reply?: any) => void): boolean => {
    try { if (!accepts(message)) return false; } catch { return false; }
    const reply = (value: unknown) => { try { respond(value); } catch { /* Sender navigated or its context was replaced. */ } };
    Promise.resolve().then(() => handle(message, sender)).then(
      // null is meaningful for absent records (journeys, previews, tab state).
      // Only handlers with no return value receive a generic acknowledgement.
      value => reply(value === undefined ? { ok: true } : value),
      error => reply({ __splitscopeError: errorText(error) }),
    );
    return true;
  };
}
