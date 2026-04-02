import * as vscode from 'vscode';

import { PromptBridgeController } from '../bridge/promptBridgeController';
import { Logger } from '../utils/logger';
import { formatCommandError } from './shared';

export function registerSendLastPromptCommand(
  controller: PromptBridgeController,
  logger: Logger,
): vscode.Disposable {
  return vscode.commands.registerCommand('promptBridge.sendLastPrompt', async () => {
    try {
      await controller.sendLastPrompt();
      await vscode.window.showInformationMessage('最近一次 prompt 已重新发送');
    } catch (error) {
      logger.error('重发最近一次 prompt 失败', error);
      await vscode.window.showErrorMessage(formatCommandError(error));
    }
  });
}
