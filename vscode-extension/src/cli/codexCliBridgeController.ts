import { AuthError, AuthService } from '../server/auth';
import { SessionPageModel } from '../server/httpServer';
import {
  MobileBridgeServer,
  MobileBridgeServerLike,
  RunningServerInfo,
} from '../server/mobileBridgeServer';
import { AppState } from '../state/appState';
import {
  BridgeErrorCode,
  CliRunTelemetry,
  CommandFailedMessage,
  CommandOkMessage,
  ErrorMessage,
  InterruptFailedMessage,
  InterruptOkMessage,
  LoginFailedMessage,
  LoginOkMessage,
  MobileToPluginMessage,
  PluginToMobileMessage,
  StateUpdateMessage,
  SubmitFailedMessage,
  SubmitOkMessage,
  buildStateUpdate,
  previewText,
} from '../types/protocol';
import { Logger, maskSecret } from '../utils/logger';
import { describeAccessFields, describeAccessUrls } from '../utils/network';
import {
  CodexCliExecutionError,
  CodexCliRunInvocation,
  CodexCliRunMetadata,
  CodexCliRunProgress,
  CodexCliRunner,
  buildCommandLineForDisplay,
} from './codexCliRunner';
import {
  SafeServerCommandRunner,
  SafeServerCommandRunnerLike,
  ServerCommandExecutionError,
} from './safeServerCommandRunner';

export interface CodexCliBridgeSettings {
  getServerHost(): string;
  getServerPort(): number;
  getPublicBaseUrl(): string | undefined;
}

export interface CodexCliAccessInfo {
  sessionId: string;
  pin: string;
  maskedPin: string;
  sessionExpiresAt: string;
  preferredUrl: string;
  localUrl: string;
  lanUrls: string[];
  phoneReachable: boolean;
  note?: string;
  publicUrl?: string;
  commandSummary: string;
  workingDirectory?: string;
}

export type CodexCliBridgeServerFactory = (
  options: ConstructorParameters<typeof MobileBridgeServer>[0],
) => MobileBridgeServerLike;

export class CodexCliBridgeOperationError extends Error {
  constructor(
    readonly code: BridgeErrorCode,
    message: string,
    readonly recoverable: boolean,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'CodexCliBridgeOperationError';
  }
}

/**
 * 服务器侧 CLI mode：手机 prompt 直接触发服务器上的 Codex CLI。
 */
export class CodexCliBridgeController {
  private server?: MobileBridgeServerLike;
  private unsubscribeAppState?: () => void;
  private readonly inflightRequestIds = new Set<string>();

  constructor(
    private readonly appState: AppState,
    private readonly authService: AuthService,
    private readonly settings: CodexCliBridgeSettings,
    private readonly logger: Logger,
    private readonly cliRunner: CodexCliRunner,
    private readonly commandSummary: string,
    private readonly workingDirectory: string | undefined,
    private readonly serverCommandRunner: SafeServerCommandRunnerLike = new SafeServerCommandRunner(),
    private readonly createServer: CodexCliBridgeServerFactory = (options) =>
      new MobileBridgeServer(options),
  ) {}

