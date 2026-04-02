import * as vscode from 'vscode';

import { RelaySettingsStore } from '../relay/relaySettingsStore';
import { Logger } from '../utils/logger';
import { formatCommandError } from './shared';

export function registerConfigureRelayConnectionCommand(
  relaySettings: RelaySettingsStore,
  logger: Logger,
): vscode.Disposable {
  return vscode.commands.registerCommand('promptBridge.configureRelayConnection', async () => {
    try {
      const serverUrl = await vscode.window.showInputBox({
        prompt: '请输入远端 Relay Server 地址，例如 https://your-server.example.com:8765',
        placeHolder: 'https://your-server.example.com:8765',
        value: relaySettings.getServerUrl(),
        ignoreFocusOut: true,
        validateInput: (value) => {
          if (!value.trim()) {
            return 'Relay Server 地址不能为空';
          }
          try {
            const url = new URL(value.trim());
            if (!['http:', 'https:'].includes(url.protocol)) {
              return '只支持 http 或 https 地址';
            }
            return undefined;
          } catch {
            return '请输入合法的 URL';
          }
        },
      });
      if (!serverUrl) {
        return;
      }

      const agentToken = await vscode.window.showInputBox({
        prompt: '请输入远端 Relay Server 打印出来的 Agent Token',
        password: true,
        ignoreFocusOut: true,
        validateInput: (value) => (!value.trim() ? 'Agent Token 不能为空' : undefined),
      });
      if (!agentToken) {
        return;
      }

      const agentName = await vscode.window.showInputBox({
        prompt: '请输入本地执行器名称，用于远端日志识别',
        value: relaySettings.getAgentName(),
        ignoreFocusOut: true,
        validateInput: (value) => (!value.trim() ? '执行器名称不能为空' : undefined),
      });
      if (!agentName) {
        return;
      }

      const autoConnectPick = await vscode.window.showQuickPick(
        [
          {
            label: '自动连接',
            description: 'VS Code 打开后自动尝试连接 Relay Server',
            value: true,
          },
          {
            label: '手动连接',
            description: '只在执行 PromptBridge: Connect Relay Agent 时连接',
            value: false,
          },
        ],
        {
          title: '是否启用自动连接',
          ignoreFocusOut: true,
        },
      );
      if (!autoConnectPick) {
        return;
      }

      await relaySettings.setServerUrl(serverUrl);
      await relaySettings.setAgentToken(agentToken);
      await relaySettings.setAgentName(agentName);
      await relaySettings.setAutoConnect(autoConnectPick.value);
      await vscode.window.showInformationMessage('Relay 连接信息已保存');
    } catch (error) {
      logger.error('配置 Relay 连接失败', error);
      await vscode.window.showErrorMessage(formatCommandError(error));
    }
  });
}
