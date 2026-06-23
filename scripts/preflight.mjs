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
const warnings = [];
let ptyModule = null;
let codexArgs = [];
let terminalProfiles = [];

check('Node.js version is supported', () => {
  return isNodeVersionAtLeast(20, 19, 0);
}, `current: ${process.version}, required: >=20.19.0`);

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

if (trim(env.APP_PIN_HASH)) {
  check('APP_PIN_HASH format is valid', () => isValidPinHash(trim(env.APP_PIN_HASH)));
}

warn(
  'APP_PIN is still the env.example default; use APP_PIN_HASH for production',
  trim(env.APP_PIN) === '123456',
);

warn(
  'APP_PUBLIC_ORIGIN is not configured; production WebSocket origin checks are weaker',
  !trim(env.APP_PUBLIC_ORIGIN) && !trim(env.APP_BASE_URL),
);

const bridgeToken = trim(env.APP_BRIDGE_TOKEN) ||
  trim(env.CHAT2IDE_BRIDGE_TOKEN) ||
  trim(env.BRIDGE_TOKEN);
let bridgeClients = [];

check('APP_BRIDGE_CLIENTS format is valid', () => {
  bridgeClients = parseBridgeClients(
    trim(env.APP_BRIDGE_CLIENTS) || trim(env.CHAT2IDE_BRIDGE_CLIENTS),
  );
  return true;
}, 'optional JSON array of scoped direct-client bridge tokens');

warn(
  'APP_BRIDGE_TOKEN and APP_BRIDGE_CLIENTS are not configured; /bridge direct client integration is disabled',
  !bridgeToken && bridgeClients.length === 0,
);

if (bridgeToken) {
  check(
    'APP_BRIDGE_TOKEN is at least 32 bytes',
    () => Buffer.byteLength(bridgeToken, 'utf8') >= 32,
    'use a high-entropy secret for IDE/client bridge access',
  );
}

for (const client of bridgeClients) {
  check(`bridge client ${client.id} token is at least 32 bytes`, () => {
    return Buffer.byteLength(client.token, 'utf8') >= 32;
  }, 'use a high-entropy per-client companion token');
}

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
  return canExecuteCommand(codexCommand);
}, codexCommand);

check('TERMINAL_PROFILES format is valid', () => {
  terminalProfiles = parseTerminalProfiles(
    trim(env.TERMINAL_PROFILES) || trim(env.CHAT2IDE_TERMINAL_PROFILES),
    cwd,
  );
  return true;
}, 'optional JSON array of extra CLI launch profiles');

check('TERMINAL_ALLOWED_CWD_ROOTS format is valid', () => {
  const roots = parseAllowedCwdRoots(
    trim(env.TERMINAL_ALLOWED_CWD_ROOTS) ||
      trim(env.APP_TERMINAL_ALLOWED_CWD_ROOTS),
    cwd,
    terminalProfiles,
  );
  return roots.length >= 0;
}, 'optional path-delimited allowlist of terminal cwd roots');

for (const profile of terminalProfiles) {
  check(`profile ${profile.id} cwd exists`, () => {
    const stats = fs.statSync(profile.cwd, { throwIfNoEntry: false });
    return Boolean(stats?.isDirectory());
  }, profile.cwd);

  check(`profile ${profile.id} command can be executed`, () => {
    return canExecuteCommand(profile.command);
  }, profile.command);
}

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

for (const name of [
  'APP_PORT',
  'APP_SESSION_TTL_HOURS',
  'APP_LOGIN_MAX_ATTEMPTS',
  'APP_LOGIN_LOCKOUT_SECONDS',
  'APP_LOGIN_ATTEMPT_WINDOW_SECONDS',
  'TERMINAL_DEFAULT_COLS',
  'TERMINAL_DEFAULT_ROWS',
  'TERMINAL_BUFFER_BYTES',
  'TERMINAL_BUFFER_KB',
  'TERMINAL_MAX_SESSIONS',
  'TERMINAL_MAX_INPUT_BYTES',
  'APP_WS_MAX_BUFFERED_BYTES',
  'APP_BRIDGE_MAX_SESSIONS',
  'APP_BRIDGE_STOPPED_SESSION_TTL_MINUTES',
  'APP_WS_MAX_MESSAGE_BYTES',
]) {
  if (trim(env[name])) {
    check(`${name} is a positive integer`, () => isPositiveInteger(trim(env[name])));
  }
}

const failed = checks.filter((item) => !item.ok);
for (const item of checks) {
  const prefix = item.ok ? '[ok]' : '[fail]';
  const detail = item.detail ? ` (${item.detail})` : '';
  console.log(`${prefix} ${item.name}${detail}`);
}

