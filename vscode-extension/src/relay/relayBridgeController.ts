import { AuthError, AuthService } from '../server/auth';
import { SessionPageModel } from '../server/httpServer';
import { MobileBridgeServer, MobileBridgeServerLike, RunningServerInfo } from '../server/mobileBridgeServer';
import { AppState } from '../state/appState';
import {
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
import { Logger, maskSecret } from '../utils/logger';
import { describeAccessFields, describeAccessUrls } from '../utils/network';
import { RelayAgentServer, RelayAgentServerOptions, RelayForwardFailure } from './relayAgentServer';

export interface RelayBridgeSettings {
  getServerHost(): string;
  getServerPort(): number;
  getPublicBaseUrl(): string | undefined;
  getAgentResponseTimeoutMs(): number;
}

export interface RelayAccessInfo {
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
  agentToken: string;
  maskedAgentToken: string;
  agentConnected: boolean;
  agentName?: string;
}

export type RelayBridgeServerFactory = (options: ConstructorParameters<typeof MobileBridgeServer>[0]) => MobileBridgeServerLike;

export class RelayBridgeOperationError extends Error {
  constructor(
    readonly code: BridgeErrorCode,
    message: string,
    readonly recoverable: boolean,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'RelayBridgeOperationError';
  }
}

/**
 * 远端 Relay Server：负责手机入口、PIN 登录和把 prompt 中继给本地 Agent。
 */
export class RelayBridgeController {
  private server?: MobileBridgeServerLike;
  private unsubscribeAppState?: () => void;
  private readonly relayAgentServer: RelayAgentServer;

  constructor(
    private readonly appState: AppState,
    private readonly authService: AuthService,
    private readonly settings: RelayBridgeSettings,
    private readonly logger: Logger,
    private readonly agentToken: string,
    createServer: RelayBridgeServerFactory = (options) => new MobileBridgeServer(options),
    relayAgentServerFactory: (options: RelayAgentServerOptions) => RelayAgentServer = (options) =>
      new RelayAgentServer(options),
  ) {
    this.createServer = createServer;
    this.relayAgentServer = relayAgentServerFactory({
      logger,
      getAgentToken: () => this.agentToken,
      responseTimeoutMs: settings.getAgentResponseTimeoutMs(),
    });
  }

  private readonly createServer: RelayBridgeServerFactory;

  async startServer(): Promise<RunningServerInfo> {
    if (this.server) {
      this.logger.info('Relay Server 已处于运行状态');
      return this.server.getInfo() as RunningServerInfo;
    }

    this.appState.setStatus('starting', '正在启动远端 Relay Server', {
      authenticated: false,
      sessionExpiresAt: null,
      authExpiresAt: null,
    });
    const session = this.authService.issueNewSession();
    const server = this.createServer({
      host: this.settings.getServerHost(),
      port: this.settings.getServerPort(),
      logger: this.logger,
      additionalAttachers: [(httpServer) => this.relayAgentServer.attach(httpServer)],
      httpHandlers: {
        onMobileMessage: (message) => this.handleMobileMessage(message),
        onSessionPageViewed: (sessionId) => this.handleSessionPageViewed(sessionId),
        getSessionPageModel: (sessionId) => this.getSessionPageModel(sessionId),
        getCurrentSessionId: () => this.authService.getCurrentSession()?.sessionId,
        getState: (sessionId, authToken) => this.getState(sessionId, authToken),
      },
      wsHandlers: {
        authorize: (sessionId, authToken) =>
          this.authService.getValidationResult(sessionId, authToken).authenticated,
        getInitialMessage: (sessionId, authToken) => this.getState(sessionId, authToken),
      },
    });

    try {
      const info = await server.start();
      this.server = server;
      this.unsubscribeAppState = this.appState.onDidChange(() => {
        this.broadcastCurrentState();
      });
      this.appState.setStatus('running', '远端 Relay Server 已启动，等待手机登录和本地 Agent 连接', {
        authenticated: false,
        sessionExpiresAt: session.sessionExpiresAt,
        authExpiresAt: null,
      });
      return info;
    } catch (error) {
      const code = isAddressInUse(error) ? 'PORT_IN_USE' : 'UNKNOWN';
      const message = isAddressInUse(error)
        ? `端口 ${this.settings.getServerPort()} 已被占用`
        : '启动 Relay Server 失败';
      this.appState.setError(code, message, true);
      throw new RelayBridgeOperationError(code, message, true);
    }
  }

  async stopServer(): Promise<void> {
    await this.server?.stop();
    await this.relayAgentServer.dispose();
    this.unsubscribeAppState?.();
    this.unsubscribeAppState = undefined;
    this.server = undefined;
    this.appState.setStatus('stopped', '远端 Relay Server 已停止', {
      authenticated: false,
      sessionExpiresAt: null,
      authExpiresAt: null,
    });
  }

  getAccessInfo(): RelayAccessInfo | undefined {
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
    const agent = this.relayAgentServer.getSnapshot();
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
      agentToken: this.agentToken,
      maskedAgentToken: maskSecret(this.agentToken, 4),
      agentConnected: agent.connected,
      agentName: agent.agentName,
    };
  }

  async handleMobileMessage(message: MobileToPluginMessage): Promise<PluginToMobileMessage> {
    switch (message.type) {
      case 'login':
        return this.handleLogin(message);
      case 'submit_prompt':
        return this.forwardPrompt(message);
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
    const agent = this.relayAgentServer.getSnapshot();
    return {
      sessionId,
      pinLength: session.pin.length,
      sessionExpiresAt: session.sessionExpiresAt,
      title: 'Relay Bridge',
      subtitle: '手机请求先到远端服务，再通过 Relay Agent 转发回你的本地 VS Code。适合异地机器或固定公网入口。',
      modeLabel: 'Remote Relay',
      targetLabel: '本地 VS Code Agent',
      infoFields: [
        { label: 'Agent 状态', value: agent.connected ? '已连接' : '未连接', kind: 'text', tone: agent.connected ? 'success' : 'warning' },
        { label: 'Agent 名称', value: agent.agentName ?? '未上报', kind: 'text' },
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
    this.appState.setStatus('awaiting_login', '手机已打开远端登录页，等待输入 PIN', {
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
  ): Promise<SubmitOkMessage | SubmitFailedMessage | ErrorMessage> {
    try {
      const session = this.authService.assertAuthenticated(message.sessionId, message.authToken);
      if (!message.text.trim()) {
        throw new RelayBridgeOperationError('BAD_REQUEST', 'prompt 不能为空', true, message.requestId);
      }
      this.appState.recordPrompt({
        requestId: message.requestId,
        text: message.text,
        deviceName: message.deviceName,
      });
      this.appState.setStatus(
        'forwarding',
        `正在转发到本地 VS Code：${previewText(message.text, 32)}`,
        {
          authenticated: true,
          sessionExpiresAt: session.sessionExpiresAt,
          authExpiresAt: session.authExpiresAt ?? null,
        },
      );

      const result = await this.relayAgentServer.forwardPrompt({
        requestId: message.requestId,
        sessionId: message.sessionId,
        text: message.text,
        receivedAt: new Date().toISOString(),
        deviceName: message.deviceName,
      });
      this.appState.setStatus(
        'authenticated',
        result.detail || 'prompt 已通过 Relay Agent 成功发送到本地 VS Code',
        {
          authenticated: true,
          sessionExpiresAt: session.sessionExpiresAt,
          authExpiresAt: session.authExpiresAt ?? null,
        },
      );
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

  private normalizeError(error: unknown, requestId?: string): RelayBridgeOperationError {
    if (error instanceof RelayBridgeOperationError) {
      return error;
    }
    if (error instanceof AuthError) {
      return new RelayBridgeOperationError(error.code, error.message, error.recoverable, requestId);
    }
    if (isRelayForwardFailure(error)) {
      return new RelayBridgeOperationError(error.code, error.detail, true, requestId);
    }
    if (error instanceof Error) {
      return new RelayBridgeOperationError('UNKNOWN', error.message, true, requestId);
    }
    return new RelayBridgeOperationError('UNKNOWN', '发生未知错误', true, requestId);
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

function isRelayForwardFailure(error: unknown): error is RelayForwardFailure {
  return Boolean(
    typeof error === 'object' &&
      error &&
      'code' in error &&
      'detail' in error &&
      typeof (error as { code?: string }).code === 'string' &&
      typeof (error as { detail?: string }).detail === 'string',
  );
}
