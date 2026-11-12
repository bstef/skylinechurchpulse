import test from 'node:test';
import assert from 'node:assert/strict';
import { biometryLabel, LOCK_AFTER_MS, lockOnLaunch, lockOnReturn, lockSettingFrom } from '../src/lock.ts';

const on = { enabled: true, available: true, signedIn: true };

test('a restored session locks at launch, a fresh sign-in does not', () => {
  assert.equal(lockOnLaunch(on, true), true);
  assert.equal(lockOnLaunch(on, false), false);
});
test('nothing locks when the setting is off, biometrics are unavailable or nobody is signed in', () => {
  for (const inputs of [{ ...on, enabled: false }, { ...on, available: false }, { ...on, signedIn: false }]) {
    assert.equal(lockOnLaunch(inputs, true), false);
    assert.equal(lockOnReturn(inputs, 0, LOCK_AFTER_MS * 10), false);
  }
});
test('returning locks only after five minutes away', () => {
  const left = 1_000_000;
  assert.equal(lockOnReturn(on, left, left + LOCK_AFTER_MS - 1), false);
  assert.equal(lockOnReturn(on, left, left + LOCK_AFTER_MS), true);
  assert.equal(lockOnReturn(on, null, left), false);
});
test('the setting defaults to on and biometry is named for the hardware', () => {
  assert.equal(lockSettingFrom(null), true);
  assert.equal(lockSettingFrom('on'), true);
  assert.equal(lockSettingFrom('off'), false);
  assert.equal(biometryLabel([2]), 'Face ID');
  assert.equal(biometryLabel([1]), 'Touch ID');
  assert.equal(biometryLabel([1, 2]), 'Face ID');
  assert.equal(biometryLabel([]), 'your passcode');
});
