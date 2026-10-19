/**
 * Explain an Optimizely audience against what the browser can see right now.
 * This is an investigation aid. Optimizely makes the real decision, and conditions that depend on
 * data Splitscope cannot read (location, device, IP, custom JavaScript) stay "unknown".
 */
export type Tri = boolean | null;
export interface ConditionNode { label: string; result: Tri; op?: 'and' | 'or' | 'not'; children?: ConditionNode[]; note?: string }
export interface AudienceEnv { search: string; href: string; referrer: string; language: string; cookies: Record<string, string> }
/** Visitor attributes keyed by every identifier we know for them (ID, API name, display name). */
export type AttributeValues = Record<string, unknown>;

function tri(values: Tri[], op: 'and' | 'or' | 'not'): Tri {
  if (op === 'not') return values[0] == null ? null : !values[0];
  if (op === 'and') return values.includes(false) ? false : values.includes(null) ? null : true;
  return values.includes(true) ? true : values.includes(null) ? null : false;
}

function compare(actual: unknown, expected: unknown, match: string | undefined): Tri {
  try {
    if (match === 'exists') return actual != null && actual !== '';
    if (actual == null) return false;
    const a = String(actual), e = String(expected ?? '');
    switch (match) {
      case undefined: case 'exact': return a === e;
      case 'substring': case 'simple': return a.toLowerCase().includes(e.toLowerCase());
      case 'regex': return new RegExp(e).test(a);
      case 'gt': return Number(actual) > Number(expected);
      case 'lt': return Number(actual) < Number(expected);
      case 'ge': return Number(actual) >= Number(expected);
      case 'le': return Number(actual) <= Number(expected);
      default: return null;
    }
  } catch { return null; }
}

const text = (value: unknown) => typeof value === 'string' ? JSON.stringify(value) : String(value);
const hidden = (value: unknown) => typeof value === 'string' && /^\[(redacted|email|payload truncated)\]$/.test(value);

function leaf(node: Record<string, any>, attrs: AttributeValues, env: AudienceEnv, haveAttributes: boolean): ConditionNode {
  const type = String(node.type || 'condition');
  const match: string | undefined = typeof node.match === 'string' ? node.match : undefined;
  const name = node.name == null ? '' : String(node.name);
  const phrase = `${match ?? 'is'} ${node.value === undefined ? '' : text(node.value)}`.trim();
  let actual: unknown, known = true, label: string;
  switch (type) {
    case 'custom_attribute': label = `Attribute ${name}`; actual = attrs[name]; known = haveAttributes; break;
    case 'query': label = `URL parameter ${name}`; actual = new URLSearchParams(env.search).get(name) ?? undefined; break;
    case 'cookie': label = `Cookie ${name}`; actual = env.cookies[name]; break;
    case 'referrer': label = 'Referrer'; actual = env.referrer; break;
    case 'url': label = 'URL'; actual = env.href; break;
    case 'language': label = 'Browser language'; actual = env.language; break;
    default: return { label: `${type.replace(/_/g, ' ')}${name ? ' ' + name : ''} ${phrase}`.trim(), result: null, note: 'Splitscope cannot read this value from the page.' };
  }
  if (hidden(actual)) return { label: `${label} ${phrase}`, result: null, note: 'The current value is redacted, so this cannot be checked.' };
  const result = actual === undefined && !known ? null : compare(actual, node.value, match);
  const note = result === null && !known ? 'Visitor attributes are not exposed on this page.' : actual === undefined ? 'No value found.' : `Current value: ${text(actual)}`;
  return { label: `${label} ${phrase}`, result, note };
}

export function evaluateConditions(input: unknown, attrs: AttributeValues, env: AudienceEnv, haveAttributes = true, depth = 0): ConditionNode {
  let node = input;
  if (typeof node === 'string') { const trimmed = node.trim(); try { node = trimmed ? JSON.parse(trimmed) : null; } catch { return { label: 'Conditions could not be read', result: null, note: trimmed.slice(0, 200) }; } }
  if (node == null || (Array.isArray(node) && node.length === 0)) return { label: 'Everyone', result: true };
  if (depth > 12) return { label: 'Nested too deeply', result: null };
  if (Array.isArray(node)) {
    const first = typeof node[0] === 'string' ? node[0].toLowerCase() : '';
    const op = (['and', 'or', 'not'].includes(first) ? first : 'or') as 'and' | 'or' | 'not';
    const items = ['and', 'or', 'not'].includes(first) ? node.slice(1) : node;
    const children = items.map(item => evaluateConditions(item, attrs, env, haveAttributes, depth + 1));
    return { label: op === 'and' ? 'All of' : op === 'or' ? 'Any of' : 'None of', op, result: tri(children.map(child => child.result), op), children };
  }
  if (typeof node === 'object') return leaf(node as Record<string, any>, attrs, env, haveAttributes);
  return { label: String(node), result: null };
}

/** Experiment level audiences are OR'ed. No audiences means everyone qualifies. */
export function evaluateAudiences(audiences: Array<{ id: string; name: string; conditions: unknown }>, attrs: AttributeValues, env: AudienceEnv, haveAttributes = true): { result: Tri; audiences: Array<{ id: string; name: string; tree: ConditionNode }> } {
  const results = audiences.map(audience => ({ id: audience.id, name: audience.name, tree: evaluateConditions(audience.conditions, attrs, env, haveAttributes) }));
  return { result: results.length ? tri(results.map(item => item.tree.result), 'or') : true, audiences: results };
}

export function pageAudienceEnv(): AudienceEnv {
  const cookies: Record<string, string> = {};
  try { for (const part of document.cookie.split(';')) { const at = part.indexOf('='); if (at > 0) cookies[part.slice(0, at).trim()] = part.slice(at + 1).trim(); } } catch {}
  const g = globalThis as any;
  return { search: g.location?.search ?? '', href: g.location?.href ?? '', referrer: g.document?.referrer ?? '', language: g.navigator?.language ?? '', cookies };
}
