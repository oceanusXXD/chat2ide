import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { RingBuffer } = require('../dist/server/terminal/ringBuffer.js');

test('RingBuffer keeps only recent chunks within byte budget', () => {
  const buffer = new RingBuffer(4);

  buffer.append('ab');
  buffer.append('cd');
  buffer.append('ef');

  assert.deepEqual(buffer.snapshot(), ['cd', 'ef']);
});

test('RingBuffer trims a single oversized chunk from the start', () => {
  const buffer = new RingBuffer(4);

  buffer.append('abcdef');

  assert.deepEqual(buffer.snapshot(), ['cdef']);
});

