/** Adobe Analytics and the general AEP SDK are not proof of Target. */
export function isTargetEndpoint(raw: string, base?: string): boolean {
  try {
    const url = new URL(raw, base);
    return /(^|\.)tt\.omtrdc\.net$/i.test(url.hostname) && /^\/(rest\/v1\/delivery|m2\/)/.test(url.pathname);
  } catch { return false; }
}
