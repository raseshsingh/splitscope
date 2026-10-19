import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitize, redactText } from '../src/core/sanitize';

const redactedKeys: Array<[string, unknown]> = [
  ['password', 'hunter2'], ['api_key', 'k-123'], ['apiKey', 'k-123'], ['client_secret', 's'], ['session_id', 'abc'], ['sessionId', 'abc'],
  ['access_token', 't'], ['Authorization', 'Bearer x'], ['cookie', 'a=b'], ['email', 'a@b.co'], ['phone', '+1 555'], ['firstName', 'Ada'],
  ['last_name', 'Lovelace'], ['street', '1 Main St'], ['address', '1 Main St'], ['postalCode', '10001'], ['birthDate', '1990-01-01'], ['card_number', '4111'],
  ['private_key', 'pk'], ['credentials', 'c'], ['external_id', 'x'],
];
test('secret and personal fields are redacted by name', () => {
  for (const [key, value] of redactedKeys) assert.equal((sanitize({ [key]: value }) as any)[key], '[redacted]', key);
});

const keptKeys: Array<[string, unknown]> = [
  ['name', 'Hero test'], ['experimentId', '123'], ['variationId', '456'], ['customCode', 'console.log(1)'], ['visitorId', 'v1'], ['tntId', 't1'],
  ['marketingCloudVisitorId', 'm1'], ['className', 'hero banner'], ['classname', 'x'], ['username_hint', 'shown'], ['selector', '.hero'], ['status', 'running'], ['revenue', 9.5], ['code', 'k-visitor'],
];
test('experiment and identity fields used by the panel are kept', () => {
  for (const [key, value] of keptKeys) assert.deepEqual((sanitize({ [key]: value }) as any)[key], value, key);
});

const strings: Array<[string, RegExp, RegExp]> = [
  ['contact ada@example.com today', /\[email\]/, /ada@example/],
  ['https://x.test/?email=ada%40example.com&q=1', /\[email\]|email=\[redacted\]/, /ada%40example/],
  ['https://x.test/cb#access_token=abc123&state=1', /access_token=\[redacted\]/, /abc123/],
  ['https://x.test/?api_key=AKIA123&page=2', /api_key=\[redacted\]&page=2/, /AKIA123/],
  ['https://x.test/?session_id=S1&x=1', /session_id=\[redacted\]/, /=S1/],
  ['Authorization: Bearer abcdefghijklmnop', /Bearer \[redacted\]/, /abcdefghijklmnop/],
  ['token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.c2lnbmF0dXJl here', /\[jwt\]/, /eyJhbGci/],
];
test('secrets inside string values are redacted', () => {
  for (const [input, present, absent] of strings) { const out = redactText(input); assert.match(out, present, input); assert.doesNotMatch(out, absent, input); }
});

test('header pairs keep the name and drop the value', () => {
  const out = sanitize({ headers: [['Authorization', 'Basic dXNlcjpwYXNzd29yZA=='], ['Content-Type', 'application/json']] }) as any;
  assert.deepEqual(out.headers[0], ['Authorization', '[redacted]']);
  assert.deepEqual(out.headers[1], ['Content-Type', 'application/json']);
});
