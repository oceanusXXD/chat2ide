export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}

export interface OutputChannelLike {
  appendLine(value: string): void;
  show?(preserveFocus?: boolean): void;
}

/**
 * 将 VS Code OutputChannel 包装成统一日志接口。
 */
export class OutputChannelLogger implements Logger {
  constructor(private readonly channel: OutputChannelLike) {}

  info(message: string): void {
    this.channel.appendLine(`[INFO] ${message}`);
  }

  warn(message: string): void {
    this.channel.appendLine(`[WARN] ${message}`);
  }

  error(message: string, error?: unknown): void {
    const suffix = error ? ` | ${formatUnknownError(error)}` : '';
    this.channel.appendLine(`[ERROR] ${message}${suffix}`);
  }
}

/**
 * 单元测试中使用的内存日志器。
 */
export class MemoryLogger implements Logger {
  readonly entries: string[] = [];

  info(message: string): void {
    this.entries.push(`[INFO] ${message}`);
  }

  warn(message: string): void {
    this.entries.push(`[WARN] ${message}`);
  }

  error(message: string, error?: unknown): void {
    const suffix = error ? ` | ${formatUnknownError(error)}` : '';
    this.entries.push(`[ERROR] ${message}${suffix}`);
  }
}

/**
 * 供 CLI / 脚本模式复用的控制台日志器。
 */
export class ConsoleLogger implements Logger {
  info(message: string): void {
    console.log(`[INFO] ${message}`);
  }

  warn(message: string): void {
    console.warn(`[WARN] ${message}`);
  }

  error(message: string, error?: unknown): void {
    const suffix = error ? ` | ${formatUnknownError(error)}` : '';
    console.error(`[ERROR] ${message}${suffix}`);
  }
}

export function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return JSON.stringify(error);
}

/**
 * 对敏感信息做最小遮罩，避免在日志中泄露完整 PIN 或 token。
 */
export function maskSecret(secret: string, reveal = 2): string {
  if (!secret) {
    return '';
  }
  if (secret.length <= reveal) {
    return '*'.repeat(secret.length);
  }
  return `${secret.slice(0, reveal)}${'*'.repeat(secret.length - reveal)}`;
}
