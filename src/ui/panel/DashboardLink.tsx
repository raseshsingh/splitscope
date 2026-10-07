import type { NormalizedExperiment } from '../../core/model';
import { dashboardDestination } from '../../core/dashboard-links';
import { Icon } from '../shared/components';

export function DashboardLink({ activity }: { activity: NormalizedExperiment }) {
  const destination = dashboardDestination(activity);
  if (!destination) return null;
  return <div class="ss-dashboard-actions"><a class="ss-link" href={destination.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" title={destination.reason} aria-label={`${destination.label} for ${activity.name} (new tab)`}>{destination.label}<Icon name="external" size={13} /></a></div>;
}
