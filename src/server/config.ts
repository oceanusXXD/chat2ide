import fs from 'fs';
import path from 'path';

export interface PinSource {
  plainPin?: string;
  pinHash?: string;
}

export type CookieSecureMode = 'auto' | 'always' | 'never';

export interface TerminalProfileConfig {
  id: string;
  name: string;
  description?: string;
  command: string;
  args: string[];
  cwd: string;
  isDefault: boolean;
}

export interface BridgeClientConfig {
  id: string;
  name?: string;
  description?: string;
  token: string;
}

export interface AppConfig {
  host: string;
  port: number;
  publicOrigin?: string;
  trustProxy: boolean;
  auth: {
    cookieName: string;
    cookieSecure: CookieSecureMode;
    sessionTtlMs: number;
    maxFailedAttempts: number;
    lockoutMs: number;
    attemptWindowMs: number;
    pinSource: PinSource;
  };
  terminal: {
    defaultCwd: string;
    defaultCols: number;
    defaultRows: number;
    bufferBytes: number;
    maxSessions: number;
    maxInputBytes: number;
    codexCommand: string;
    codexArgs: string[];
    defaultProfileId: string;
    allowedCwdRoots: string[];
    profiles: TerminalProfileConfig[];
  };
  bridge: {
    clients: BridgeClientConfig[];
    enabled: boolean;
    maxSessions: number;
    stoppedSessionTtlMs: number;
    token?: string;
  };
  ws: {
    maxBufferedBytes: number;
    maxPayloadBytes: number;
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const runtimeEnv = mergeRuntimeEnv(env);
  const publicOrigin = normalizePublicOrigin(
    firstDefined(runtimeEnv, 'APP_PUBLIC_ORIGIN', 'APP_BASE_URL'),
  );
  const defaultCwd = path.resolve(
    firstDefined(
      runtimeEnv,
      'CODEX_CWD',
      'DEFAULT_TERMINAL_CWD',
      'CODEX_WORKDIR',
    ) ||
      process.cwd(),
  );
  const pinSource: PinSource = {
    plainPin: emptyToUndefined(firstDefined(runtimeEnv, 'APP_PIN')),
    pinHash: emptyToUndefined(firstDefined(runtimeEnv, 'APP_PIN_HASH')),
  };
  const bridgeToken = emptyToUndefined(
    firstDefined(
      runtimeEnv,
      'APP_BRIDGE_TOKEN',
      'CHAT2IDE_BRIDGE_TOKEN',
      'BRIDGE_TOKEN',
    ),
  );
  const profiles = buildTerminalProfiles(runtimeEnv, defaultCwd);
  const bridgeClients = parseBridgeClients(
    firstDefined(runtimeEnv, 'APP_BRIDGE_CLIENTS', 'CHAT2IDE_BRIDGE_CLIENTS'),
  );

  if (!pinSource.plainPin && !pinSource.pinHash) {
    throw new Error('必须设置 APP_PIN 或 APP_PIN_HASH');
  }
  validatePinHash(pinSource.pinHash);
  validateBridgeToken(bridgeToken);
  for (const client of bridgeClients) {
    validateBridgeToken(client.token, `APP_BRIDGE_CLIENTS client ${client.id} token`);
  }

  return {
    host: firstDefined(runtimeEnv, 'APP_HOST', 'HOST') || '127.0.0.1',
    port: readPositiveInt(
      firstDefined(runtimeEnv, 'APP_PORT', 'PORT'),
      3000,
      'APP_PORT',
    ),
    publicOrigin,
    trustProxy: readBoolean(
      firstDefined(runtimeEnv, 'APP_TRUST_PROXY', 'TRUST_PROXY'),
      true,
    ),
    auth: {
      cookieName:
        firstDefined(runtimeEnv, 'APP_COOKIE_NAME', 'SESSION_COOKIE_NAME') ||
        'chat2ide_session',
      cookieSecure: readCookieSecureMode(
        firstDefined(runtimeEnv, 'APP_COOKIE_SECURE'),
      ),
      sessionTtlMs:
        readPositiveInt(
          firstDefined(
            runtimeEnv,
            'APP_SESSION_TTL_HOURS',
            'SESSION_TTL_HOURS',
          ),
          24,
          'APP_SESSION_TTL_HOURS',
        ) *
        60 *
        60 *
        1000,
      maxFailedAttempts: readPositiveInt(
        firstDefined(
          runtimeEnv,
          'APP_LOGIN_MAX_ATTEMPTS',
          'LOGIN_MAX_ATTEMPTS',
          'LOGIN_MAX_FAILURES',
        ),
        5,
        'APP_LOGIN_MAX_ATTEMPTS',
      ),
      lockoutMs: readLockoutMs(runtimeEnv),
      attemptWindowMs:
        readPositiveInt(
          firstDefined(
            runtimeEnv,
            'APP_LOGIN_ATTEMPT_WINDOW_SECONDS',
            'LOGIN_ATTEMPT_WINDOW_SECONDS',
          ),
          600,
          'APP_LOGIN_ATTEMPT_WINDOW_SECONDS',
        ) * 1000,
      pinSource,
    },
    terminal: {
      defaultCwd,
      defaultCols: readPositiveInt(
        firstDefined(
          runtimeEnv,
          'TERMINAL_DEFAULT_COLS',
          'DEFAULT_TERMINAL_COLS',
        ),
        120,
        'TERMINAL_DEFAULT_COLS',
      ),
      defaultRows: readPositiveInt(
        firstDefined(
          runtimeEnv,
          'TERMINAL_DEFAULT_ROWS',
          'DEFAULT_TERMINAL_ROWS',
        ),
        32,
        'TERMINAL_DEFAULT_ROWS',
      ),
      bufferBytes: readBufferBytes(runtimeEnv),
      maxSessions: readPositiveInt(
        firstDefined(runtimeEnv, 'TERMINAL_MAX_SESSIONS', 'APP_MAX_TERMINALS'),
        8,
        'TERMINAL_MAX_SESSIONS',
      ),
      maxInputBytes: readPositiveInt(
        firstDefined(runtimeEnv, 'TERMINAL_MAX_INPUT_BYTES'),
        64 * 1024,
        'TERMINAL_MAX_INPUT_BYTES',
      ),
      codexCommand: firstDefined(runtimeEnv, 'CODEX_COMMAND') || 'codex',
      codexArgs: parseArgs(
        firstDefined(runtimeEnv, 'CODEX_ARGS', 'CODEX_ARGS_JSON'),
      ),
      defaultProfileId: 'codex',
      allowedCwdRoots: readAllowedCwdRoots(runtimeEnv, profiles),
      profiles,
    },
    bridge: {
      clients: bridgeClients,
      enabled: Boolean(bridgeToken) || bridgeClients.length > 0,
      maxSessions: readPositiveInt(
        firstDefined(runtimeEnv, 'APP_BRIDGE_MAX_SESSIONS', 'BRIDGE_MAX_SESSIONS'),
        8,
        'APP_BRIDGE_MAX_SESSIONS',
      ),
      stoppedSessionTtlMs:
        readPositiveInt(
          firstDefined(
            runtimeEnv,
            'APP_BRIDGE_STOPPED_SESSION_TTL_MINUTES',
            'BRIDGE_STOPPED_SESSION_TTL_MINUTES',
          ),
          60,
          'APP_BRIDGE_STOPPED_SESSION_TTL_MINUTES',
        ) *
        60 *
        1000,
      token: bridgeToken,
    },
    ws: {
      maxBufferedBytes: readPositiveInt(
        firstDefined(runtimeEnv, 'APP_WS_MAX_BUFFERED_BYTES'),
        1024 * 1024,
        'APP_WS_MAX_BUFFERED_BYTES',
      ),
      maxPayloadBytes: readPositiveInt(
        firstDefined(runtimeEnv, 'APP_WS_MAX_MESSAGE_BYTES'),
        128 * 1024,
        'APP_WS_MAX_MESSAGE_BYTES',
      ),
    },
  };
}

function buildTerminalProfiles(
  env: NodeJS.ProcessEnv,
  defaultCwd: string,
): TerminalProfileConfig[] {
  const defaultCommand = firstDefined(env, 'CODEX_COMMAND') || 'codex';
  const defaultArgs = parseArgs(firstDefined(env, 'CODEX_ARGS', 'CODEX_ARGS_JSON'));
  const defaultProfile: TerminalProfileConfig = {
    id: 'codex',
    name: firstDefined(env, 'TERMINAL_DEFAULT_PROFILE_NAME') || 'Codex CLI',
    description:
      firstDefined(env, 'TERMINAL_DEFAULT_PROFILE_DESCRIPTION') ||
      'Default server-side coding CLI',
    command: defaultCommand,
    args: defaultArgs,
    cwd: defaultCwd,
    isDefault: true,
  };
  const customProfiles = parseTerminalProfiles(
    firstDefined(env, 'TERMINAL_PROFILES', 'CHAT2IDE_TERMINAL_PROFILES'),
    defaultCwd,
  );

  const profiles = [defaultProfile, ...customProfiles];
  const seen = new Set<string>();
  for (const profile of profiles) {
    if (seen.has(profile.id)) {
      throw new Error(`TERMINAL_PROFILES 包含重复 profile id: ${profile.id}`);
    }
    seen.add(profile.id);
  }
  return profiles;
}

function parseTerminalProfiles(
  value: string | undefined,
  defaultCwd: string,
): TerminalProfileConfig[] {
  const trimmed = value?.trim();
  if (!trimmed) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(
      `TERMINAL_PROFILES 必须是 JSON 数组: ${
        error instanceof Error ? error.message : 'parse failed'
      }`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error('TERMINAL_PROFILES 必须是 JSON 数组');
  }

  return parsed.map((item, index) =>
    normalizeTerminalProfile(item, index, defaultCwd),
  );
}

function normalizeTerminalProfile(
  item: unknown,
  index: number,
  defaultCwd: string,
): TerminalProfileConfig {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error(`TERMINAL_PROFILES[${index}] 必须是对象`);
  }