  async startServer(): Promise<RunningServerInfo> {
    if (this.server) {
      this.logger.info('Codex CLI Server 已处于运行状态');
      return this.server.getInfo() as RunningServerInfo;
    }

    this.appState.setStatus('starting', '正在启动 Codex CLI Server', {
      authenticated: false,
      sessionExpiresAt: null,
      authExpiresAt: null,
    });
    const session = this.authService.issueNewSession();
    const server = this.createServer({
      host: this.settings.getServerHost(),
      port: this.settings.getServerPort(),
      logger: this.logger,
      httpHandlers: {
        onMobileMessage: (message) => this.handleMobileMessage(message),
        onSessionPageViewed: (sessionId) =>
          this.handleSessionPageViewed(sessionId),
        getSessionPageModel: (sessionId) => this.getSessionPageModel(sessionId),
        getCurrentSessionId: () =>
          this.authService.getCurrentSession()?.sessionId,
        getState: (sessionId, authToken) => this.getState(sessionId, authToken),
      },
      wsHandlers: {
        authorize: (sessionId, authToken) =>
          this.authService.getValidationResult(sessionId, authToken)
            .authenticated,
        getInitialMessage: (sessionId, authToken) =>
          this.getState(sessionId, authToken),
      },
    });

    try {
      const info = await server.start();
      this.server = server;
      this.unsubscribeAppState = this.appState.onDidChange(() => {
        this.broadcastCurrentState();
      });
      this.appState.setStatus(
        'running',
        'Codex CLI Server 已启动，等待手机登录',
        {
          authenticated: false,
          sessionExpiresAt: session.sessionExpiresAt,
          authExpiresAt: null,
        },
      );
      return info;
    } catch (error) {
      const code = isAddressInUse(error) ? 'PORT_IN_USE' : 'UNKNOWN';
      const message = isAddressInUse(error)
        ? `端口 ${this.settings.getServerPort()} 已被占用`
        : '启动 Codex CLI Server 失败';
      this.appState.setError(code, message, true);
      throw new CodexCliBridgeOperationError(code, message, true);
    }
  }

  async stopServer(): Promise<void> {
    await this.server?.stop();
    this.unsubscribeAppState?.();
    this.unsubscribeAppState = undefined;
    this.server = undefined;
    this.inflightRequestIds.clear();
    this.appState.setStatus('stopped', 'Codex CLI Server 已停止', {
      authenticated: false,
      sessionExpiresAt: null,
      authExpiresAt: null,
    });
  }

  getAccessInfo(): CodexCliAccessInfo | undefined {
    const serverInfo = this.server?.getInfo();
    const accessSnapshot = this.authService.getCurrentSession();
    if (!serverInfo || !accessSnapshot) {
      return undefined;
    }
    const urls = describeAccessUrls(
      serverInfo.host,
      serverInfo.port,
      accessSnapshot.sessionId,
      this.settings.getPublicBaseUrl(),
    );
    return {
      sessionId: accessSnapshot.sessionId,
      pin: accessSnapshot.pin,
      maskedPin: maskSecret(accessSnapshot.pin),
      sessionExpiresAt: accessSnapshot.sessionExpiresAt,
      preferredUrl: urls.preferredUrl,
      localUrl: urls.localUrl,
      lanUrls: urls.lanUrls,
      phoneReachable: urls.phoneReachable,
      note: urls.note,
      publicUrl: urls.publicUrl,
      commandSummary: this.commandSummary,
      workingDirectory: this.workingDirectory,
    };
  }

  async handleMobileMessage(
    message: MobileToPluginMessage,
  ): Promise<PluginToMobileMessage> {
    switch (message.type) {
      case 'login':
        return this.handleLogin(message);
      case 'submit_prompt':
        return this.forwardPrompt(message);
      case 'interrupt_run':
        return this.interruptCliRun(message);
      case 'run_server_command':
        return this.runServerCommand(message);
      case 'ping':
        return this.getState(message.sessionId, message.authToken);
      default:
        return {
          type: 'error',
          code: 'BAD_REQUEST',
          message: '不支持的消息类型',
          recoverable: true,
          requestId: (message as { requestId?: string }).requestId,
        };
    }
  }

