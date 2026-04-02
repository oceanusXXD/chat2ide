import * as vscode from 'vscode';

import { PromptBridgeController } from '../bridge/promptBridgeController';
import { VscodeSettingsProvider } from '../config';
import { Logger } from '../utils/logger';
import { formatCommandError, showAccessInfoPanel } from './shared';

export function registerStartServerCommand(
  context: vscode.ExtensionContext,
  controller: PromptBridgeController,
  settings: VscodeSettingsProvider,
  logger: Logger,
): vscode.Disposable {
  return vscode.commands.registerCommand('promptBridge.startServer', async () => {
    try {
      await controller.startServer();
      const accessInfo = controller.getAccessInfo();
      if (!accessInfo) {
        throw new Error('服务已启动，但未生成访问信息');
      }
      await vscode.env.clipboard.writeText(accessInfo.preferredUrl);
      await showAccessInfoPanel(context, accessInfo, settings.getEnableQrCode());
      await vscode.window.showInformationMessage(
        `Prompt Bridge 已启动，链接已复制到剪贴板，PIN：${accessInfo.pin}`,
      );
    } catch (error) {
      logger.error('启动服务失败', error);
      await vscode.window.showErrorMessage(formatCommandError(error));
    }
  });
}
