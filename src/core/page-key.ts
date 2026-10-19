/**
 * The identity of "this page" for activity evidence: origin plus path. Hash changes (anchor links) and query
 * changes (UTM or consent parameter cleanup through replaceState) do not make a new page.
 */
export function pageKey(href: string = (globalThis as any).location?.href ?? ''): string {
  try { const url = new URL(href); return url.origin + url.pathname; } catch { return href; }
}
export function samePage(a: string | undefined, b: string | undefined = (globalThis as any).location?.href): boolean {
  return a != null && b != null && pageKey(a) === pageKey(b);
}