  getSessionPageModel(sessionId: string): SessionPageModel | undefined {
    const session = this.authService.getCurrentSession();
    if (
      !session ||
      session.sessionId !== sessionId ||
      !this.authService.isSessionPageAvailable(sessionId)
    ) {
      return undefined;
    }
    const snapshot = this.appState.getSnapshot();
    const serverInfo = this.server?.getInfo();
    const accessUrls = describeAccessUrls(
      serverInfo?.host ?? this.settings.getServerHost(),
      serverInfo?.port ?? this.settings.getServerPort(),
      sessionId,
      this.settings.getPublicBaseUrl(),
    );
    return {
      sessionId,
      pinLength: session.pin.length,
      sessionExpiresAt: session.sessionExpiresAt,
      title: 'Codex CLI Server',
      subtitle:
        '手机登录后会直接触发服务器上的 Codex CLI。页面会尽量把命令、工作目录、参数、输出和变更都展示完整。',
      modeLabel: 'Direct CLI',
      targetLabel: '服务器 Codex CLI',
      infoFields: [
        { label: 'CLI 命令', value: this.commandSummary, kind: 'code' },
        {
          label: '工作目录',
          value: this.workingDirectory ?? process.cwd(),
          kind: 'code',
        },
      ],
      accessFields: describeAccessFields(accessUrls).map((item) => ({
        ...item,
        kind: 'url',
      })),
      note: accessUrls.note,
      initialState: buildStateUpdate({
        status: snapshot.status,
        updatedAt: snapshot.updatedAt,
        detail: snapshot.detail,
        authenticated: false,
        sessionExpiresAt: session.sessionExpiresAt,
        authExpiresAt: undefined,
        lastPrompt: snapshot.lastPrompt,
        lastPromptText: snapshot.lastPrompt?.text,
        lastError: snapshot.lastError,
        lastCliRun: snapshot.lastCliRun,
        recentCliRuns: snapshot.recentCliRuns,
      }),
    };
  }

  handleSessionPageViewed(sessionId: string): void {
    if (!this.authService.isSessionPageAvailable(sessionId)) {
      return;
    }
    const session = this.authService.getCurrentSession();
    this.appState.setStatus(
      'awaiting_login',
      '手机已打开 Codex CLI 登录页，等待输入 PIN',
      {
        authenticated: false,
        sessionExpiresAt: session?.sessionExpiresAt ?? null,
        authExpiresAt: null,
      },
    );
  }

  getState(
    sessionId: string,
    authToken?: string,
  ): StateUpdateMessage | ErrorMessage {
    try {
      const validation = this.authService.getValidationResult(
        sessionId,
        authToken,
      );
      if (!this.authService.isSessionPageAvailable(sessionId)) {
        return {
          type: 'error',
          code: 'SESSION_EXPIRED',
          message: '访问链接不存在或已过期',
          recoverable: true,
        };
      }
      const snapshot = this.appState.getSnapshot();
      const displayState =
        validation.authenticated && snapshot.status === 'awaiting_login'
          ? 'authenticated'
          : !validation.authenticated && snapshot.status === 'authenticated'
          ? 'awaiting_login'
          : snapshot.status;
      return buildStateUpdate({
        status: displayState,
        updatedAt: snapshot.updatedAt,
        detail: snapshot.detail,
        authenticated: validation.authenticated,
        sessionExpiresAt:
          validation.sessionExpiresAt ?? snapshot.sessionExpiresAt,
        authExpiresAt: validation.authExpiresAt,
        lastPrompt: snapshot.lastPrompt,
        lastPromptText: snapshot.lastPrompt?.text,
        lastError: snapshot.lastError,
        lastCliRun: snapshot.lastCliRun,
        recentCliRuns: snapshot.recentCliRuns,
      });
    } catch (error) {
      return this.toErrorMessage(error);
    }
  }

  private async handleLogin(
    message: Extract<MobileToPluginMessage, { type: 'login' }>,
  ): Promise<LoginOkMessage | LoginFailedMessage | ErrorMessage> {
    try {
      const result = this.authService.login(
        message.sessionId,
        message.pin,
        message.deviceName,
      );
      this.appState.setStatus('authenticated', '手机登录成功，可发送 prompt', {
        authenticated: true,
        sessionExpiresAt: result.sessionExpiresAt,
        authExpiresAt: result.authExpiresAt,
      });
      return {
        type: 'login_ok',
        requestId: message.requestId,
        sessionId: message.sessionId,
        authToken: result.authToken,
        expiresAt: result.authExpiresAt,
        state: 'authenticated',
        lastPromptPreview: this.appState.getSnapshot().lastPrompt
          ? previewText(this.appState.getSnapshot().lastPrompt?.text ?? '')
          : undefined,
      };
    } catch (error) {
      if (error instanceof AuthError) {
        return {
          type: 'login_failed',
          requestId: message.requestId,
          code: error.code,
          message: error.message,
          attemptsRemaining: error.attemptsRemaining,
          lockedUntil: error.lockedUntil,
        };
      }
      this.appState.setError(
        'UNKNOWN',
        '手机登录处理失败',
        true,
        message.requestId,
      );
      return this.toErrorMessage(error, message.requestId);
    }
  }

