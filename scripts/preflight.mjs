#!/usr/bin/env node
import fs from 'fs';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import process from 'process';

const require = createRequire(import.meta.url);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = {
  ...parseEnvFile(path.join(rootDir, '.env')),
  ...parseEnvFile(path.join(rootDir, '.env.local')),
  ...process.env,
};

const PTY_PROBE_SCRIPT = `
const pty = require('node-pty');
const command = process.env.CHAT2IDE_PREFLIGHT_PTY_COMMAND;
const args = JSON.parse(process.env.CHAT2IDE_PREFLIGHT_PTY_ARGS || '[]');
const cwd = process.env.CHAT2IDE_PREFLIGHT_CWD || process.cwd();
const child = pty.spawn(command, args, {
  name: 'xterm-256color',
  cols: 80,
  rows: 24,
  cwd,
  env: {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
  },
});
const timeout = setTimeout(() => {
  try {
    child.kill();
  } catch {}
  process.exit(2);
}, 2500);
child.onExit(() => {
  clearTimeout(timeout);
  process.exit(0);
});
`;

const checks = [];
let ptyModule = null;
let codexArgs = [];

check('Node.js version is supported', () => {
  const major = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
  return major >= 16;
}, `current: ${process.version}, required: >=16.20.0`);

check('node-pty can be loaded', () => {
  try {
    ptyModule = require('node-pty');
    return true;
  } catch {
    return false;
  }
}, 'run npm install if this fails');

const pinConfigured = Boolean(trim(env.APP_PIN) || trim(env.APP_PIN_HASH));
check('APP_PIN or APP_PIN_HASH is configured', () => pinConfigured);

const cwd = path.resolve(
  trim(env.CODEX_CWD) ||
    trim(env.DEFAULT_TERMINAL_CWD) ||
    trim(env.CODEX_WORKDIR) ||
    process.cwd(),
);
check('CODEX_CWD points to an existing directory', () => {
  const stats = fs.statSync(cwd, { throwIfNoEntry: false });
  return Boolean(stats?.isDirectory());
}, cwd);

const codexCommand = trim(env.CODEX_COMMAND) || 'codex';
check('CODEX_ARGS format is valid', () => {
  codexArgs = parseArgs(trim(env.CODEX_ARGS) || trim(env.CODEX_ARGS_JSON));
  return true;
}, 'use JSON array syntax when arguments contain spaces');

check('CODEX_COMMAND can be executed', () => {
  const probe = process.platform === 'win32' ? ['where', codexCommand] : ['sh', '-lc', `command -v ${shellQuote(codexCommand)}`];
  const result = spawnSync(probe[0], probe.slice(1), {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return result.status === 0;
}, codexCommand);

check('node-pty can spawn a probe shell', () => {
  if (!ptyModule) {
    return false;
  }
  const probe =
    process.platform === 'win32'
      ? { command: 'cmd.exe', args: ['/d', '/s', '/c', 'exit', '0'] }
      : { command: 'sh', args: ['-lc', 'exit 0'] };
  const result = spawnSync(process.execPath, ['-e', PTY_PROBE_SCRIPT], {
    cwd: rootDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      CHAT2IDE_PREFLIGHT_CWD: cwd,
      CHAT2IDE_PREFLIGHT_PTY_COMMAND: probe.command,
      CHAT2IDE_PREFLIGHT_PTY_ARGS: JSON.stringify(probe.args),
    },
    stdio: 'pipe',
    timeout: 5000,
  });
  return result.status === 0;
}, 'checks the PTY runtime without starting the configured CLI');

if (trim(env.APP_PUBLIC_ORIGIN)) {
  check('APP_PUBLIC_ORIGIN is a valid http(s) URL', () => {
    try {
      const url = new URL(trim(env.APP_PUBLIC_ORIGIN));
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }, trim(env.APP_PUBLIC_ORIGIN));
}

const failed = checks.filter((item) => !item.ok);
for (const item of checks) {
  const prefix = item.ok ? '[ok]' : '[fail]';
  const detail = item.detail ? ` (${item.detail})` : '';
  console.log(`${prefix} ${item.name}${detail}`);
}

if (failed.length > 0) {
  console.error(`\nPreflight failed: ${failed.length} check(s) need attention.`);
  process.exit(1);
}

console.log('\nPreflight passed. The server prerequisites look usable.');

function check(name, predicate, detail = '') {
  let ok = false;
  try {
    ok = Boolean(predicate());
  } catch {
    ok = false;
  }
  checks.push({
    name,
    ok,
    detail,
  });
}

function trim(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const values = {};
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const normalized = line.startsWith('export ')
      ? line.slice('export '.length).trim()
      : line;
    const separatorIndex = normalized.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }
    const key = normalized.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }
    values[key] = parseEnvValue(normalized.slice(separatorIndex + 1).trim());
  }
  return values;
}

function parseEnvValue(value) {
  if (!value) {
    return '';
  }
  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
    const inner = value.slice(1, -1);
    if (quote === '"') {
      return inner
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t');
    }
    return inner;
  }
  return value;
}

function parseArgs(value) {
  const trimmed = trim(value);
  if (!trimmed) {
    return [];
  }

  if (!trimmed.startsWith('[')) {
    return trimmed.split(/\s+/).filter(Boolean);
  }

  const parsed = JSON.parse(trimmed);
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
    throw new Error('CODEX_ARGS must be a whitespace-separated string or a JSON string array');
  }
  return parsed;
}

function shellQuote(value) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
