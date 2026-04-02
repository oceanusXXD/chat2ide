import crypto from 'crypto';

import { RelayBridgeController } from '../relay/relayBridgeController';
import { AuthService } from '../server/auth';
import { createAccessQrCodeTerminal } from '../server/qr';
import { SessionStore } from '../server/sessionStore';
import { AppState } from '../state/appState';
import { ConsoleLogger } from '../utils/logger';

interface RelayCliOptions {
  host: string;
  port: number;
  publicBaseUrl?: string;
  sessionTtlMinutes: number;
  loginTtlMinutes: number;
  pinLength: 6 | 8;
  maxFailedAttempts: number;
  lockoutSeconds: number;
  agentResponseTimeoutMs: number;
  agentToken?: string;
}

async function main(): Promise<void> {
  const options = parseRelayCliArgs(process.argv.slice(2));
  const logger = new ConsoleLogger();
  const controller = new RelayBridgeController(
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
      getAgentResponseTimeoutMs: () => options.agentResponseTimeoutMs,
    },
    logger,
    options.agentToken ?? crypto.randomBytes(18).toString('hex'),
  );

  await controller.startServer();
  const accessInfo = controller.getAccessInfo();
  if (!accessInfo) {
    throw new Error('Relay Server 已启动，但未生成访问信息');
  }

  const qrText = await createAccessQrCodeTerminal(accessInfo.preferredUrl);
  printStartupSummary(accessInfo, qrText, options);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info(`收到 ${signal}，准备停止 Relay Server`);
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
  accessInfo: NonNullable<ReturnType<RelayBridgeController['getAccessInfo']>>,
  qrText: string,
  options: RelayCliOptions,
): void {
  const lines = [
    '',
    '=== Prompt Bridge Relay Server 已启动 ===',
    `监听地址: ${options.host}:${options.port}`,
    `手机访问链接: ${accessInfo.preferredUrl}`,
    `一次性 PIN: ${accessInfo.pin}`,
    `会话过期时间: ${accessInfo.sessionExpiresAt}`,
    `Agent Token: ${accessInfo.agentToken}`,
    `Agent 已连接: ${accessInfo.agentConnected ? '是' : '否'}`,
    accessInfo.publicUrl ? `外部访问链接: ${accessInfo.publicUrl}` : '外部访问链接: 未设置',
    accessInfo.note ? `说明: ${accessInfo.note}` : '',
    '',
    '请在本机 VS Code 中执行：',
    '1. PromptBridge: Configure Relay Connection',
    '2. 填入上面的 Relay Server 地址和 Agent Token',
    '3. 再执行 PromptBridge: Connect Relay Agent',
    '',
    '手机扫码二维码或直接打开访问链接：',
    qrText,
    '',
  ].filter(Boolean);

  console.log(lines.join('\n'));
}

function parseRelayCliArgs(argv: string[]): RelayCliOptions {
  const options: RelayCliOptions = {
    host: '0.0.0.0',
    port: 8765,
    sessionTtlMinutes: 15,
    loginTtlMinutes: 10,
    pinLength: 6,
    maxFailedAttempts: 5,
    lockoutSeconds: 120,
    agentResponseTimeoutMs: 15_000,
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
      case '--agent-response-timeout-ms':
        options.agentResponseTimeoutMs = Number.parseInt(requireValue(current, next), 10);
        index += 1;
        break;
      case '--agent-token':
        options.agentToken = requireValue(current, next);
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

function printHelpAndExit(): never {
  console.log(`用法:
  npm run relay:server -- --host 0.0.0.0 --port 8765 --public-base-url https://your-server.example.com:8765

可选参数:
  --host                       HTTP 监听地址，默认 0.0.0.0
  --port                       HTTP 监听端口，默认 8765
  --public-base-url            手机实际访问的外部地址，建议在公网 / 反代场景显式指定
  --session-ttl-minutes        session 有效期，默认 15
  --login-ttl-minutes          登录态有效期，默认 10
  --pin-length                 PIN 长度，支持 6 或 8，默认 6
  --max-failed-attempts        PIN 最大错误次数，默认 5
  --lockout-seconds            锁定秒数，默认 120
  --agent-response-timeout-ms  等待本地 Agent 回执超时，默认 15000
  --agent-token                手动指定 Agent Token；缺省时自动生成
`);
  process.exit(0);
}

void main().catch((error) => {
  console.error(`[ERROR] Relay Server 启动失败: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
