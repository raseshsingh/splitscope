import { useState } from 'preact/hooks';
import type { NormalizedChange } from '../../core/model';
import { downloadFile } from '../../core/qa/export';
import { pretty } from '../../core/qa/presentation';
import { CopyButton, Disclosure, Icon, JsonTree } from '../shared/components';

export default function ChangeView({ change, owner, onHighlight }: { change: NormalizedChange; owner: string; onHighlight: (selector: string) => void }) {
  const [wrap, setWrap] = useState(true);
  return <Disclosure title={change.label || ({ js: 'JavaScript', css: 'CSS', html: 'HTML', attribute: 'Element attributes', redirect: 'Redirect', offer: 'Offer data', unknown: 'Change data' })[change.type]} meta={owner + (change.selector ? ' · ' + change.selector : '')}>
    {change.selector && <div class="ss-inline"><code class="ss-wrap">{change.selector}</code><button class="ss-button" onClick={() => onHighlight(change.selector!)}><Icon name="target" size={13} />Highlight</button></div>}
    {change.sourcePath && <p class="ss-caption ss-muted ss-wrap">Source: {change.sourcePath}</p>}
    {change.code ? <><div class="ss-actions ss-code-actions"><CopyButton value={change.code} label="Copy code" /><button class="ss-button ss-small" onClick={() => downloadFile(`splitscope-change.${['js', 'css', 'html'].includes(change.type) ? change.type : 'txt'}`, change.code!, 'text/plain')}>Save code</button><button class="ss-link" aria-pressed={wrap} onClick={() => setWrap(!wrap)}>{wrap ? 'Disable line wrap' : 'Wrap lines'}</button></div><pre class={'ss-code ss-source-code' + (wrap ? '' : ' ss-code-nowrap')} tabIndex={0} aria-label={`${change.type.toUpperCase()} source for ${owner}`}><code>{change.code}</code></pre></> : change.codeUnavailable ? <p class="ss-caption ss-muted">{change.codeUnavailable}. This runtime does not expose the function body.</p> : <><CopyButton value={pretty(change.content ?? change.data ?? change.url)} label="Copy change" /><JsonTree label="Change data" value={change.content ?? change.data ?? change.url} defaultOpen /></>}
  </Disclosure>;
}
