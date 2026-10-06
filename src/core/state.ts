import type { CapturedEvent, DetectionRecord, NormalizedExperiment } from './model';

export interface ConnectionHealth { background: 'connecting' | 'connected' | 'unavailable'; page: 'waiting' | 'connected' | 'outdated'; lastSnapshot?: number; backgroundDiagnostics?: unknown[] }
export interface PageState {
  connection?: ConnectionHealth;
  preview?: import('./qa/preview').PreviewRecord | null;
  url: string;
  capturedAt: number;
  platforms: DetectionRecord[];
  experiments: NormalizedExperiment[];
  events: CapturedEvent[];
  page: { title: string; referrer: string; readyState: string };
  statuses: Array<Record<string, unknown>>;
}

export function emptyPageState(url: string): PageState {
  return { url, capturedAt: Date.now(), platforms: [], experiments: [], events: [], page: { title: '', referrer: '', readyState: 'loading' }, statuses: [] };
}
