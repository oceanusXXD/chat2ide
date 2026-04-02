import * as vscode from 'vscode';

import { PromptBridgeController } from './bridge/promptBridgeController';
import { registerCalibrateCommand } from './commands/calibrate';
import { registerConfigureRelayConnectionCommand } from './commands/configureRelayConnection';
import { registerConnectRelayAgentCommand } from './commands/connectRelayAgent';
import { registerConfigureHelperPathCommand } from './commands/configureHelperPath';
import { registerDisconnectRelayAgentCommand } from './commands/disconnectRelayAgent';
import { registerOpenCodexSidebarCommand } from './commands/openCodexSidebar';
import { registerRegenerateTokenCommand } from './commands/regenerateToken';
import { registerSendLastPromptCommand } from './commands/sendLastPrompt';
import { registerShowRelayAgentStatusCommand } from './commands/showRelayAgentStatus';
import { registerShowAccessInfoCommand } from './commands/showAccessInfo';
import { registerStartServerCommand } from './commands/startServer';
import { registerStopServerCommand } from './commands/stopServer';
import { VscodeSettingsProvider } from './config';
import { CodexController } from './codex/codexController';
import { HelperClient, HttpHelperTransport } from './helper/helperClient';
import { HelperProcessManager } from './helper/helperProcessManager';
import { RelayAgentClient } from './relay/relayAgentClient';
import { RelaySettingsStore } from './relay/relaySettingsStore';
import { AuthService } from './server/auth';
import { SessionStore } from './server/sessionStore';
import { AppState } from './state/appState';
import { OutputChannelLogger } from './utils/logger';

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('Prompt Bridge');
  const logger = new OutputChannelLogger(outputChannel);
  const settings = new VscodeSettingsProvider();
  const appState = new AppState();
  const relaySettings = new RelaySettingsStore(context);
  const sessionStore = new SessionStore();
  const authService = new AuthService(
    sessionStore,
    {
      sessionTtlMs: settings.getSessionTtlMs(),
      loginTtlMs: settings.getLoginTtlMs(),
      pinLength: settings.getPinLength(),
      maxFailedAttempts: settings.getMaxFailedAttempts(),
      lockoutMs: settings.getLockoutMs(),
    },
    logger,
  );

  const helperClient = new HelperClient(
    new HttpHelperTransport(
      `http://${settings.getHelperHost()}:${settings.getHelperPort()}`,
      settings.getHelperRequestTimeoutMs(),
    ),
    logger,
  );

  const helperProcessManager = new HelperProcessManager(
    {
      getExecutablePath: () => settings.getHelperExecutablePath(),
      getWorkspaceRoots: () => settings.getWorkspaceRoots(),
      getHelperHost: () => settings.getHelperHost(),
      getHelperPort: () => settings.getHelperPort(),
    },
    logger,
  );

  const codexController = new CodexController(
    {
      executeCommand: (command, ...rest) => vscode.commands.executeCommand(command, ...rest),
    },
    {
      getExtensionHints: () => settings.getCodexExtensionHints(),
      getOpenCommandCandidates: () => settings.getCodexOpenCommandCandidates(),
      getNewSessionCommand: () => settings.getCodexNewSessionCommand(),
      getExtensions: () => vscode.extensions.all,
    },
    logger,
  );

  const controller = new PromptBridgeController(
    appState,
    authService,
    settings,
    logger,
    codexController,
    helperClient,
    helperProcessManager,
  );

  const relayAgentClient = new RelayAgentClient(
    appState,
    {
      getServerUrl: () => relaySettings.getServerUrl(),
      getAgentName: () => relaySettings.getAgentName(),
      getConnectionTimeoutMs: () => settings.getRelayConnectionTimeoutMs(),
      getReconnectDelayMs: () => settings.getRelayReconnectDelayMs(),
      shouldAutoReconnect: () => relaySettings.getAutoConnect(),
      getAgentToken: () => relaySettings.getAgentToken(),
    },
    logger,
    {
      forwardPromptFromRelay: (payload) => controller.forwardPromptFromRelay(payload),
    },
  );

  context.subscriptions.push(
    outputChannel,
    registerStartServerCommand(context, controller, settings, logger),
    registerStopServerCommand(controller, logger),
    registerShowAccessInfoCommand(context, controller, settings, logger),
    registerOpenCodexSidebarCommand(controller, logger),
    registerSendLastPromptCommand(controller, logger),
    registerConfigureHelperPathCommand(settings, logger),
    registerConfigureRelayConnectionCommand(relaySettings, logger),
    registerConnectRelayAgentCommand(relayAgentClient, logger),
    registerDisconnectRelayAgentCommand(relayAgentClient, logger),
    registerShowRelayAgentStatusCommand(relayAgentClient),
    registerCalibrateCommand(controller, logger),
    registerRegenerateTokenCommand(context, controller, settings, logger),
    {
      dispose: () => {
        void relayAgentClient.stop();
        void controller.stopServer();
      },
    },
  );

  void relayAgentClient.autoStartIfConfigured();
}

export function deactivate(): void {}
