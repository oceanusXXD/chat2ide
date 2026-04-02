import { AuthService } from '../server/auth';
import { createAccessQrCodeTerminal } from '../server/qr';
import { SessionStore } from '../server/sessionStore';
import { AppState } from '../state/appState';
import { ConsoleLogger } from '../utils/logger';
import { CodexCliBridgeController } from './codexCliBridgeController';
import { CodexCliRunner, CodexPromptMode } from './codexCliRunner';

interface CodexCliServerOptions {
  host: string;
  port: number;
  publicBaseUrl?: string;
  sessionTtlMinutes: number;
  loginTtlMinutes: number;
  pinLength: 6 | 8;
  maxFailedAttempts: number;
  lockoutSeconds: number;
  execCommand: string;
  execArgs: string[];
  workdir?: string;
  promptMode: CodexPromptMode;
  promptPlaceholder: string;
  timeoutMs: number;
}

async function main(): Promise<void> {
  const options = parseCodexCliServerArgs(process.argv.slice(2));
  const logger = new ConsoleLogger();
  const runner = new CodexCliRunner({
    getExecutable: () => options.execCommand,
    getArgs: () => options.execArgs,
    getWorkingDirectory: () => options.workdir,
    getPromptMode: () => options.promptMode,
    getPromptPlaceholder: () => options.promptPlaceholder,
    getTimeoutMs: () => options.timeoutMs,
  });
  const commandSummary = buildCommandSummary(options.execCommand, options.execArgs, options.promptMode);
  const controller = new CodexCliBridgeController(
    new AppState(),
    new AuthService(
      new SessionStore(),
      {
        sessionTtlMs: options.sessionTtlMinutes * 60_000,
        loginTtlMs: options.loginTtlMinutes * 60_000,
        pinLength: options.pinLength,
        maxFailedAttempts: options.maxFailedAttempts,
        lockoutMs: options.lockoutSeconds * 1000,
      },
      logger,
    ),
    {
      getServerHost: () => options.host,
      getServerPort: () => options.port,
      getPublicBaseUrl: () => options.publicBaseUrl,
    },
    logger,
    runner,
    commandSummary,
    options.workdir,
  );

  await controller.startServer();
  const accessInfo = controller.getAccessInfo();
  if (!accessInfo) {
    throw new Error('Codex CLI Server 已启动，但未生成访问信息');
  }

  const qrText = await createAccessQrCodeTerminal(accessInfo.preferredUrl);
  printStartupSummary(accessInfo, qrText, options);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info(`收到 ${signal}，准备停止 Codex CLI Server`);
    await controller.stopServer();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

function printStartupSummary(
  accessInfo: NonNullable<ReturnType<CodexCliBridgeController['getAccessInfo']>>,
  qrText: string,
  options: CodexCliServerOptions,
): void {
  const lines = [
    '',
    '=== Prompt Bridge Codex CLI Server 已启动 ===',
    `监听地址: ${options.host}:${options.port}`,
    `手机访问链接: ${accessInfo.preferredUrl}`,
    `一次性 PIN: ${accessInfo.pin}`,
    `会话过期时间: ${accessInfo.sessionExpiresAt}`,
    `CLI 命令: ${accessInfo.commandSummary}`,
    `工作目录: ${accessInfo.workingDirectory ?? process.cwd()}`,
    accessInfo.publicUrl ? `外部访问链接: ${accessInfo.publicUrl}` : '外部访问链接: 未设置',
    accessInfo.note ? `说明: ${accessInfo.note}` : '',
    '',
    '手机扫码二维码或直接打开访问链接：',
    qrText,
    '',
  ].filter(Boolean);

  console.log(lines.join('\n'));
}

function parseCodexCliServerArgs(argv: string[]): CodexCliServerOptions {
  const options: CodexCliServerOptions = {
    host: '0.0.0.0',
    port: 8765,
    sessionTtlMinutes: 15,
    loginTtlMinutes: 10,
    pinLength: 6,
    maxFailedAttempts: 5,
    lockoutSeconds: 120,
    execCommand: 'codex',
    execArgs: [],
    promptMode: 'stdin',
    promptPlaceholder: '__PROMPT__',
    timeoutMs: 300_000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    switch (current) {
      case '--host':
        options.host = requireValue(current, next);
        index += 1;
        break;
      case '--port':
        options.port = Number.parseInt(requireValue(current, next), 10);
        index += 1;
        break;
      case '--public-base-url':
        options.publicBaseUrl = requireValue(current, next).replace(/\/+$/, '');
        index += 1;
        break;
      case '--session-ttl-minutes':
        options.sessionTtlMinutes = Number.parseInt(requireValue(current, next), 10);
        index += 1;
        break;
      case '--login-ttl-minutes':
        options.loginTtlMinutes = Number.parseInt(requireValue(current, next), 10);
        index += 1;
        break;
      case '--pin-length':
        options.pinLength = Number.parseInt(requireValue(current, next), 10) === 8 ? 8 : 6;
        index += 1;
        break;
      case '--max-failed-attempts':
        options.maxFailedAttempts = Number.parseInt(requireValue(current, next), 10);
        index += 1;
        break;
      case '--lockout-seconds':
        options.lockoutSeconds = Number.parseInt(requireValue(current, next), 10);
        index += 1;
        break;
      case '--exec-command':
        options.execCommand = requireValue(current, next);
        index += 1;
        break;
      case '--exec-arg':
        options.execArgs.push(requireValue(current, next));
        index += 1;
        break;
      case '--workdir':
        options.workdir = requireValue(current, next);
        index += 1;
        break;
      case '--prompt-mode':
        options.promptMode = requirePromptMode(requireValue(current, next));
        index += 1;
        break;
      case '--prompt-placeholder':
        options.promptPlaceholder = requireValue(current, next);
        index += 1;
        break;
      case '--timeout-ms':
        options.timeoutMs = Number.parseInt(requireValue(current, next), 10);
        index += 1;
        break;
      case '--help':
      case '-h':
        printHelpAndExit();
        break;
      default:
        throw new Error(`未知参数：${current}`);
    }
  }

  if (options.publicBaseUrl) {
    const url = new URL(options.publicBaseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('publicBaseUrl 只支持 http 或 https');
    }
    if (url.pathname && url.pathname !== '/') {
      throw new Error('当前 publicBaseUrl 不支持路径前缀，请只保留协议、主机和端口');
    }
  }

  return options;
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${flag} 缺少参数值`);
  }
  return value;
}

function requirePromptMode(value: string): CodexPromptMode {
  if (value === 'stdin' || value === 'arg') {
    return value;
  }
  throw new Error(`不支持的 prompt mode：${value}`);
}

function buildCommandSummary(executable: string, args: string[], promptMode: CodexPromptMode): string {
  const suffix = args.length > 0 ? ` ${args.join(' ')}` : '';
  return `${executable}${suffix} [prompt:${promptMode}]`;
}

function printHelpAndExit(): never {
  console.log(`用法:
  node ./out/src/cli/codexCliServer.js --public-base-url https://your-server.example.com:8765 --workdir /srv/project --exec-command codex

可选参数:
  --host                HTTP 监听地址，默认 0.0.0.0
  --port                HTTP 监听端口，默认 8765
  --public-base-url     手机实际访问的外部地址
  --session-ttl-minutes session 有效期，默认 15
  --login-ttl-minutes   登录态有效期，默认 10
  --pin-length          PIN 长度，支持 6 或 8，默认 6
  --max-failed-attempts PIN 最大错误次数，默认 5
  --lockout-seconds     锁定秒数，默认 120
  --exec-command        要执行的 Codex CLI 命令，默认 codex
  --exec-arg            追加一个参数，可重复多次
  --workdir             CLI 执行目录，建议指向目标仓库
  --prompt-mode         stdin 或 arg，默认 stdin
  --prompt-placeholder  arg 模式下的 prompt 占位符，默认 __PROMPT__
  --timeout-ms          CLI 超时，默认 300000

示例一：把 prompt 写入 stdin
  npm run codex-cli:standalone -- --public-base-url https://server:8765 --workdir /srv/repo --exec-command codex

示例二：把 prompt 作为参数传给命令
  npm run codex-cli:standalone -- --public-base-url https://server:8765 --workdir /srv/repo --exec-command codex --exec-arg run --exec-arg __PROMPT__ --prompt-mode arg
`);
  process.exit(0);
}

void main().catch((error) => {
  console.error(
    `[ERROR] Codex CLI Server 启动失败: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
