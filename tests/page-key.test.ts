import test from 'node:test';
import assert from 'node:assert/strict';
import { pageKey, samePage } from '../src/core/page-key';
test('A page is its origin and path: hash and query changes are the same page, a new path is not', () => {
  assert.equal(pageKey('https://shop.test/cart?utm_source=x#top'), 'https://shop.test/cart');
  assert.ok(samePage('https://shop.test/cart?utm_source=x', 'https://shop.test/cart#reviews'));
  assert.ok(!samePage('https://shop.test/cart', 'https://shop.test/checkout'));
  assert.ok(!samePage('https://a.test/cart', 'https://b.test/cart'));
  assert.equal(pageKey('not a url'), 'not a url');
  assert.ok(!samePage(undefined, 'https://shop.test/'));
});
