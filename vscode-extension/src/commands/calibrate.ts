import * as vscode from 'vscode';

import { PromptBridgeController } from '../bridge/promptBridgeController';
import { Logger } from '../utils/logger';
import { formatCommandError } from './shared';

export function registerCalibrateCommand(
  controller: PromptBridgeController,
  logger: Logger,
): vscode.Disposable {
  return vscode.commands.registerCommand('promptBridge.calibrateInputPosition', async () => {
    const action = await vscode.window.showInformationMessage(
      '请先把鼠标移动到 Codex 输入框内，再点击“开始校准”。',
      '开始校准',
    );
    if (action !== '开始校准') {
      return;
    }
    try {
      const result = await controller.calibrateInputPosition();
      await vscode.window.showInformationMessage(
        `已记录输入框坐标：(${result.x}, ${result.y})`,
      );
    } catch (error) {
      logger.error('校准输入框失败', error);
      await vscode.window.showErrorMessage(formatCommandError(error));
    }
  });
}