  private async forwardPrompt(
    message: Extract<MobileToPluginMessage, { type: 'submit_prompt' }>,
  ): Promise<SubmitOkMessage | SubmitFailedMessage | ErrorMessage> {
    try {
      const session = this.authService.assertAuthenticated(
        message.sessionId,
        message.authToken,
      );
      if (!message.text.trim()) {
        throw new CodexCliBridgeOperationError(
          'BAD_REQUEST',
          'prompt 不能为空',
          true,
          message.requestId,
        );
      }
      const invocation = this.cliRunner.describeInvocation(message.text, {
        resumeSessionId: message.resumeSessionId,
      });
      this.appState.recordPrompt({
        requestId: message.requestId,
        text: message.text,
        deviceName: message.deviceName,
      });
      const cliRun = this.toCliRunTelemetry(
        message.requestId,
        message.text,
        invocation,
        {
          status: 'running',
          combinedOutput: '',
        },
      );
      this.inflightRequestIds.add(message.requestId);
      this.appState.recordCliRun(cliRun);
      this.syncCliAggregateStatus(
        `${message.resumeSessionId ? '继续线程' : '新建线程'}：${previewText(
          message.text,
          32,
        )}`,
        session.sessionExpiresAt,
        session.authExpiresAt,
      );
      void this.executeCliRun(
        message,
        invocation,
        session.sessionExpiresAt,
        session.authExpiresAt,
      );
      return {
        type: 'submit_ok',
        requestId: message.requestId,
        acceptedAt: new Date().toISOString(),
        state: 'forwarding',
        lastPromptPreview: previewText(message.text),
        cliRun,
      };
    } catch (error) {
      const normalized = this.normalizeError(error, message.requestId);
      return {
        type: 'submit_failed',
        requestId: message.requestId,
        code: normalized.code,
        message: normalized.message,
        recoverable: normalized.recoverable,
      };
    }
  }

  private async executeCliRun(
    message: Extract<MobileToPluginMessage, { type: 'submit_prompt' }>,
    invocation: CodexCliRunInvocation,
    sessionExpiresAt: string,
    authExpiresAt?: string,
  ): Promise<void> {
    try {
      const result = await this.cliRunner.runPrompt(message.text, {
        requestId: message.requestId,
        resumeSessionId: message.resumeSessionId,
        onProgress: (progress) =>
          this.recordCliRunProgress(message, invocation, progress),
      });
      this.logger.info(`Codex CLI 执行成功：exitCode=${result.exitCode}`);
      if (result.stdout.trim()) {
        this.logger.info(`[codex-cli stdout] ${result.stdout.trim()}`);
      }
      if (result.stderr.trim()) {
        this.logger.warn(`[codex-cli stderr] ${result.stderr.trim()}`);
      }
      const cliRun = this.toCliRunTelemetry(
        message.requestId,
        message.text,
        invocation,
        {
          status: 'succeeded',
          exitCode: result.exitCode,
          combinedOutput: result.combinedOutput,
          stdout: result.stdout,
          stderr: result.stderr,
          metadata: result.metadata,
        },
      );
      this.appState.recordCliRun(cliRun);
      this.inflightRequestIds.delete(message.requestId);
      this.syncCliAggregateStatus(
        result.detail,
        sessionExpiresAt,
        authExpiresAt,
      );
    } catch (error) {
      const normalized = this.normalizeError(error, message.requestId);
      const cliRun = this.toCliRunTelemetry(
        message.requestId,
        message.text,
        invocation,
        {
          status:
            normalized.code === 'CLI_INTERRUPTED' ? 'interrupted' : 'failed',
          failureCode: normalized.code,
          failureMessage: normalized.message,
          combinedOutput:
            error instanceof CodexCliExecutionError
              ? error.combinedOutput
              : undefined,
          stdout:
            error instanceof CodexCliExecutionError ? error.stdout : undefined,
          stderr:
            error instanceof CodexCliExecutionError ? error.stderr : undefined,
          metadata:
            error instanceof CodexCliExecutionError
              ? error.metadata
              : undefined,
        },
      );
      this.appState.recordCliRun(cliRun);
      this.inflightRequestIds.delete(message.requestId);
      if (normalized.code !== 'CLI_INTERRUPTED') {
        this.appState.recordError(
          normalized.code,
          normalized.message,
          normalized.recoverable,
          normalized.requestId,
        );
      }
      this.syncCliAggregateStatus(
        normalized.message,
        sessionExpiresAt,
        authExpiresAt,
      );
    }
  }

