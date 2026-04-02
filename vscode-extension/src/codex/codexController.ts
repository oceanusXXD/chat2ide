import { Logger } from '../utils/logger';

export interface CommandExecutor {
  executeCommand(command: string, ...rest: unknown[]): Thenable<unknown>;
}

export interface ExtensionLike {
  id: string;
  packageJSON?: {
    displayName?: string;
    name?: string;
    description?: string;
    contributes?: {
      commands?: Array<{ command: string; title?: string; category?: string }>;
      viewsContainers?: {
        activitybar?: Array<{ id: string; title?: string }>;
        panel?: Array<{ id: string; title?: string }>;
      };
    };
  };
}

export interface CodexSettings {
  getExtensionHints(): string[];
  getOpenCommandCandidates(): string[];
  getNewSessionCommand(): string | undefined;
  getExtensions(): readonly ExtensionLike[];
}

export interface OpenCodexResult {
  commandId: string;
  attempted: string[];
}

export class CodexCommandError extends Error {
  constructor(
    message: string,
    readonly attempted: string[],
  ) {
    super(message);
    this.name = 'CodexCommandError';
  }
}

/**
 * 通过扩展元数据推导公开命令，再尝试打开 Codex 侧边栏。
 */
export class CodexController {
  constructor(
    private readonly executor: CommandExecutor,
    private readonly settings: CodexSettings,
    private readonly logger: Logger,
  ) {}

  async openSidebar(): Promise<OpenCodexResult> {
    const candidates = this.collectOpenCandidates();
    if (candidates.length === 0) {
      throw new CodexCommandError('未找到可用的 Codex 打开命令，请检查扩展安装或配置', []);
    }

    const attempted: string[] = [];
    for (const candidate of candidates) {
      attempted.push(candidate);
      try {
        this.logger.info(`尝试执行 Codex 命令：${candidate}`);
        await this.executor.executeCommand(candidate);
        return {
          commandId: candidate,
          attempted,
        };
      } catch (error) {
        this.logger.warn(`Codex 命令执行失败：${candidate}`);
        this.logger.error('命令执行异常', error);
      }
    }

    throw new CodexCommandError('所有 Codex 打开命令都执行失败', attempted);
  }

  async openNewSession(): Promise<void> {
    const command = this.settings.getNewSessionCommand()?.trim();
    if (!command) {
      this.logger.info('未配置新建会话命令，跳过');
      return;
    }
    this.logger.info(`尝试执行新建会话命令：${command}`);
    await this.executor.executeCommand(command);
  }

  collectOpenCandidates(): string[] {
    const explicit = this.settings
      .getOpenCommandCandidates()
      .map((item) => item.trim())
      .filter(Boolean);
    const inferred = this.discoverCommands();
    return Array.from(new Set([...explicit, ...inferred]));
  }

  private discoverCommands(): string[] {
    const hints = this.settings.getExtensionHints().map((item) => item.toLowerCase());
    const candidates: string[] = [];

    for (const extension of this.settings.getExtensions()) {
      const searchableText = [
        extension.id,
        extension.packageJSON?.displayName,
        extension.packageJSON?.name,
        extension.packageJSON?.description,
      ]
        .filter((value): value is string => Boolean(value))
        .join(' ')
        .toLowerCase();

      if (!hints.some((hint) => searchableText.includes(hint))) {
        continue;
      }

      const viewContainers = extension.packageJSON?.contributes?.viewsContainers;
      for (const view of viewContainers?.activitybar ?? []) {
        candidates.push(`workbench.view.extension.${view.id}`);
      }
      for (const view of viewContainers?.panel ?? []) {
        candidates.push(`workbench.view.extension.${view.id}`);
      }

      for (const command of extension.packageJSON?.contributes?.commands ?? []) {
        const title = `${command.title ?? ''} ${command.category ?? ''} ${command.command}`.toLowerCase();
        const looksRelevant =
          /(codex|openai|chat)/.test(title) &&
          /(open|show|focus|view|sidebar|panel)/.test(title);
        if (looksRelevant) {
          candidates.push(command.command);
        }
      }
    }

    return candidates;
  }
}
