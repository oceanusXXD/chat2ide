import * as vscode from 'vscode';

import { PromptBridgeController } from '../bridge/promptBridgeController';
import { VscodeSettingsProvider } from '../config';
import { Logger } from '../utils/logger';
import { formatCommandError, showAccessInfoPanel } from './shared';

export function registerShowAccessInfoCommand(
  context: vscode.ExtensionContext,
  controller: PromptBridgeController,
  settings: VscodeSettingsProvider,
  logger: Logger,
): vscode.Disposable {
  return vscode.commands.registerCommand('promptBridge.showAccessInfo', async () => {
    try {
      const accessInfo = controller.getAccessInfo();
      if (!accessInfo) {
        await vscode.window.showWarningMessage('请先启动 Prompt Bridge 服务');
        return;
      }
      await vscode.env.clipboard.writeText(accessInfo.preferredUrl);
      await showAccessInfoPanel(context, accessInfo, settings.getEnableQrCode());
      await vscode.window.showInformationMessage(`已复制访问链接，PIN：${accessInfo.pin}`);
    } catch (error) {
      logger.error('展示访问信息失败', error);
      await vscode.window.showErrorMessage(formatCommandError(error));
    }
  });
}
