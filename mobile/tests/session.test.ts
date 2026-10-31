import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeClaims, isExpired, nextStep, parseSession } from '../src/session.ts';

const token = (claims: object) => ['e30', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'sig'].join('.');
const now = Date.UTC(2026, 9, 31, 12);
const inMinutes = (minutes: number) => Math.floor(now / 1000) + minutes * 60;

test('claims decode, including non-ASCII names', () => {
  assert.deepEqual(decodeClaims(token({ email: 'josé@example.com', exp: 1 })), { email: 'josé@example.com', exp: 1 });
  assert.equal(decodeClaims('not-a-token'), null);
  assert.equal(decodeClaims('a.%%%.c'), null);
});
test('tokens count as expired a minute early, or when exp is missing', () => {
  assert.equal(isExpired(token({ exp: inMinutes(10) }), now), false);
  assert.equal(isExpired(token({ exp: inMinutes(0.5) }), now), true);
  assert.equal(isExpired(token({}), now), true);
});
test('the next step uses, refreshes, or asks to sign in', () => {
  const fresh = token({ exp: inMinutes(10) }), stale = token({ exp: inMinutes(-1) });
  assert.equal(nextStep(null, now), 'sign-in');
  assert.equal(nextStep({ idToken: fresh }, now), 'use');
  assert.equal(nextStep({ idToken: stale, refreshToken: 'r' }, now), 'refresh');
  assert.equal(nextStep({ idToken: stale, refreshToken: null }, now), 'sign-in');
});
test('stored sessions are parsed defensively', () => {
  assert.deepEqual(parseSession('{"idToken":"a.b.c","refreshToken":"r"}'), { idToken: 'a.b.c', refreshToken: 'r' });
  assert.deepEqual(parseSession('{"idToken":"a.b.c"}'), { idToken: 'a.b.c', refreshToken: null });
  for (const raw of [null, '', 'not json', '{"idToken":5}', 'null']) assert.equal(parseSession(raw), null);
});
