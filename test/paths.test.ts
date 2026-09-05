import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, test } from 'node:test';
import { dataDirectory } from '../src/paths.js';

const originalOverride = process.env.CODEX_SIDECAR_DATA;
const originalLocalAppData = process.env.LOCALAPPDATA;

function setEnvironment(name: 'CODEX_SIDECAR_DATA' | 'LOCALAPPDATA', value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  setEnvironment('CODEX_SIDECAR_DATA', originalOverride);
  setEnvironment('LOCALAPPDATA', originalLocalAppData);
});

test('default data directory is outside AppData and independent of MSIX-local views', () => {
  delete process.env.CODEX_SIDECAR_DATA;
  const expected = join(homedir(), '.codex-sidecar');
  const localViews = [
    join(homedir(), 'AppData', 'Local'),
    join(homedir(), 'AppData', 'Local', 'Packages', 'OpenAI.Codex_example', 'LocalCache', 'Local'),
    resolve('different-local-appdata'),
  ];
  for (const localView of localViews) {
    process.env.LOCALAPPDATA = localView;
    assert.equal(dataDirectory(), expected);
  }
});

test('default stays the same when LOCALAPPDATA is missing or the override is empty', () => {
  delete process.env.LOCALAPPDATA;
  delete process.env.CODEX_SIDECAR_DATA;
  assert.equal(dataDirectory(), join(homedir(), '.codex-sidecar'));
  process.env.CODEX_SIDECAR_DATA = '';
  assert.equal(dataDirectory(), join(homedir(), '.codex-sidecar'));
});

test('explicit absolute and relative data overrides remain honored', () => {
  process.env.LOCALAPPDATA = resolve('unrelated-appdata');
  const absolute = join(homedir(), 'sidecar-explicit-test-data');
  process.env.CODEX_SIDECAR_DATA = absolute;
  assert.equal(dataDirectory(), resolve(absolute));
  process.env.CODEX_SIDECAR_DATA = 'sidecar-relative-test-data';
  assert.equal(dataDirectory(), resolve('sidecar-relative-test-data'));
});