  const record = item as Record<string, unknown>;
  const id = readProfileString(record.id, `TERMINAL_PROFILES[${index}].id`);
  if (!/^[a-z0-9][a-z0-9_.-]{0,47}$/i.test(id)) {
    throw new Error(
      `TERMINAL_PROFILES[${index}].id 只能包含字母、数字、点、下划线和连字符`,
    );
  }

  const name =
    readOptionalProfileString(record.name) ||
    readOptionalProfileString(record.label) ||
    id;
  const command = readProfileString(
    record.command,
    `TERMINAL_PROFILES[${index}].command`,
  );
  const args = normalizeProfileArgs(record.args, index);
  const cwd = normalizeProfileCwd(record.cwd, defaultCwd, index);
  const description = readOptionalProfileString(record.description);

  return {
    id,
    name,
    description,
    command,
    args,
    cwd,
    isDefault: false,
  };
}

function normalizeProfileArgs(value: unknown, index: number): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (typeof value === 'string') {
    return parseArgs(value);
  }
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value;
  }
  throw new Error(`TERMINAL_PROFILES[${index}].args 必须是字符串或字符串数组`);
}

function normalizeProfileCwd(
  value: unknown,
  fallback: string,
  index: number,
): string {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  const resolved = path.resolve(raw);
  const stats = fs.statSync(resolved, { throwIfNoEntry: false });
  if (!stats || !stats.isDirectory()) {
    throw new Error(`TERMINAL_PROFILES[${index}].cwd 不存在: ${resolved}`);
  }
  return resolved;
}

