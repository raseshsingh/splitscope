import type { ForcePlan, NormalizedExperiment, PlatformId } from '../model';
export interface PreviewRecord {
  platform: PlatformId; experimentId: string; variationId: string; experiment: string; variation: string;
  origin: string; startedAt: number; changes: Array<{ key: string; before: string[]; after: string[] }>;
  path?: { before: string; after: string };
  persistent: boolean;
}
export function createPreview(request: Omit<PreviewRecord, 'origin' | 'startedAt' | 'changes' | 'persistent' | 'path'>, plan: ForcePlan, current: string, previous?: PreviewRecord | null): PreviewRecord {
  const before = new URL(current), after = new URL('url' in plan ? plan.url : current);
  if (before.origin !== after.origin) throw new Error('Preview must stay on this site.');
  const changes = [...new Set([...before.searchParams.keys(), ...after.searchParams.keys()])].flatMap(key => {
    const a = before.searchParams.getAll(key), b = after.searchParams.getAll(key);
    return JSON.stringify(a) === JSON.stringify(b) ? [] : [{ key, before: a, after: b }];
  });
  if (previous?.origin === before.origin) {
    for (const prior of previous.changes) {
      const changed = changes.find(item => item.key === prior.key);
      if (JSON.stringify(before.searchParams.getAll(prior.key)) !== JSON.stringify(prior.after)) continue;
      if (changed) changed.before = prior.before; else changes.push(prior);
    }
  }
  const path = before.pathname !== after.pathname ? { before: previous?.path?.after === before.pathname ? previous.path.before : before.pathname, after: after.pathname } : previous?.origin === before.origin ? previous.path : undefined;
  return { ...request, path, origin: before.origin, startedAt: Date.now(), changes, persistent: ['vwo', 'kameleoon', 'convert'].includes(request.platform) };
}
export function resetPreviewUrl(record: PreviewRecord, current: string): string {
  const url = new URL(current);
  if (url.origin !== record.origin) throw new Error('Return to the preview site before resetting.');
  if (record.path && url.pathname === record.path.after) url.pathname = record.path.before;
  for (const change of record.changes) {
    // Preserve parameters subsequently changed by the user or site.
    if (JSON.stringify(url.searchParams.getAll(change.key)) !== JSON.stringify(change.after)) continue;
    url.searchParams.delete(change.key);
    for (const value of change.before) url.searchParams.append(change.key, value);
  }
  return url.href;
}
export function previewOutcome(record: PreviewRecord, activities: NormalizedExperiment[]): string {
  const activity = activities.find(item => item.platform === record.platform && item.id === record.experimentId);
  if (!activity || activity.status !== 'running-in') return 'Assignment unconfirmed on this page';
  if (activity.assignedVariationId === record.variationId) return 'Requested assignment observed';
  if (activity.assignedVariationId != null) return `Different assignment observed: ${activity.variations.find(v => v.id === activity.assignedVariationId)?.name || activity.assignedVariationId}` + (record.platform === 'optimizely' ? '. Optimizely has not confirmed this switch. Check that force variation parameters are enabled in the project’s Settings → Implementation, and that the requested variation is published.' : '');
  return 'Assignment unconfirmed on this page';
}
