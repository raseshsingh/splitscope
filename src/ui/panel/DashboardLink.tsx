import type { NormalizedExperiment } from '../../core/model';
import { dashboardDestination } from '../../core/dashboard-links';
import { Icon } from '../shared/components';

/** `icon` sits on activity cards, `button` sits in the detail Actions row, `row` is the original text link. */
export function DashboardLink({ activity, variant = 'row' }: { activity: NormalizedExperiment; variant?: 'row' | 'icon' | 'button' }) {
  const destination = dashboardDestination(activity);
  if (!destination) return null;
  const label = `${destination.label} for ${activity.name} (new tab)`;
  if (variant === 'icon') return <div class="ss-dashboard-actions ss-dashboard-icon"><a class="ss-icon-button" href={destination.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" title={destination.label} aria-label={label}><Icon name="external" size={15} /></a></div>;
  if (variant === 'button') return <a class="ss-button" href={destination.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" title={destination.reason} aria-label={label}><Icon name="external" size={14} />{destination.label}</a>;
  return <div class="ss-dashboard-actions"><a class="ss-link" href={destination.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" title={destination.reason} aria-label={label}>{destination.label}<Icon name="external" size={13} /></a></div>;
}
