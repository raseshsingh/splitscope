import type { CapturedEvent } from '../model';
import type { PageState } from '../state';
import { sanitize } from '../sanitize';
import { activityStatus, kindNames, platformNames } from './presentation';
export function createReport(state: PageState, notes: string) {
  return { exportedAt: new Date().toISOString(), page: sanitize({ url: state.url, title: state.page.title }), notes: sanitize(notes), limitations: 'Browser observations only. Active means reported active by the platform; it does not prove a visible DOM change. Missing events may predate capture. An API call does not confirm delivery.', platforms: state.platforms.map(({ id, displayName, result }) => ({ id, name: displayName, state: result.state, signals: result.signals })), activities: state.experiments.map(({ raw, ...item }) => sanitize(item)), events: state.events.map((event) => sanitize(event)) };
}
export function markdownReport(state: PageState, notes: string): string {
  const escape = (value: unknown) => String(sanitize(value) ?? '').replace(/[\r\n|]/g, ' ');
  return ['# Splitscope QA report', '', 'Captured: ' + new Date().toISOString(), 'Page: ' + escape(state.url), '', '## Notes', escape(notes) || 'No notes.', '', '## Activities', '| Activity | Platform | Type | Status | Assigned variation |', '| --- | --- | --- | --- | --- |', ...state.experiments.map((item) => '| ' + [item.name + ' (' + item.id + ')', platformNames[item.platform], kindNames[item.kind], activityStatus(item), item.assignedVariationId || 'Not exposed'].map(escape).join(' | ') + ' |'), '', '## Events', ...state.events.map((event) => '- ' + new Date(event.t).toISOString() + ' · ' + escape(platformNames[event.platform]) + ' · ' + escape(event.name) + ' · ' + escape(event.via)), '', '## Scope', 'Browser observations only. Active status does not prove visible changes. API calls do not confirm delivery. Event payloads are available in the JSON export.'].join('\n');
}
export function eventsCsv(events: CapturedEvent[]): string {
  const cell = (value: unknown) => '"' + String(value ?? '').replace(/"/g, '""').replace(/^([=+@-])/, "'$1") + '"';
  return [['time', 'platform', 'category', 'event', 'source', 'properties'], ...events.map((event) => [new Date(event.t).toISOString(), event.platform, event.category, event.name, event.via, JSON.stringify(sanitize(event.properties))])].map((row) => row.map(cell).join(',')).join('\r\n');
}
export function downloadFile(filename: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