  private recordCliRunProgress(
    message: Extract<MobileToPluginMessage, { type: 'submit_prompt' }>,
    invocation: CodexCliRunInvocation,
    progress: CodexCliRunProgress,
  ): void {
    const cliRun = this.toCliRunTelemetry(
      message.requestId,
      message.text,
      invocation,
      {
        status: 'running',
        combinedOutput: progress.combinedOutput,
        stdout: progress.stdout,
        stderr: progress.stderr,
        metadata: progress.metadata,
      },
    );
    this.appState.recordCliRun(cliRun);
  }

  private async interruptCliRun(
    message: Extract<MobileToPluginMessage, { type: 'interrupt_run' }>,
  ): Promise<InterruptOkMessage | InterruptFailedMessage | ErrorMessage> {
    try {
      this.authService.assertAuthenticated(
        message.sessionId,
        message.authToken,
      );
      if (!message.targetRequestId.trim()) {
        throw new CodexCliBridgeOperationError(
          'BAD_REQUEST',
          '缺少要中断的请求 ID',
          true,
          message.requestId,
        );
      }
      const interrupted = this.cliRunner.interruptRun(message.targetRequestId);
      if (!interrupted) {
        throw new CodexCliBridgeOperationError(
          'BAD_REQUEST',
          '当前选中的线程未在运行，无法中断',
          true,
          message.requestId,
        );
      }
      return {
        type: 'interrupt_ok',
        requestId: message.requestId,
        targetRequestId: message.targetRequestId,
        detail: `已请求中断 ${message.targetRequestId}，稍后会刷新为 interrupted`,
      };
    } catch (error) {
      const normalized = this.normalizeError(error, message.requestId);
      return {
        type: 'interrupt_failed',
        requestId: message.requestId,
        targetRequestId: message.targetRequestId,
        code: normalized.code,
        message: normalized.message,
        recoverable: normalized.recoverable,
      };
    }
  }

  private async runServerCommand(
    message: Extract<MobileToPluginMessage, { type: 'run_server_command' }>,
  ): Promise<CommandOkMessage | CommandFailedMessage | ErrorMessage> {
    try {
      this.authService.assertAuthenticated(
        message.sessionId,
        message.authToken,
      );
      const commandRun = await this.serverCommandRunner.runCommand(
        message.requestId,
        message.command,
      );
      return {
        type: 'command_ok',
        requestId: message.requestId,
        commandRun,
      };
    } catch (error) {
      const normalized = this.normalizeError(error, message.requestId);
      const commandRun =
        error instanceof ServerCommandExecutionError
          ? error.commandRun
          : undefined;
      return {
        type: 'command_failed',
        requestId: message.requestId,
        code: normalized.code,
        message: normalized.message,
        recoverable: normalized.recoverable,
        commandRun,
      };
    }
  }

