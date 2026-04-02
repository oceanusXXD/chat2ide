import * as vscode from 'vscode';

import { RelayAgentClient } from '../relay/relayAgentClient';

export function registerShowRelayAgentStatusCommand(
  relayAgentClient: RelayAgentClient,
): vscode.Disposable {
  return vscode.commands.registerCommand('promptBridge.showRelayAgentStatus', async () => {
    const status = relayAgentClient.getStatus();
    const lines = [
      `状态：${status.state}`,
      `Relay Server：${status.serverUrl ?? '未配置'}`,
      `Agent 名称：${status.agentName ?? '未配置'}`,
      `连接时间：${status.connectedAt ?? '未连接'}`,
      `最近错误：${status.lastError ?? '无'}`,
    ];
    await vscode.window.showInformationMessage(lines.join('\n'), { modal: true });
  });
}
