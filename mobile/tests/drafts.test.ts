import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrafts, draftKey, DRAFT_MAX_AGE_MS } from '../src/drafts.ts';

function memory() {
  const map = new Map<string, string>();
  return { map, storage: { getItem: async (k: string) => map.get(k) ?? null, setItem: async (k: string, v: string) => { map.set(k, v); }, removeItem: async (k: string) => { map.delete(k); } } };
}

test('each form and target gets its own draft key', () => {
  const keys = [draftKey('service', {}), draftKey('service', { planId: 'p1' }), draftKey('service', { entryId: 'e1' }), draftKey('production', {})];
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(draftKey('service', { entryId: 'e1', planId: 'p1' }), draftKey('service', { entryId: 'e1' }));
});
test('drafts round-trip and clear', async () => {
  const { storage } = memory();
  const drafts = createDrafts(storage);
  await drafts.save('k', { attendance: '210' });
  assert.deepEqual(await drafts.load('k'), { attendance: '210' });
  await drafts.clear('k');
  assert.equal(await drafts.load('k'), null);
});
test('stale or corrupt drafts are dropped instead of restored', async () => {
  const { map, storage } = memory();
  let now = 1_000;
  const drafts = createDrafts(storage, () => now);
  await drafts.save('k', { a: 1 });
  now += DRAFT_MAX_AGE_MS + 1;
  assert.equal(await drafts.load('k'), null);
  assert.equal(map.has('k'), false);
  map.set('bad', '{not json');
  assert.equal(await drafts.load('bad'), null);
  map.set('old-shape', JSON.stringify({ attendance: '1' }));
  assert.equal(await drafts.load('old-shape'), null);
});
test('a storage failure never breaks the form', async () => {
  const failing = { getItem: async () => { throw new Error('full'); }, setItem: async () => { throw new Error('full'); }, removeItem: async () => { throw new Error('full'); } };
  const drafts = createDrafts(failing);
  assert.equal(await drafts.load('k'), null);
  await drafts.save('k', {});
  await drafts.clear('k');
});
