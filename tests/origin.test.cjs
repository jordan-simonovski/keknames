const { test } = require('node:test');
const assert = require('node:assert/strict');
const { allowedSocketOrigin } = require('../dist/server/origin');

test('WebSocket origins default to same host and reject hostile or malformed origins', () => {
  for (const origin of [
    'https://evil.example',
    'null',
    'file://game.example',
    'https://game.example.evil',
    'https://game.example/path',
  ]) {
    assert.equal(allowedSocketOrigin({ headers: { host: 'game.example', origin } }), false, origin);
  }
  assert.equal(allowedSocketOrigin({ headers: { host: 'game.example', origin: 'https://game.example' } }), true);
  assert.equal(allowedSocketOrigin({ headers: { host: 'game.example' } }), true);
});

test('explicit public origin supports reverse proxies without trusting forwarded headers', () => {
  assert.equal(
    allowedSocketOrigin({ headers: { host: 'internal:3000', origin: 'https://game.example' } }, 'https://game.example'),
    true,
  );
  assert.equal(
    allowedSocketOrigin(
      { headers: { host: 'internal:3000', origin: 'https://evil.example', 'x-forwarded-host': 'evil.example' } },
      'https://game.example',
    ),
    false,
  );
});
