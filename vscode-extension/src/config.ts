import fs from 'fs';

import * as vscode from 'vscode';

import { findFirstWorkspaceHelperExecutable } from './helper/helperExecutableDiscovery';

/**
 * 统一读取扩展配置，避免业务层直接依赖 VS Code 配置对象。
 */
export class VscodeSettingsProvider {
  private get config(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('promptBridge');
  }

  getServerHost(): string {
    return this.config.get<string>('server.host', '0.0.0.0');
  }

  getPublicBaseUrl(): string | undefined {
    const configured = this.config.get<string>('server.publicBaseUrl', '').trim();
    return configured || undefined;
  }

  getServerPort(): number {
    return this.config.get<number>('server.port', 8765);
  }

  getSessionTtlMs(): number {
    return this.config.get<number>('security.sessionTtlMinutes', 15) * 60_000;
  }

  getLoginTtlMs(): number {
    return this.config.get<number>('security.loginTtlMinutes', 10) * 60_000;
  }

  getPinLength(): number {
    return this.config.get<number>('security.pinLength', 6);
  }

  getMaxFailedAttempts(): number {
    return this.config.get<number>('security.maxFailedAttempts', 5);
  }

  getLockoutMs(): number {
    return this.config.get<number>('security.lockoutSeconds', 120) * 1000;
  }

  getHelperHost(): string {
    return this.config.get<string>('helper.host', '127.0.0.1');
  }

  getHelperPort(): number {
    return this.config.get<number>('helper.port', 8766);
  }

  getHelperRequestTimeoutMs(): number {
    return this.config.get<number>('helper.requestTimeoutMs', 8000);
  }

  getHelperStartupTimeoutMs(): number {
    return this.config.get<number>('helper.startupTimeoutMs', 10_000);
  }

  getHelperAutoStart(): boolean {
    return this.config.get<boolean>('helper.autoStart', true);
  }

  getHelperExecutablePath(): string | undefined {
    const configured = this.config.get<string>('helper.executablePath', '').trim();
    if (configured) {
      return configured;
    }
    return this.detectDefaultHelperExecutablePath();
  }

  async setHelperExecutablePath(value: string): Promise<void> {
    await this.config.update(
      'helper.executablePath',
      value.trim(),
      vscode.ConfigurationTarget.Workspace,
    );
  }

  getCodexExtensionHints(): string[] {
    return this.config.get<string[]>('codex.extensionHints', ['openai', 'codex']);
  }

  getCodexOpenCommandCandidates(): string[] {
    return this.config.get<string[]>('codex.openCommandCandidates', []);
  }

  getCodexNewSessionCommand(): string | undefined {
    const configured = this.config.get<string>('codex.newSessionCommand', '').trim();
    return configured || undefined;
  }

  getCreateNewSessionBeforeSend(): boolean {
    return this.config.get<boolean>('codex.createNewSessionBeforeSend', false);
  }

  getEnableQrCode(): boolean {
    return this.config.get<boolean>('ui.enableQrCode', true);
  }

  getRelayConnectionTimeoutMs(): number {
    return this.config.get<number>('relay.connectionTimeoutMs', 10_000);
  }

  getRelayReconnectDelayMs(): number {
    return this.config.get<number>('relay.reconnectDelayMs', 3_000);
  }

  getRelayAgentResponseTimeoutMs(): number {
    return this.config.get<number>('relay.agentResponseTimeoutMs', 15_000);
  }

  getWorkspaceRoots(): string[] {
    return vscode.workspace.workspaceFolders?.map((item) => item.uri.fsPath) ?? [];
  }

  private detectDefaultHelperExecutablePath(): string | undefined {
    return findFirstWorkspaceHelperExecutable(this.getWorkspaceRoots(), fs.existsSync);
  }
}
