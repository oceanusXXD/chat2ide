import * as vscode from 'vscode';

import { PromptBridgeController } from '../bridge/promptBridgeController';
import { VscodeSettingsProvider } from '../config';
import { Logger } from '../utils/logger';
import { formatCommandError, showAccessInfoPanel } from './shared';

export function registerRegenerateTokenCommand(
  context: vscode.ExtensionContext,
  controller: PromptBridgeController,
  settings: VscodeSettingsProvider,
  logger: Logger,
): vscode.Disposable {
  return vscode.commands.registerCommand('promptBridge.regenerateAccessToken', async () => {
    try {
      const accessInfo = controller.regenerateAccessToken();
      await vscode.env.clipboard.writeText(accessInfo.preferredUrl);
      await showAccessInfoPanel(context, accessInfo, settings.getEnableQrCode());
      await vscode.window.showInformationMessage(`已轮换访问链接与 PIN：${accessInfo.pin}`);
    } catch (error) {
      logger.error('轮换访问口令失败', error);
      await vscode.window.showErrorMessage(formatCommandError(error));
    }
  });
}
