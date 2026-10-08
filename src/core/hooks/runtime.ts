import { variationChanges } from '../changes';
export { variationChanges } from '../changes';
import { sanitize } from '../sanitize';
import type { CapturedEvent, DataSource, DetectionResult, NormalizedChange, NormalizedExperiment, NormalizedVariation, PlatformId } from '../model';

export type AnyRecord = Record<string, any>;
export type RuntimeEmitter = (event: Omit<CapturedEvent, 'id' | 't'>) => void;

export interface PageAdapter {
  id: PlatformId;
  displayName: string;
  category: 'experimentation' | 'engagement';
  detect(): DetectionResult;
  listExperiments(): NormalizedExperiment[];
  install(helpers: HookHelpers): void;
  force?: (experimentId: string, variationId: string, pageUrl: string) => unknown;
}

export interface HookHelpers {
  emit: RuntimeEmitter;
  wrapQueue(name: string, platform: PlatformId, eventName?: (args: unknown[]) => string, category?: CapturedEvent['category']): void;
  wrapMethod(target: AnyRecord | undefined | (() => AnyRecord | undefined), method: string, platform: PlatformId, eventName?: (args: unknown[]) => string, category?: CapturedEvent['category'], observe?: (args: unknown[], result: unknown) => void): void;
  listen(name: string, handler: (event: Event) => void): void;
  clean(value: unknown): unknown;
  addExperiment(experiment: NormalizedExperiment): void;
  invalidate(platform: PlatformId): void;
  addCleanup(fn: () => void): void;
}

export function getPath(root: unknown, path: string): any {
  return path.split('.').reduce((value: any, key) => value?.[key], root as any);
}

export function isObject(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === 'object';
}

export function asArray<T = AnyRecord>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (isObject(value)) return Object.values(value) as T[];
  return [];
}

/** Map every entry independently so one malformed record cannot hide the rest of a platform's activities. */
export function mapSafely<T, R>(items: T[], fn: (item: T, index: number) => R | undefined | null): R[] {
  const output: R[] = [];
  items.forEach((item, index) => { try { const value = fn(item, index); if (value != null) output.push(value); } catch { /* skip the malformed record */ } });
  return output;
}

export function valueName(value: any, fallback: string): string {
  return typeof value?.name === 'string' && value.name ? value.name : fallback;
}

export function variationList(raw: any, options: { names?: any; weights?: any; changes?: (item: any, id: string) => NormalizedChange[] | undefined } = {}): NormalizedVariation[] {
  const values = Array.isArray(raw) ? raw.map((value, index) => [String(index), value] as const) : Object.entries(raw || {});
  return values.map(([key, variation]: any, index) => {
    const id = String(variation?.id ?? variation?.variationId ?? variation?.key ?? key);
    const name = String(variation?.name ?? options.names?.[id] ?? options.names?.[index] ?? `Variation ${index + 1}`);
    const weightValue = variation?.weight ?? variation?.trafficAllocation ?? variation?.traffic ?? options.weights?.[id] ?? options.weights?.[index];
    const weight = Number.isFinite(Number(weightValue)) ? Number(weightValue) : undefined;
    const changes = options.changes?.(variation, id) || variationChanges(variation);
    return { id, name, isControl: Boolean(variation?.isControl || variation?.control || /^(original|control|baseline)$/i.test(name.trim())), weight, changes, raw: sanitize(variation) };
  });
}

export function normalizedExperiment(input: Partial<NormalizedExperiment> & Pick<NormalizedExperiment, 'platform' | 'id'>): NormalizedExperiment {
  return {
    platform: input.platform,
    id: String(input.id),
    name: input.name || `Experiment ${input.id}`,
    kind: input.kind || 'other',
    status: input.status || 'unknown',
    statusReason: input.statusReason,
    evidence: input.evidence,
    variations: input.variations || [],
    changes: input.changes || variationChanges(input.raw),
    evaluatedValue: input.evaluatedValue,
    assignedVariationId: input.assignedVariationId,
    trafficAllocation: input.trafficAllocation,
    targeting: input.targeting,
    goals: input.goals,
    campaignId: input.campaignId,
    dashboardContext: input.dashboardContext,
    source: input.source || ['runtime-api' as DataSource],
    raw: sanitize(input.raw ?? {})
  };
}

export function detection(state: DetectionResult['state'], signals: string[], confidence = 1, version?: string): DetectionResult {
  return { state, signals, confidence, version };
}