for (const item of warnings) {
  console.log(`[warn] ${item}`);
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

function warn(message, condition) {
  if (condition) {
    warnings.push(message);
  }
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

function parseTerminalProfiles(value, defaultCwd) {
  const trimmed = trim(value);
  if (!trimmed) {
    return [];
  }

  const parsed = JSON.parse(trimmed);
  if (!Array.isArray(parsed)) {
    throw new Error('TERMINAL_PROFILES must be a JSON array');
  }

  const profiles = [];
  const seen = new Set(['codex']);
  for (let index = 0; index < parsed.length; index += 1) {
    const item = parsed[index];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`TERMINAL_PROFILES[${index}] must be an object`);
    }
    const id = trim(item.id);
    if (!/^[a-z0-9][a-z0-9_.-]{0,47}$/i.test(id)) {
      throw new Error(`TERMINAL_PROFILES[${index}].id is invalid`);
    }
    if (seen.has(id)) {
      throw new Error(`duplicate terminal profile id: ${id}`);
    }
    seen.add(id);

    const command = trim(item.command);
    if (!command) {
      throw new Error(`TERMINAL_PROFILES[${index}].command is required`);
    }

    profiles.push({
      id,
      command,
      args: parseProfileArgs(item.args, index),
      cwd: path.resolve(trim(item.cwd) || defaultCwd),
    });
  }
  return profiles;
}

function parseProfileArgs(value, index) {
  if (value === undefined || value === null) {
    return [];
  }
  if (typeof value === 'string') {
    return parseArgs(value);
  }
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value;
  }
  throw new Error(`TERMINAL_PROFILES[${index}].args must be a string or string array`);
}

function parseAllowedCwdRoots(value, defaultCwd, profiles) {
  const trimmed = trim(value);
  const candidates = trimmed
    ? trimmed.split(path.delimiter).filter((item) => item.trim())
    : [defaultCwd, ...profiles.map((profile) => profile.cwd)];
  const roots = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate.trim());
    const stats = fs.statSync(resolved, { throwIfNoEntry: false });
    if (!stats || !stats.isDirectory()) {
      throw new Error(`allowed cwd root does not exist: ${resolved}`);
    }
    if (seen.has(resolved)) {
      continue;
    }
    seen.add(resolved);
    roots.push(resolved);
  }
  return roots;
}

function parseBridgeClients(value) {
  const trimmed = trim(value);
  if (!trimmed) {
    return [];
  }

  const parsed = JSON.parse(trimmed);
  if (!Array.isArray(parsed)) {
    throw new Error('APP_BRIDGE_CLIENTS must be a JSON array');
  }

  const clients = [];
  const seen = new Set();
  for (let index = 0; index < parsed.length; index += 1) {
    const item = parsed[index];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`APP_BRIDGE_CLIENTS[${index}] must be an object`);
    }

    const id = trim(item.id);
    if (!/^[a-z0-9][a-z0-9_.-]{0,47}$/i.test(id)) {
      throw new Error(`APP_BRIDGE_CLIENTS[${index}].id is invalid`);
    }
    if (seen.has(id)) {
      throw new Error(`duplicate bridge client id: ${id}`);
    }
    seen.add(id);

    const token = trim(item.token);
    if (!token) {
      throw new Error(`APP_BRIDGE_CLIENTS[${index}].token is required`);
    }

    clients.push({
      id,
      token,
    });
  }
  return clients;
}

function isNodeVersionAtLeast(requiredMajor, requiredMinor, requiredPatch) {
  const [major = 0, minor = 0, patch = 0] = process.versions.node
    .split('.')
    .map((part) => Number.parseInt(part, 10));
  if (major !== requiredMajor) {
    return major > requiredMajor;
  }
  if (minor !== requiredMinor) {
    return minor > requiredMinor;
  }
  return patch >= requiredPatch;
}

function isPositiveInteger(value) {
  return /^[1-9]\d*$/.test(value);
}

function isValidPinHash(value) {
  const parts = value.includes('$') ? value.split('$') : value.split(':');
  return (
    parts.length === 3 &&
    parts[0] === 'scrypt' &&
    isEvenHex(parts[1]) &&
    isEvenHex(parts[2])
  );
}

function isEvenHex(value) {
  return Boolean(value) && value.length % 2 === 0 && /^[0-9a-f]+$/i.test(value);
}

function canExecuteCommand(command) {
  const candidate = trim(command);
  if (!candidate) {
    return false;
  }

  if (candidate.includes('/') || candidate.includes('\\') || path.isAbsolute(candidate)) {
    return isExecutableFile(candidate);
  }

  const pathValue = process.env.PATH || '';
  const extensions = process.platform === 'win32'
    ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';')
    : [''];

  for (const entry of pathValue.split(path.delimiter)) {
    if (!entry) {
      continue;
    }
    for (const extension of extensions) {
      const executablePath = path.join(entry, `${candidate}${extension}`);
      if (isExecutableFile(executablePath)) {
        return true;
      }
    }
  }
  return false;
}

function isExecutableFile(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}
