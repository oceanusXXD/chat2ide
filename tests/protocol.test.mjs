import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { parseBridgeClientMessage } = require('../dist/shared/protocol.js');

test('parseBridgeClientMessage accepts trimmed bridge hello messages', () => {
  assert.deepEqual(
    parseBridgeClientMessage(
      JSON.stringify({
        type: 'hello',
        clientId: ' desktop-ide ',
        name: ' Desktop IDE ',
        description: ' Local plugin ',
        protocolVersion: 1,
        capabilities: [' input ', 'resize', ''],
      }),
    ),
    {
      type: 'hello',
      clientId: 'desktop-ide',
      name: 'Desktop IDE',
      description: 'Local plugin',
      protocolVersion: 1,
      capabilities: ['input', 'resize'],
    },
  );
});

test('parseBridgeClientMessage keeps nullable bridge status details', () => {
  assert.deepEqual(
    parseBridgeClientMessage(
      JSON.stringify({
        type: 'session_status',
        externalId: ' main ',
        status: 'stopped',
        lastError: null,
        lastExitCode: null,
        lastExitSignal: null,
      }),
    ),
    {
      type: 'session_status',
      externalId: 'main',
      status: 'stopped',
      lastError: null,
      lastExitCode: null,
      lastExitSignal: null,
    },
  );
});

test('parseBridgeClientMessage rejects invalid bridge payloads', () => {
  assert.equal(parseBridgeClientMessage('{'), undefined);
  assert.equal(
    parseBridgeClientMessage(
      JSON.stringify({
        type: 'session_upsert',
        externalId: 'main',
        name: '',
      }),
    ),
    undefined,
  );
  assert.equal(
    parseBridgeClientMessage(
      JSON.stringify({
        type: 'session_status',
        externalId: 'main',
        status: 'paused',
      }),
    ),
    undefined,
  );
});
