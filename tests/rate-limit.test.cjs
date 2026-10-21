const { test } = require('node:test');
const assert = require('node:assert/strict');
const { windowLimiter } = require('../dist/server/rate-limit');

test('address budget persists across sockets, resets after a window, and bounds memory', (t) => {
  let now = 100;
  t.mock.method(Date, 'now', () => now);
  const allow = windowLimiter(2, 1000, 2);
  assert.equal(allow('a'), true);
  assert.equal(allow('a'), true);
  assert.equal(allow('a'), false);
  assert.equal(allow('b'), true);
  assert.equal(allow('c'), false);
  now += 1000;
  assert.equal(allow('c'), true);
  assert.equal(allow('a'), true);
});
