import * as vscode from 'vscode';
import path from 'path';

import { VscodeSettingsProvider } from '../config';
import { Logger } from '../utils/logger';
import { formatCommandError } from './shared';

export function registerConfigureHelperPathCommand(
  settings: VscodeSettingsProvider,
  logger: Logger,
): vscode.Disposable {
  return vscode.commands.registerCommand('promptBridge.configureHelperPath', async () => {
    try {
      const suggestedPath = settings.getHelperExecutablePath();
      const defaultUri = suggestedPath
        ? vscode.Uri.file(path.dirname(suggestedPath))
        : settings.getWorkspaceRoots()[0]
          ? vscode.Uri.file(settings.getWorkspaceRoots()[0])
          : undefined;
      const selected = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: '选择 Helper 可执行文件',
        defaultUri,
      });
      if (!selected?.[0]) {
        return;
      }
      await settings.setHelperExecutablePath(selected[0].fsPath);
      logger.info(`已保存 Helper 可执行路径：${selected[0].fsPath}`);
      await vscode.window.showInformationMessage(`已保存 Helper 路径：${selected[0].fsPath}`);
    } catch (error) {
      logger.error('配置 Helper 路径失败', error);
      await vscode.window.showErrorMessage(formatCommandError(error));
    }
  });
}
