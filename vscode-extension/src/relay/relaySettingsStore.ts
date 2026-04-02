import os from 'os';

import * as vscode from 'vscode';

const RELAY_SERVER_URL_KEY = 'promptBridge.relay.serverUrl';
const RELAY_AGENT_NAME_KEY = 'promptBridge.relay.agentName';
const RELAY_AUTO_CONNECT_KEY = 'promptBridge.relay.autoConnect';
const RELAY_AGENT_TOKEN_KEY = 'promptBridge.relay.agentToken';

/**
 * 把 Relay 连接信息保存在本地扩展存储中，避免把 token 写进工作区文件。
 */
export class RelaySettingsStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  getServerUrl(): string | undefined {
    const value = this.context.globalState.get<string>(RELAY_SERVER_URL_KEY)?.trim();
    return value || undefined;
  }

  async setServerUrl(value: string): Promise<void> {
    await this.context.globalState.update(RELAY_SERVER_URL_KEY, value.trim());
  }

  getAgentName(): string {
    return (
      this.context.globalState.get<string>(RELAY_AGENT_NAME_KEY)?.trim() ||
      `${os.hostname()}-vscode`
    );
  }

  async setAgentName(value: string): Promise<void> {
    await this.context.globalState.update(RELAY_AGENT_NAME_KEY, value.trim());
  }

  getAutoConnect(): boolean {
    return this.context.globalState.get<boolean>(RELAY_AUTO_CONNECT_KEY) ?? false;
  }

  async setAutoConnect(value: boolean): Promise<void> {
    await this.context.globalState.update(RELAY_AUTO_CONNECT_KEY, value);
  }

  async getAgentToken(): Promise<string | undefined> {
    const value = await this.context.secrets.get(RELAY_AGENT_TOKEN_KEY);
    return value?.trim() || undefined;
  }

  async setAgentToken(value: string): Promise<void> {
    await this.context.secrets.store(RELAY_AGENT_TOKEN_KEY, value.trim());
  }

  async clear(): Promise<void> {
    await Promise.all([
      this.context.globalState.update(RELAY_SERVER_URL_KEY, undefined),
      this.context.globalState.update(RELAY_AGENT_NAME_KEY, undefined),
      this.context.globalState.update(RELAY_AUTO_CONNECT_KEY, false),
      this.context.secrets.delete(RELAY_AGENT_TOKEN_KEY),
    ]);
  }
}
