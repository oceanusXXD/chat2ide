import { AuthError, AuthService } from '../server/auth';
import { AppSnapshot, AppState } from '../state/appState';
import {
  BridgeState,
  BridgeErrorCode,
  ErrorMessage,
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
import { describeAccessFields, describeAccessUrls } from '../utils/network';
import { formatUnknownError, Logger, maskSecret } from '../utils/logger';
import { CodexCommandError } from '../codex/codexController';
import { MobileBridgeServer, MobileBridgeServerLike, RunningServerInfo } from '../server/mobileBridgeServer';
import { SessionPageModel } from '../server/httpServer';

export interface PromptBridgeSettings {
  getServerHost(): string;
  getServerPort(): number;
  getPublicBaseUrl(): string | undefined;
  getHelperAutoStart(): boolean;
  getHelperStartupTimeoutMs(): number;
  getCreateNewSessionBeforeSend(): boolean;
}

export interface AccessInfo {
  sessionId: string;
  pin: string;
  maskedPin: string;
  sessionExpiresAt: string;
  preferredUrl: string;
  localUrl: string;
  lanUrls: string[];
  publicUrl?: string;
  phoneReachable: boolean;
  note?: string;
}

export interface CodexControllerLike {
  openSidebar(): Promise<unknown>;
  openNewSession(): Promise<void>;
}

export interface HelperClientLike {
  healthCheck(requestId?: string): Promise<unknown>;
  ping(requestId: string): Promise<unknown>;
  sendPrompt(text: string, requestId: string): Promise<unknown>;
  calibrate(requestId: string): Promise<{ x: number; y: number; detail: string }>;
}

export interface HelperProcessManagerLike {
  start(): Promise<boolean>;
  stop(): Promise<void>;
}

export type MobileBridgeServerFactory = (options: ConstructorParameters<typeof MobileBridgeServer>[0]) => MobileBridgeServerLike;

export class BridgeOperationError extends Error {
  constructor(
    readonly code: BridgeErrorCode,
    message: string,
    readonly recoverable: boolean,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'BridgeOperationError';
  }
}

/**
 * 串起认证、HTTP/WS 服务、Codex 命令与 Helper 自动化。
 */
export class PromptBridgeController {
  private server?: MobileBridgeServerLike;
  private unsubscribeAppState?: () => void;

  constructor(
    private readonly appState: AppState,
    private readonly authService: AuthService,
    private readonly settings: PromptBridgeSettings,
    private readonly logger: Logger,
    private readonly codexController: CodexControllerLike,
    private readonly helperClient: HelperClientLike,
    private readonly helperProcessManager: HelperProcessManagerLike,
    private readonly createServer: MobileBridgeServerFactory = (options) =>
      new MobileBridgeServer(options),
  ) {}

  async startServer(): Promise<RunningServerInfo> {
    if (this.server) {
      this.logger.info('手机服务已处于运行状态');
      return this.server.getInfo() as RunningServerInfo;
    }

    this.appState.setStatus('starting', '正在启动本地 HTTP/WS 服务', {
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
        onSessionPageViewed: (sessionId) => this.handleSessionPageViewed(sessionId),
        getSessionPageModel: (sessionId) => this.getSessionPageModel(sessionId),
        getCurrentSessionId: () => this.authService.getCurrentSession()?.sessionId,
        getState: (sessionId, authToken) => this.getState(sessionId, authToken),
      },
      wsHandlers: {
        authorize: (sessionId, authToken) => this.authService.getValidationResult(sessionId, authToken).authenticated,
        getInitialMessage: (sessionId, authToken) => this.getState(sessionId, authToken),
      },
    });

    try {
      const info = await server.start();
      this.server = server;
      this.unsubscribeAppState = this.appState.onDidChange(() => {
        this.broadcastCurrentState();
      });
      this.appState.setStatus('running', '本地服务已启动，等待手机访问链接', {
        authenticated: false,
        sessionExpiresAt: session.sessionExpiresAt,
        authExpiresAt: null,
      });
      return info;
    } catch (error) {
      const code = isAddressInUse(error) ? 'PORT_IN_USE' : 'UNKNOWN';
      const message = isAddressInUse(error)
        ? `端口 ${this.settings.getServerPort()} 已被占用`
        : '启动手机服务失败';
      this.appState.setError(code, message, true);
      throw new BridgeOperationError(code, message, true);
    }
  }

  async stopServer(): Promise<void> {
    await this.server?.stop();
    await this.helperProcessManager.stop();
    this.unsubscribeAppState?.();
    this.unsubscribeAppState = undefined;
    this.server = undefined;
    this.appState.setStatus('stopped', '本地服务已停止', {
      authenticated: false,
      sessionExpiresAt: null,
      authExpiresAt: null,
    });
  }

  getServerInfo(): RunningServerInfo | undefined {
    return this.server?.getInfo();
  }

  getAccessInfo(): AccessInfo | undefined {
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
      publicUrl: urls.publicUrl,
      phoneReachable: urls.phoneReachable,
      note: urls.note,
    };
  }

  regenerateAccessToken(): AccessInfo {
    if (!this.server) {
      throw new BridgeOperationError('BAD_REQUEST', '请先启动本地服务再轮换访问口令', true);
    }
    const session = this.authService.issueNewSession();
    this.appState.setStatus('awaiting_login', '访问链接与 PIN 已轮换，请重新登录', {
      authenticated: false,
      sessionExpiresAt: session.sessionExpiresAt,
      authExpiresAt: null,
    });
    this.broadcastCurrentState();
    const info = this.getAccessInfo();
    if (!info) {
      throw new BridgeOperationError('UNKNOWN', '生成新的访问信息失败', true);
    }
    return info;
  }

  async openCodexSidebar(): Promise<void> {
    await this.codexController.openSidebar();
    const snapshot = this.appState.getSnapshot();
    this.appState.setStatus(this.getIdleStatus(snapshot), '已尝试打开 Codex 侧边栏', {
      authenticated: snapshot.authenticated,
      sessionExpiresAt: snapshot.sessionExpiresAt ?? null,
      authExpiresAt: snapshot.authExpiresAt ?? null,
    });
  }

  async sendLastPrompt(): Promise<void> {
    const prompt = this.appState.getSnapshot().lastPrompt;
    if (!prompt) {
      throw new BridgeOperationError('BAD_REQUEST', '当前没有最近一次 prompt 可重发', true);
    }
    const snapshot = this.appState.getSnapshot();
    this.appState.setStatus('forwarding', `正在重新发送：${previewText(prompt.text, 32)}`, {
      authenticated: snapshot.authenticated,
      sessionExpiresAt: snapshot.sessionExpiresAt ?? null,
      authExpiresAt: snapshot.authExpiresAt ?? null,
    });
    await this.codexController.openSidebar();
    if (this.settings.getCreateNewSessionBeforeSend()) {
      await this.codexController.openNewSession();
    }
    this.appState.setStatus('helper_busy', 'Helper 正在重新发送最近一次 prompt', {
      authenticated: snapshot.authenticated,
      sessionExpiresAt: snapshot.sessionExpiresAt ?? null,
      authExpiresAt: snapshot.authExpiresAt ?? null,
    });
    await this.ensureHelperReady();
    await this.helperClient.sendPrompt(prompt.text, `${prompt.requestId}-resend-${Date.now()}`);
    this.appState.setStatus(this.getIdleStatus(snapshot), '最近一次 prompt 已重新发送', {
      authenticated: snapshot.authenticated,
      sessionExpiresAt: snapshot.sessionExpiresAt ?? null,
      authExpiresAt: snapshot.authExpiresAt ?? null,
    });
  }

  async calibrateInputPosition(): Promise<{ x: number; y: number; detail: string }> {
    await this.ensureHelperReady();
    const result = await this.helperClient.calibrate(`calibrate-${Date.now()}`);
    const snapshot = this.appState.getSnapshot();
    this.appState.setStatus(this.getIdleStatus(snapshot), result.detail, {
      authenticated: snapshot.authenticated,
      sessionExpiresAt: snapshot.sessionExpiresAt ?? null,
      authExpiresAt: snapshot.authExpiresAt ?? null,
    });
    return result;
  }

  /**
   * 供 Relay Agent 复用的外部转发入口。它不依赖手机登录态，只负责把文本送入本机 Codex。
   */
  async forwardPromptFromRelay(payload: {
    requestId: string;
    sessionId: string;
    text: string;
    deviceName?: string;
  }): Promise<void> {
    if (!payload.text.trim()) {
      throw new BridgeOperationError('BAD_REQUEST', 'prompt 不能为空', true, payload.requestId);
    }
    this.appState.recordPrompt({
      requestId: payload.requestId,
      text: payload.text,
      deviceName: payload.deviceName,
    });

    const snapshot = this.appState.getSnapshot();
    this.appState.setStatus('forwarding', `Relay 正在转发到 Codex：${previewText(payload.text, 32)}`, {
      authenticated: snapshot.authenticated,
      sessionExpiresAt: snapshot.sessionExpiresAt ?? null,
      authExpiresAt: snapshot.authExpiresAt ?? null,
    });
    await this.codexController.openSidebar();
    if (this.settings.getCreateNewSessionBeforeSend()) {
      await this.codexController.openNewSession();
    }
    this.appState.setStatus('helper_busy', 'Relay Agent 正在调用 Helper 粘贴并发送', {
      authenticated: snapshot.authenticated,
      sessionExpiresAt: snapshot.sessionExpiresAt ?? null,
      authExpiresAt: snapshot.authExpiresAt ?? null,
    });
    await this.ensureHelperReady();
    await this.helperClient.sendPrompt(payload.text, payload.requestId);
    this.appState.setStatus(this.getIdleStatus(snapshot), 'Relay prompt 已成功发送到 Codex', {
      authenticated: snapshot.authenticated,
      sessionExpiresAt: snapshot.sessionExpiresAt ?? null,
      authExpiresAt: snapshot.authExpiresAt ?? null,
    });
  }

  async handleMobileMessage(message: MobileToPluginMessage): Promise<PluginToMobileMessage> {
    switch (message.type) {
      case 'login':
        return this.handleLogin(message);
      case 'submit_prompt':
        return this.forwardPrompt(message, true);
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
    if (!session || session.sessionId !== sessionId || !this.authService.isSessionPageAvailable(sessionId)) {
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
      title: 'Prompt Bridge',
      subtitle: '手机登录后把 prompt 送进 VS Code 侧边栏，由本机 Helper 与 Codex 执行链路继续处理。',
      modeLabel: 'VS Code Bridge',
      targetLabel: '本机 Helper',
      infoFields: [
        { label: '执行目标', value: 'VS Code 侧边栏 / Helper 自动化', kind: 'text' },
        { label: '当前链路', value: snapshot.detail ?? '等待手机登录', kind: 'text' },
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
        recentCliRuns: snapshot.recentCliRuns,
      }),
    };
  }

  handleSessionPageViewed(sessionId: string): void {
    if (!this.authService.isSessionPageAvailable(sessionId)) {
      return;
    }
    const session = this.authService.getCurrentSession();
    this.appState.setStatus('awaiting_login', '手机已打开登录页，等待输入 PIN', {
      authenticated: false,
      sessionExpiresAt: session?.sessionExpiresAt ?? null,
      authExpiresAt: null,
    });
  }

  getState(sessionId: string, authToken?: string): StateUpdateMessage | ErrorMessage {
    try {
      const validation = this.authService.getValidationResult(sessionId, authToken);
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
        sessionExpiresAt: validation.sessionExpiresAt ?? snapshot.sessionExpiresAt,
        authExpiresAt: validation.authExpiresAt,
        lastPrompt: snapshot.lastPrompt,
        lastPromptText: snapshot.lastPrompt?.text,
        lastError: snapshot.lastError,
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
      const result = this.authService.login(message.sessionId, message.pin, message.deviceName);
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
      this.appState.setError('UNKNOWN', '手机登录处理失败', true, message.requestId);
      return this.toErrorMessage(error, message.requestId);
    }
  }

  private async forwardPrompt(
    message: Extract<MobileToPluginMessage, { type: 'submit_prompt' }>,
    persistInStore: boolean,
  ): Promise<SubmitOkMessage | SubmitFailedMessage | ErrorMessage> {
    try {
      const session = this.authService.assertAuthenticated(message.sessionId, message.authToken);
      if (!message.text.trim()) {
        throw new BridgeOperationError('BAD_REQUEST', 'prompt 不能为空', true, message.requestId);
      }
      if (persistInStore) {
        this.appState.recordPrompt({
          requestId: message.requestId,
          text: message.text,
          deviceName: message.deviceName,
        });
      }

      this.appState.setStatus('forwarding', `正在转发到 Codex：${previewText(message.text, 32)}`, {
        authenticated: true,
        sessionExpiresAt: session.sessionExpiresAt,
        authExpiresAt: session.authExpiresAt ?? null,
      });
      await this.codexController.openSidebar();
      if (this.settings.getCreateNewSessionBeforeSend()) {
        await this.codexController.openNewSession();
      }

      this.appState.setStatus('helper_busy', 'Helper 正在向 Codex 输入框粘贴并发送', {
        authenticated: true,
        sessionExpiresAt: session.sessionExpiresAt,
        authExpiresAt: session.authExpiresAt ?? null,
      });
      await this.ensureHelperReady();
      await this.helperClient.sendPrompt(message.text, message.requestId);
      this.appState.setStatus(this.getIdleStatus(this.appState.getSnapshot()), 'prompt 已成功发送到 Codex', {
        authenticated: true,
        sessionExpiresAt: session.sessionExpiresAt,
        authExpiresAt: session.authExpiresAt ?? null,
      });
      return {
        type: 'submit_ok',
        requestId: message.requestId,
        acceptedAt: new Date().toISOString(),
        state: 'authenticated',
        lastPromptPreview: previewText(message.text),
      };
    } catch (error) {
      const normalized = this.normalizeError(error, message.requestId);
      this.appState.setError(
        normalized.code,
        normalized.message,
        normalized.recoverable,
        normalized.requestId,
      );
      return {
        type: 'submit_failed',
        requestId: message.requestId,
        code: normalized.code,
        message: normalized.message,
        recoverable: normalized.recoverable,
      };
    }
  }

  private async ensureHelperReady(): Promise<void> {
    try {
      await this.checkHelperHealth();
    } catch (error) {
      this.logger.warn(`Helper 不可用，准备按配置处理：${formatUnknownError(error)}`);
      if (!this.settings.getHelperAutoStart()) {
        throw new BridgeOperationError('HELPER_UNAVAILABLE', 'Helper 未启动或不可访问', true);
      }
      const started = await this.helperProcessManager.start();
      if (!started) {
        throw new BridgeOperationError(
          'HELPER_NOT_CONFIGURED',
          '未配置 Helper 可执行路径，无法自动启动',
          true,
        );
      }
      // Helper 进程启动并不等于 HTTP 服务已可访问，这里显式轮询健康检查。
      const deadline = Date.now() + this.settings.getHelperStartupTimeoutMs();
      let lastError: unknown = error;
      while (Date.now() < deadline) {
        try {
          await waitFor(250);
          await this.checkHelperHealth();
          return;
        } catch (retryError) {
          lastError = retryError;
        }
      }
      throw new BridgeOperationError(
        'HELPER_UNAVAILABLE',
        `Helper 启动后仍不可访问：${formatUnknownError(lastError)}`,
        true,
      );
    }
  }

  private broadcastCurrentState(): void {
    const sessionId = this.authService.getCurrentSession()?.sessionId;
    if (!sessionId) {
      return;
    }
    // 广播时必须按每个已连接手机自己的 authToken 重新计算状态，
    // 否则会把“已登录客户端”错误地更新成未认证状态。
    this.server?.broadcast(
      (client) => this.getState(client.sessionId, client.authToken),
      sessionId,
    );
  }

  private async checkHelperHealth(): Promise<void> {
    const health = await this.helperClient.healthCheck();
    if (typeof health === 'object' && health && 'healthy' in health && health.healthy === false) {
      throw new Error(
        `Helper 健康检查失败：${
          'detail' in health && typeof health.detail === 'string' ? health.detail : 'unknown'
        }`,
      );
    }
    await this.helperClient.ping(`ping-${Date.now()}`);
  }

  private normalizeError(error: unknown, requestId?: string): BridgeOperationError {
    if (error instanceof BridgeOperationError) {
      return error;
    }
    if (error instanceof AuthError) {
      return new BridgeOperationError(error.code, error.message, error.recoverable, requestId);
    }
    if (error instanceof CodexCommandError) {
      return new BridgeOperationError(
        'CODEX_COMMAND_FAILED',
        `${error.message}。已尝试：${error.attempted.join(', ') || '无'}`,
        true,
        requestId,
      );
    }
    if (error instanceof Error && /Helper/i.test(error.message)) {
      return new BridgeOperationError('HELPER_REQUEST_FAILED', error.message, true, requestId);
    }
    if (error instanceof Error) {
      return new BridgeOperationError('UNKNOWN', error.message, true, requestId);
    }
    return new BridgeOperationError('UNKNOWN', '发生未知错误', true, requestId);
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

  private getIdleStatus(snapshot: AppSnapshot): BridgeState {
    if (snapshot.status === 'relay_connected' || snapshot.status === 'relay_connecting') {
      return 'relay_connected';
    }
    if (snapshot.status === 'relay_disconnected') {
      return 'relay_disconnected';
    }
    return snapshot.authenticated ? 'authenticated' : 'running';
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

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