function readAllowedCwdRoots(
  env: NodeJS.ProcessEnv,
  profiles: TerminalProfileConfig[],
): string[] {
  const configured = firstDefined(
    env,
    'TERMINAL_ALLOWED_CWD_ROOTS',
    'APP_TERMINAL_ALLOWED_CWD_ROOTS',
  );
  const rawRoots = configured
    ? configured.split(path.delimiter).filter((item) => item.trim())
    : profiles.map((profile) => profile.cwd);
  const roots = rawRoots.map((root, index) => {
    const resolved = path.resolve(root.trim());
    const stats = fs.statSync(resolved, { throwIfNoEntry: false });
    if (!stats || !stats.isDirectory()) {
      throw new Error(`TERMINAL_ALLOWED_CWD_ROOTS[${index}] 不存在: ${resolved}`);
    }
    return resolved;
  });
  return [...new Set(roots)];
}

function parseBridgeClients(value: string | undefined): BridgeClientConfig[] {
  const trimmed = value?.trim();
  if (!trimmed) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(
      `APP_BRIDGE_CLIENTS 必须是 JSON 数组: ${
        error instanceof Error ? error.message : 'parse failed'
      }`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error('APP_BRIDGE_CLIENTS 必须是 JSON 数组');
  }

  const clients = parsed.map((item, index) => normalizeBridgeClient(item, index));
  const seen = new Set<string>();
  for (const client of clients) {
    if (seen.has(client.id)) {
      throw new Error(`APP_BRIDGE_CLIENTS 包含重复 client id: ${client.id}`);
    }
    seen.add(client.id);
  }
  return clients;
}

function normalizeBridgeClient(item: unknown, index: number): BridgeClientConfig {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error(`APP_BRIDGE_CLIENTS[${index}] 必须是对象`);
  }

  const record = item as Record<string, unknown>;
  const id = readProfileString(record.id, `APP_BRIDGE_CLIENTS[${index}].id`);
  if (!/^[a-z0-9][a-z0-9_.-]{0,47}$/i.test(id)) {
    throw new Error(
      `APP_BRIDGE_CLIENTS[${index}].id 只能包含字母、数字、点、下划线和连字符`,
    );
  }

  return {
    id: id.toLowerCase(),
    name: readOptionalProfileString(record.name),
    description: readOptionalProfileString(record.description),
    token: readProfileString(record.token, `APP_BRIDGE_CLIENTS[${index}].token`),
  };
}

