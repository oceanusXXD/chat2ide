import { describe, expect, it } from 'vitest';

import {
  buildWorkspaceExecutableCandidates,
  findFirstWorkspaceHelperExecutable,
  resolveCommandOnPath,
} from '../../src/helper/helperExecutableDiscovery';

describe('helperExecutableDiscovery', () => {
  it('应为子目录工作区生成向上探测候选路径', () => {
    expect(buildWorkspaceExecutableCandidates('/repo/chat2ide/vscode-extension')).toEqual([
      '/repo/chat2ide/vscode-extension/.venv/bin/prompt-bridge-helper',
      '/repo/chat2ide/.venv/bin/prompt-bridge-helper',
      '/repo/.venv/bin/prompt-bridge-helper',
      '/.venv/bin/prompt-bridge-helper',
    ]);
  });

  it('应返回工作区中第一个存在的 Helper', () => {
    const resolved = findFirstWorkspaceHelperExecutable(
      ['/repo/chat2ide/vscode-extension'],
      (targetPath) => targetPath === '/repo/chat2ide/.venv/bin/prompt-bridge-helper',
    );

    expect(resolved).toBe('/repo/chat2ide/.venv/bin/prompt-bridge-helper');
  });

  it('应支持从 PATH 中解析命令名', () => {
    const resolved = resolveCommandOnPath(
      'prompt-bridge-helper',
      (targetPath) => targetPath === '/usr/local/bin/prompt-bridge-helper',
      '/usr/local/bin:/usr/bin',
    );

    expect(resolved).toBe('/usr/local/bin/prompt-bridge-helper');
  });
});
