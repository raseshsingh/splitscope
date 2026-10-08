import { useEffect, useMemo, useState } from 'preact/hooks';
import { integrityFindings, type EnrichedWire } from '../../core/adobe-target/integrity';
import { targetFindings, type TargetFinding } from '../../core/adobe-target/findings';
import { isWire } from '../../core/adobe-target/capture';
import type { PageState } from '../../core/state';
export interface TargetData { records: EnrichedWire[]; config: Record<string, any>; findings: TargetFinding[] }
/** Wire captures (stored history plus live events), page configuration and findings. Shared by the Target section header and its views. */
export function useTargetData(state: PageState, onAction?: (payload: Record<string, unknown>) => Promise<any>, enabled = true): TargetData {
  const [history, setHistory] = useState<Array<{ id: string; properties: unknown }>>([]);
  useEffect(() => {
    if (!enabled) return; let active = true;
    void onAction?.({ action: 'captures' }).then(value => { if (active) setHistory(Array.isArray(value) ? value : []); }).catch(() => {});
    return () => { active = false; };
  }, [enabled]);
  return useMemo(() => {
    if (!enabled) return { records: [], config: {}, findings: [] };
    const merged = new Map([...history, ...state.events].map(e => [e.id, e.properties]));
    const records = [...merged.values()].filter(isWire).sort((a, b) => a.at - b.at).slice(-150) as EnrichedWire[];
    const config = (state.events.findLast(e => (e.properties as any)?.schema === 'target-config-v1')?.properties as any)?.config || {};
    const findings = [...targetFindings(records, { ...config, renderedRequestIds: state.events.filter(e => e.name === 'at-content-rendering-succeeded').map(e => (e.properties as any)?.requestId).filter(Boolean) }), ...integrityFindings(records, Date.now(), state.events.map(e => e.properties as any).filter(p => p?.schema === 'target-render-v1' && Array.isArray(p.served) && p.served.every((s: any) => typeof s?.ref === 'string')))];
    return { records, config, findings };
  }, [enabled, history, state.events]);
}
