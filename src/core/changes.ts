import type { NormalizedChange } from './model';
import { sanitize } from './sanitize';
import { functionSource } from './function-source';

/** Read data properties only. Getters and custom conversion methods are never invoked. */
function own(value: any, key: string): any {
  try { const descriptor = value != null ? Object.getOwnPropertyDescriptor(value, key) : undefined; return descriptor && 'value' in descriptor ? descriptor.value : undefined; } catch { return undefined; }
}
function members(value: unknown): Array<[string, unknown]> {
  if (!value || typeof value !== 'object') return [];
  try { return Object.keys(value).slice(0, 500).map(key => [key, own(value, key)]); } catch { return []; }
}
const jsFields = ['code', 'js', 'javascript', 'customCode', 'customJs', 'customJS', 'jsCode', 'javaScriptCode', 'custom_code', 'globalCode', 'globalJs'];
const containers = ['actions', 'changes', 'options'];

/** Extract only change containers and explicit code fields, never unrelated SDK methods or other variations. */
export function variationChanges(raw: unknown): NormalizedChange[] | undefined {
  const result: NormalizedChange[] = [];
  const seen = new WeakSet<object>();
  let visited = 0;
  const addCode = (value: unknown, type: NormalizedChange['type'], path: string, selector?: string) => {
    if (typeof value !== 'string' && typeof value !== 'function') return;
    const text = typeof value === 'function' ? functionSource(value) : value;
    if (!text) return;
    const unavailable = /^\[Function(?:\s|\])/.test(text);
    result.push({ type, sourcePath: path, selector, ...(unavailable ? { codeUnavailable: text } : { code: String(sanitize(text)) }) });
  };
  const visit = (value: unknown, path: string, depth: number, change = false, inheritedSelector?: string) => {
    if (++visited > 2000 || depth > 12 || result.length >= 200 || value == null) return;
    if (typeof value === 'function' || typeof value === 'string') { addCode(value, 'js', path, inheritedSelector); return; }
    if (typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) { for (const [key, child] of members(value)) visit(child, `${path}[${key}]`, depth + 1, change, inheritedSelector); return; }
    const selector = typeof own(value, 'selector') === 'string' ? own(value, 'selector') : inheritedSelector;
    const type = String(own(value, 'type') || own(value, 'action') || '').toLowerCase().replace(/[-_]/g, '');
    const schema = own(value, 'schema');
    // AEP proposition items keep their actual offer under data.
    const data = own(value, 'data');
    if (typeof schema === 'string' && /\/personalization\//.test(schema) && data) {
      if (schema.endsWith('/html-content-item')) addCode(own(data, 'content'), 'html', path + '.data.content', selector);
      else if (schema.endsWith('/dom-action')) visit(data, path + '.data', depth + 1, true, selector);
      else result.push({ type: 'offer', sourcePath: path, data: sanitize(data) });
      return;
    }
    const start = result.length;
    const html = /html|appendcontent|prependcontent|replacecontent|insertbefore|insertafter|setcontent/.test(type);
    const css = /css|style/.test(type);
    const js = /javascript|customcode|script|^js$/.test(type);
    const language = html ? 'html' : css ? 'css' : 'js';
    for (const field of jsFields) {
      const source = own(value, field);
      if (source && typeof source === 'object') addCode(own(source, 'code'), language, `${path}.${field}.code`, selector);
      else addCode(source, language, `${path}.${field}`, selector);
    }
    for (const field of ['css', 'customCss', 'customCSS', 'custom_css']) addCode(own(value, field), 'css', `${path}.${field}`, selector);
    addCode(own(value, 'html'), 'html', path + '.html', selector);
    if (html || css || js) {
      for (const field of ['value', 'content']) addCode(own(value, field), language, `${path}.${field}`, selector);
    }
    // Target actions offers contain a list of rendering operations in content.
    if (type === 'actions' || type === 'action') visit(own(value, 'content'), path + '.content', depth + 1, true, selector);
    const attributes = own(value, 'attributes');
    if (attributes) {
      addCode(own(attributes, 'html'), 'html', path + '.attributes.html', selector);
      result.push({ type: 'attribute', sourcePath: path + '.attributes', selector, data: sanitize(attributes) });
    }
    if (type.includes('redirect')) {
      const url = own(value, 'url') ?? own(value, 'value') ?? own(value, 'content');
      if (typeof url === 'string') result.push({ type: 'redirect', sourcePath: path, url, selector });
    }
    for (const key of containers) {
      const nested = own(value, key);
      if (!nested) continue;
      if (typeof nested === 'function' || typeof nested === 'string' || Array.isArray(nested)) visit(nested, `${path}.${key}`, depth + 1, true, selector);
      else if (typeof nested === 'object') {
        const single = ['type', 'action', 'changes', 'code', 'value', 'content'].some(field => own(nested, field) !== undefined);
        if (single) visit(nested, `${path}.${key}`, depth + 1, true, selector);
        else for (const [id, child] of members(nested)) visit(child, `${path}.${key}[${id}]`, depth + 1, true, selector);
      }
    }
    if (change && result.length === start) result.push({ type: type === 'json' ? 'offer' : 'unknown', label: type || 'Change data', selector, sourcePath: path, data: sanitize(value) });
  };
  visit(raw, 'definition', 0);
  if (visited > 2000 || result.length >= 200) result.push({ type: 'unknown', label: 'Additional change definitions omitted', data: 'The change inspection limit was reached.' });
  return result.length ? mergeChanges(result) : undefined;
}

export function mergeChanges(...groups: Array<NormalizedChange[] | undefined>): NormalizedChange[] | undefined {
  const seen = new Set<string>();
  const result = groups.flatMap(group => group || []).filter(change => {
    const key = JSON.stringify([change.type, change.selector, change.code, change.codeUnavailable, change.url, change.data]);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  return result.length ? result.slice(0, 201) : undefined;
}
