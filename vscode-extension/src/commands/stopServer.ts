import * as vscode from 'vscode';

import { PromptBridgeController } from '../bridge/promptBridgeController';
import { Logger } from '../utils/logger';
import { formatCommandError } from './shared';

export function registerStopServerCommand(
  controller: PromptBridgeController,
  logger: Logger,
): vscode.Disposable {
  return vscode.commands.registerCommand('promptBridge.stopServer', async () => {
    try {
      await controller.stopServer();
      await vscode.window.showInformationMessage('Prompt Bridge 已停止');
    } catch (error) {
      logger.error('停止服务失败', error);
      await vscode.window.showErrorMessage(formatCommandError(error));
    }
  });
}
