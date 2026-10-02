import type { Capabilities, NormalizedExperiment } from '../model';
export function activityDetails(activity: NormalizedExperiment, capabilities?: Capabilities) {
  const changes = [
    ...(activity.changes || []).map(change => ({ change, owner: 'Activity code' })),
    ...activity.variations.flatMap(variation => (variation.changes || []).map(change => ({ change, owner: variation.name })))
  ];
  const targeting = Object.values(activity.targeting || {}).some(value => value?.length);
  const classic = activity.platform === 'optimizely' && (activity.raw as any)?.runtime === 'classic';
  const switchable = Boolean(!classic && capabilities && !['none', 'preview-link'].includes(capabilities.forceVariation) && activity.variations.length && !(activity.platform === 'kameleoon' && activity.kind !== 'ab'));
  return { changes, targeting, switchable, tabs: ['overview', ...(changes.length ? ['changes'] : []), ...(targeting ? ['targeting'] : []), ...(capabilities?.events ? ['events'] : []), 'raw'] };
}
