import * as vscode from 'vscode';

import { RelayAgentClient } from '../relay/relayAgentClient';
import { Logger } from '../utils/logger';
import { formatCommandError } from './shared';

export function registerDisconnectRelayAgentCommand(
  relayAgentClient: RelayAgentClient,
  logger: Logger,
): vscode.Disposable {
  return vscode.commands.registerCommand('promptBridge.disconnectRelayAgent', async () => {
    try {
      await relayAgentClient.stop();
      await vscode.window.showInformationMessage('Relay Agent 已断开');
    } catch (error) {
      logger.error('断开 Relay Agent 失败', error);
      await vscode.window.showErrorMessage(formatCommandError(error));
    }
  });
}
