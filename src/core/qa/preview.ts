import type { ForcePlan, NormalizedExperiment, PlatformId } from '../model';
export interface PreviewRecord {
  platform: PlatformId; experimentId: string; variationId: string; experiment: string; variation: string;
  origin: string; startedAt: number; changes: Array<{ key: string; before: string[]; after: string[] }>;
  persistent: boolean;
}
export function createPreview(request: Omit<PreviewRecord, 'origin' | 'startedAt' | 'changes' | 'persistent'>, plan: ForcePlan, current: string): PreviewRecord {
  const before = new URL(current), after = new URL('url' in plan ? plan.url : current);
  if (before.origin !== after.origin) throw new Error('Preview must stay on this site.');
  const changes = [...new Set([...before.searchParams.keys(), ...after.searchParams.keys()])].flatMap(key => {
    const a = before.searchParams.getAll(key), b = after.searchParams.getAll(key);
    return JSON.stringify(a) === JSON.stringify(b) ? [] : [{ key, before: a, after: b }];
  });
  return { ...request, origin: before.origin, startedAt: Date.now(), changes, persistent: ['vwo', 'kameleoon', 'convert'].includes(request.platform) };
}
export function resetPreviewUrl(record: PreviewRecord, current: string): string {
  const url = new URL(current);
  if (url.origin !== record.origin) throw new Error('Return to the preview site before resetting.');
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
  if (activity.assignedVariationId != null) return `Different assignment observed: ${activity.variations.find(v => v.id === activity.assignedVariationId)?.name || activity.assignedVariationId}`;
  return 'Assignment unconfirmed on this page';
}
