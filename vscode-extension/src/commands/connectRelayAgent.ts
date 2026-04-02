import * as vscode from 'vscode';

import { RelayAgentClient } from '../relay/relayAgentClient';
import { Logger } from '../utils/logger';
import { formatCommandError } from './shared';

export function registerConnectRelayAgentCommand(
  relayAgentClient: RelayAgentClient,
  logger: Logger,
): vscode.Disposable {
  return vscode.commands.registerCommand('promptBridge.connectRelayAgent', async () => {
    try {
      await relayAgentClient.start();
      await vscode.window.showInformationMessage('Relay Agent 已连接');
    } catch (error) {
      logger.error('连接 Relay Agent 失败', error);
      await vscode.window.showErrorMessage(formatCommandError(error));
    }
  });
}
