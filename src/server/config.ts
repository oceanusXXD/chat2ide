import fs from 'fs';
import path from 'path';

export interface PinSource {
  plainPin?: string;
  pinHash?: string;
}

export type CookieSecureMode = 'auto' | 'always' | 'never';

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
  };
  ws: {
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

  if (!pinSource.plainPin && !pinSource.pinHash) {
    throw new Error('必须设置 APP_PIN 或 APP_PIN_HASH');
  }
  validatePinHash(pinSource.pinHash);

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
    },
    ws: {
      maxPayloadBytes: readPositiveInt(
        firstDefined(runtimeEnv, 'APP_WS_MAX_MESSAGE_BYTES'),
        128 * 1024,
        'APP_WS_MAX_MESSAGE_BYTES',
      ),
    },
  };
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
