import { classifyTarget } from './adobe-target/wire';
/** Adobe Analytics and the general AEP SDK are not proof of Target. */
export function isTargetEndpoint(raw: string, base?: string): boolean {
  try {
    const url = new URL(raw, base);
    return ['atjs1', 'atjs2'].includes(classifyTarget(url.href) || '');
  } catch { return false; }
}