function readProfileString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} 不能为空`);
  }
  return value.trim();
}

function readOptionalProfileString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function mergeRuntimeEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  // Load .env first; real environment variables still win.
  const fileValues: NodeJS.ProcessEnv = {};
  for (const candidate of resolveEnvFileCandidates()) {
    if (!fs.existsSync(candidate)) {
      continue;
    }
    Object.assign(fileValues, parseEnvFile(fs.readFileSync(candidate, 'utf8')));
  }
  return {
    ...fileValues,
    ...env,
  };
}

function resolveEnvFileCandidates(): string[] {
  const roots = [path.resolve(__dirname, '../..'), process.cwd()];
  const orderedCandidates: string[] = [];
  const seen = new Set<string>();

  for (const root of roots) {
    for (const name of ['.env', '.env.local']) {
      const candidate = path.join(root, name);
      if (seen.has(candidate)) {
        continue;
      }
      seen.add(candidate);
      orderedCandidates.push(candidate);
    }
  }

  return orderedCandidates;
}

function parseEnvFile(content: string): Record<string, string> {
  const values: Record<string, string> = {};

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

    const value = normalized.slice(separatorIndex + 1).trim();
    values[key] = parseEnvValue(value);
  }

  return values;
}

function parseEnvValue(value: string): string {
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

function normalizePublicOrigin(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const url = new URL(trimmed);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('APP_PUBLIC_ORIGIN 只支持 http 或 https');
  }
  url.pathname = '';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function parseArgs(value: string | undefined): string[] {
  const trimmed = value?.trim();
  if (!trimmed) {
    return [];
  }

  if (!trimmed.startsWith('[')) {
    return trimmed.split(/\s+/).filter(Boolean);
  }

  let parsed: unknown;
  parsed = JSON.parse(trimmed);
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
    throw new Error('CODEX_ARGS 必须是空格分隔参数或 JSON 字符串数组');
  }

  return parsed;
}

function readInt(value: string | undefined, fallback: number): number {
  if (!value?.trim()) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`无效数字配置: ${value}`);
  }
  return parsed;
}

function readPositiveInt(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  const parsed = readInt(value, fallback);
  if (parsed <= 0) {
    throw new Error(`${name} 必须是正整数`);
  }
  return parsed;
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value?.trim()) {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function firstDefined(
  env: NodeJS.ProcessEnv,
  ...names: string[]
): string | undefined {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

function readCookieSecureMode(value: string | undefined): CookieSecureMode {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'always' || normalized === 'never') {
    return normalized;
  }
  return 'auto';
}

function readLockoutMs(env: NodeJS.ProcessEnv): number {
  const seconds = firstDefined(
    env,
    'APP_LOGIN_LOCKOUT_SECONDS',
    'LOGIN_LOCKOUT_SECONDS',
  );
  if (seconds) {
    return readPositiveInt(seconds, 120, 'APP_LOGIN_LOCKOUT_SECONDS') * 1000;
  }

  const ms = firstDefined(env, 'LOGIN_LOCKOUT_MS');
  if (ms) {
    return readPositiveInt(ms, 120000, 'LOGIN_LOCKOUT_MS');
  }
  return 120000;
}

function readBufferBytes(env: NodeJS.ProcessEnv): number {
  const bytes = firstDefined(env, 'TERMINAL_BUFFER_BYTES');
  if (bytes) {
    return readPositiveInt(bytes, 256 * 1024, 'TERMINAL_BUFFER_BYTES');
  }

  const kilobytes = firstDefined(env, 'TERMINAL_BUFFER_KB');
  if (kilobytes) {
    return readPositiveInt(kilobytes, 512, 'TERMINAL_BUFFER_KB') * 1024;
  }
  return 256 * 1024;
}

function validateBridgeToken(
  value: string | undefined,
  label = 'APP_BRIDGE_TOKEN',
): void {
  if (!value) {
    return;
  }
  if (Buffer.byteLength(value, 'utf8') < 32) {
    throw new Error(`${label} 必须至少 32 字节`);
  }
}

function validatePinHash(value: string | undefined): void {
  if (!value) {
    return;
  }

  const parts = value.includes('$') ? value.split('$') : value.split(':');
  if (
    parts.length !== 3 ||
    parts[0] !== 'scrypt' ||
    !isEvenHex(parts[1]) ||
    !isEvenHex(parts[2])
  ) {
    throw new Error('APP_PIN_HASH 格式无效，应为 scrypt$<salt>$<hash>');
  }
}

function isEvenHex(value: string): boolean {
  return value.length > 0 && value.length % 2 === 0 && /^[0-9a-f]+$/i.test(value);
}
