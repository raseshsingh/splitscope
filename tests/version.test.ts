import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXTENSION_BUILD } from '../src/core/extension/messages';

test('one version everywhere', () => {
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  assert.equal(EXTENSION_BUILD, version, 'EXTENSION_BUILD in core/extension/messages.ts');
  assert.equal(lock.version, version, 'package-lock.json');
  assert.equal(lock.packages?.['']?.version, version, 'package-lock.json root package');
  assert.match(readFileSync('wxt.config.ts', 'utf8'), new RegExp(`version: '${version.replaceAll('.', '\\.')}'`), 'wxt.config.ts manifest version');
  assert.match(readFileSync('README.md', 'utf8'), new RegExp(`\\*\\*Current version:\\*\\* ${version.replaceAll('.', '\\.')}`), 'README current version');
  assert.equal(/^## (\S+)/m.exec(readFileSync('CHANGELOG.md', 'utf8'))?.[1], version, 'newest CHANGELOG entry');
});
