import { normalizeDashboardLinks, type DashboardLinks } from '../dashboard-links';
import { sanitize } from '../sanitize';
export interface Assignment { key: string; name: string; status: string; variation?: string; value?: unknown }
export interface Workspace {
  name: string; notes: string; query: string; scope: string; platform: string; kind: string; selected: string | null;
  dashboardLinks?: DashboardLinks;
  pinned: string[]; baseline: { at: number; url: string; assignments: Assignment[] } | null;
}
export function emptyWorkspace(): Workspace { return { name: '', notes: '', query: '', scope: 'all', platform: 'all', kind: 'all', selected: null, pinned: [], baseline: null }; }
export function normalizeWorkspace(value: any): Workspace {
  const text = (value: unknown, limit = 200) => typeof value === 'string' ? value.slice(0, limit) : '';
  const base = emptyWorkspace(); if (!value || typeof value !== 'object') return base;
  return { dashboardLinks: normalizeDashboardLinks(value.dashboardLinks), name: text(value.name, 120), notes: text(value.notes, 10000), query: text(value.query), scope: ['all', 'active', 'other', 'pinned'].includes(value.scope) ? value.scope : 'all', platform: text(value.platform, 50) || 'all', kind: text(value.kind, 50) || 'all', selected: typeof value.selected === 'string' ? text(value.selected, 300) : null, pinned: Array.isArray(value.pinned) ? [...new Set<string>(value.pinned.filter((v: unknown) => typeof v === 'string').map((v: string) => v.slice(0, 300)))].slice(0, 100) : [], baseline: value.baseline && Number.isFinite(value.baseline.at) && Array.isArray(value.baseline.assignments) ? { at: value.baseline.at, url: String(sanitize(text(value.baseline.url, 20000))), assignments: value.baseline.assignments.slice(0, 500).filter((v: any) => v && typeof v.key === 'string' && typeof v.status === 'string').map((v: any) => ({ key: text(v.key, 300), name: text(v.name), status: text(v.status), variation: typeof v.variation === 'string' ? text(v.variation) : undefined, value: sanitize(v.value, 2000, 8) })) } : null };
}
