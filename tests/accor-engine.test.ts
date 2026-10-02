import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { queueKameleoonPreview } from '../src/core/hooks/kameleoon-preview';

// Optional compatibility check against a separately downloaded public engine.
// Extract only assignVariation; do not execute the website or its tracking code.
test('Accor public engine assignment implementation accepts the preview override', { skip: !process.env.SPLITSCOPE_KAMELEOON_ENGINE }, () => {
  const source = readFileSync(process.env.SPLITSCOPE_KAMELEOON_ENGINE!, 'utf8');
  const marker = 'this.assignVariation=';
  const start = source.indexOf(marker);
  assert.ok(start >= 0);
  const end = source.indexOf(';this.block=', start);
  assert.ok(end > start);
  let writes = 0;
  const campaign = { id: 42, registeredVariationId: 1, writeLocalData() { writes++; } };
  const api = runInNewContext(`({assignVariation: ${source.slice(start + marker.length, end)}})`, { t: () => [campaign], Kameleoon: { Internals: { runtime: {} } } }, { timeout: 1000 });
  api.getById = () => ({ variations: [{ id: 1 }, { id: 2 }], associatedVariation: { id: campaign.registeredVariationId } });
  api.assignVariation(42, 2);
  assert.equal(campaign.registeredVariationId, 1, 'previous implementation silently keeps the old assignment');
  let navigated = false;
  const win: any = { Kameleoon: { API: { Experiments: api } } };
  queueKameleoonPreview(win, '42:2', 'https://all.accor.com/a/en.html', () => { navigated = true; }, (_, error) => { if (error) throw error; });
  win.kameleoonQueue[0]();
  assert.equal(campaign.registeredVariationId, 2); assert.equal(writes, 1); assert.equal(navigated, true);
});
