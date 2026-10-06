import type { CapturedEvent } from '../model';
import { evaluateExpectations, normalizeExpectations, type CheckResult, type EventExpectation } from './expectations';
export interface CheckRun { startedAt: number; endedAt?: number; rules: EventExpectation[]; results: CheckResult[]; seen: string[]; interrupted: boolean }
export function startCheck(rules: EventExpectation[]): CheckRun {
  const snapshot = normalizeExpectations(JSON.parse(JSON.stringify(rules)));
  return { startedAt: Date.now(), rules: snapshot, results: snapshot.map(rule => ({ id: rule.id, name: rule.name, status: 'waiting', matches: 0, failures: [] })), seen: [], interrupted: false };
}
/** Accumulate results independently of the visible log; clearing it cannot erase failures. */
export function recordCheck(run: CheckRun | null, event: CapturedEvent): CheckRun | null {
  if (!run || run.endedAt || event.t < run.startedAt || run.seen.includes(event.id)) return run;
  const matches = evaluateExpectations(run.rules, [event], run.startedAt);
  if (!matches.some(result => result.matches)) return run;
  return { ...run, seen: [...run.seen.slice(-4999), event.id], results: run.results.map((prior, index) => {
    const next = matches[index]!;
    const failures = [...prior.failures, ...next.failures].slice(0, 20);
    const status = prior.status === 'failed' || next.status === 'failed' ? 'failed' : prior.status === 'unverifiable' || next.status === 'unverifiable' ? 'unverifiable' : prior.matches + next.matches ? 'passed' : 'waiting';
    return { ...prior, status, matches: prior.matches + next.matches, failures };
  }) };
}
export function finishCheck(run: CheckRun): CheckRun {
  return { ...run, endedAt: Date.now(), results: run.results.map(result => ({ ...result, status: result.status === 'waiting' ? 'not-observed' : result.status })) };
}
