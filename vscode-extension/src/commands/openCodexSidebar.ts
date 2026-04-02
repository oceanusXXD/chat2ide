import * as vscode from 'vscode';

import { PromptBridgeController } from '../bridge/promptBridgeController';
import { Logger } from '../utils/logger';
import { formatCommandError } from './shared';

export function registerOpenCodexSidebarCommand(
  controller: PromptBridgeController,
  logger: Logger,
): vscode.Disposable {
  return vscode.commands.registerCommand('promptBridge.openCodexSidebar', async () => {
    try {
      await controller.openCodexSidebar();
      await vscode.window.showInformationMessage('已尝试打开 Codex 侧边栏');
    } catch (error) {
      logger.error('打开 Codex 侧边栏失败', error);
      await vscode.window.showErrorMessage(formatCommandError(error));
    }
  });
}
