import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const {
  addCommandToHistory,
  chooseAdjacentTerminalId,
  formatCompactCount,
  getNextCommandHistoryValue,
  getPreviousCommandHistoryValue,
  summarizeTerminals,
} = require('../dist/shared/terminalState.js');

test('chooseAdjacentTerminalId selects the next tab, then the previous tab', () => {
  const terminals = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  assert.equal(chooseAdjacentTerminalId(terminals, 'b'), 'c');
  assert.equal(chooseAdjacentTerminalId(terminals, 'c'), 'b');
  assert.equal(chooseAdjacentTerminalId([{ id: 'a' }], 'a'), null);
});

test('summarizeTerminals counts statuses and unread output', () => {
  const stats = summarizeTerminals(
    [
      { status: 'running' },
      { status: 'starting' },
      { status: 'running' },
      { status: 'error' },
    ],
    {
      a: 2,
      b: 0,
      c: 4,
      d: -1,
    },
  );

  assert.deepEqual(stats, {
    error: 1,
    running: 2,
    starting: 1,
    stopped: 0,
    total: 4,
    unread: 6,
  });
});

test('addCommandToHistory trims, deduplicates, and keeps the newest entries', () => {
  assert.deepEqual(addCommandToHistory([], '   '), []);
  assert.deepEqual(addCommandToHistory(['npm test'], 'npm test'), ['npm test']);
  assert.deepEqual(addCommandToHistory(['a', 'b', 'c'], ' b ', 3), ['a', 'c', 'b']);
  assert.deepEqual(addCommandToHistory(['a', 'b', 'c'], 'd', 3), ['b', 'c', 'd']);
});

test('command history navigation preserves and restores the active draft', () => {
  const history = ['npm test', 'npm run build'];

  const previous = getPreviousCommandHistoryValue(history, null, '', 'git status');
  assert.deepEqual(previous, {
    cursor: 1,
    draft: 'git status',
    value: 'npm run build',
  });

  const older = getPreviousCommandHistoryValue(history, previous.cursor, previous.draft, previous.value);
  assert.deepEqual(older, {
    cursor: 0,
    draft: 'git status',
    value: 'npm test',
  });

  const newer = getNextCommandHistoryValue(history, older.cursor, older.draft, older.value);
  assert.deepEqual(newer, {
    cursor: 1,
    draft: 'git status',
    value: 'npm run build',
  });

  const draft = getNextCommandHistoryValue(history, newer.cursor, newer.draft, newer.value);
  assert.deepEqual(draft, {
    cursor: null,
    draft: '',
    value: 'git status',
  });
});

test('formatCompactCount caps noisy unread badges', () => {
  assert.equal(formatCompactCount(0), '0');
  assert.equal(formatCompactCount(7), '7');
  assert.equal(formatCompactCount(101), '99+');
});