  private toCliRunTelemetry(
    requestId: string,
    promptText: string,
    invocation: CodexCliRunInvocation,
    options: {
      status: CliRunTelemetry['status'];
      exitCode?: number;
      failureCode?: BridgeErrorCode;
      failureMessage?: string;
      combinedOutput?: string;
      stdout?: string;
      stderr?: string;
      metadata?: CodexCliRunMetadata;
    },
  ): CliRunTelemetry {
    const metadata = options.metadata;
    return {
      requestId,
      status: options.status,
      startedAt: metadata?.startedAt ?? new Date().toISOString(),
      finishedAt: metadata?.finishedAt,
      durationMs: metadata?.durationMs,
      promptText,
      promptPreview: previewText(promptText, 96),
      commandLine: buildCommandLineForDisplay(
        invocation.executable,
        invocation.configuredArgs,
      ),
      executable: invocation.executable,
      configuredArgs: [...invocation.configuredArgs],
      resolvedArgs: [...(metadata?.resolvedArgs ?? invocation.resolvedArgs)],
      workingDirectory:
        metadata?.workingDirectory ?? invocation.workingDirectory,
      promptMode: metadata?.promptMode ?? invocation.promptMode,
      timeoutMs: metadata?.timeoutMs ?? invocation.timeoutMs,
      exitCode: options.exitCode,
      failureCode: options.failureCode,
      failureMessage: options.failureMessage,
      model: metadata?.model,
      provider: metadata?.provider,
      approval: metadata?.approval,
      sandbox: metadata?.sandbox,
      reasoningEffort: metadata?.reasoningEffort,
      reasoningSummaries: metadata?.reasoningSummaries,
      codexSessionId: metadata?.codexSessionId,
      resumeSessionId: metadata?.resumeSessionId ?? invocation.resumeSessionId,
      outputWorkdir: metadata?.outputWorkdir,
      changedFiles: metadata?.changedFiles
        ? [...metadata.changedFiles]
        : undefined,
      gitChangedFiles: metadata?.gitChangedFiles
        ? [...metadata.gitChangedFiles]
        : undefined,
      combinedOutput: options.combinedOutput,
      stdout: options.stdout,
      stderr: options.stderr,
    };
  }

  private syncCliAggregateStatus(
    detail: string,
    sessionExpiresAt: string,
    authExpiresAt?: string,
  ): void {
    const runningCount = this.inflightRequestIds.size;
    const nextState = runningCount > 0 ? 'forwarding' : 'authenticated';
    const summary =
      runningCount > 0
        ? `并行运行 ${runningCount} 个 Codex 线程：${detail}`
        : detail;
    this.appState.setStatus(nextState, summary, {
      authenticated: true,
      sessionExpiresAt,
      authExpiresAt: authExpiresAt ?? null,
    });
  }

  private broadcastCurrentState(): void {
    const sessionId = this.authService.getCurrentSession()?.sessionId;
    if (!sessionId) {
      return;
    }
    this.server?.broadcast(
      (client) => this.getState(client.sessionId, client.authToken),
      sessionId,
    );
  }

  private normalizeError(
    error: unknown,
    requestId?: string,
  ): CodexCliBridgeOperationError {
    if (error instanceof CodexCliBridgeOperationError) {
      return error;
    }
    if (error instanceof AuthError) {
      return new CodexCliBridgeOperationError(
        error.code,
        error.message,
        error.recoverable,
        requestId,
      );
    }
    if (error instanceof CodexCliExecutionError) {
      return new CodexCliBridgeOperationError(
        error.code,
        error.message,
        true,
        requestId,
      );
    }
    if (error instanceof ServerCommandExecutionError) {
      return new CodexCliBridgeOperationError(
        error.code,
        error.message,
        true,
        requestId,
      );
    }
    if (error instanceof Error) {
      return new CodexCliBridgeOperationError(
        'UNKNOWN',
        error.message,
        true,
        requestId,
      );
    }
    return new CodexCliBridgeOperationError(
      'UNKNOWN',
      '发生未知错误',
      true,
      requestId,
    );
  }

  private toErrorMessage(error: unknown, requestId?: string): ErrorMessage {
    const normalized = this.normalizeError(error, requestId);
    return {
      type: 'error',
      code: normalized.code,
      message: normalized.message,
      recoverable: normalized.recoverable,
      requestId: normalized.requestId,
    };
  }
}

function isAddressInUse(error: unknown): boolean {
  return Boolean(
    typeof error === 'object' &&
      error &&
      'code' in error &&
      (error as { code?: string }).code === 'EADDRINUSE',
  );
}
