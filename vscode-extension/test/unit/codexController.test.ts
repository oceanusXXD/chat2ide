import { describe, expect, it } from 'vitest';

import { CodexController, CodexSettings, ExtensionLike } from '../../src/codex/codexController';
import { MemoryLogger } from '../../src/utils/logger';

function createSettings(extensions: readonly ExtensionLike[]): CodexSettings {
  return {
    getExtensionHints: () => ['codex', 'openai'],
    getOpenCommandCandidates: () => ['configured.open'],
    getNewSessionCommand: () => 'codex.newSession',
    getExtensions: () => extensions,
  };
}

describe('CodexController', () => {
  it('应收集显式配置与扩展推导命令', () => {
    const controller = new CodexController(
      {
        executeCommand: async () => undefined,
      },
      createSettings([
        {
          id: 'openai.codex',
          packageJSON: {
            contributes: {
              viewsContainers: {
                activitybar: [{ id: 'codexView' }],
              },
              commands: [{ command: 'codex.openSidebar', title: 'Open Codex Sidebar' }],
            },
          },
        },
      ]),
      new MemoryLogger(),
    );

    expect(controller.collectOpenCandidates()).toEqual([
      'configured.open',
      'workbench.view.extension.codexView',
      'codex.openSidebar',
    ]);
  });

  it('应按顺序尝试命令直到成功', async () => {
    const attempted: string[] = [];
    const controller = new CodexController(
      {
        executeCommand: async (command) => {
          attempted.push(command);
          if (command === 'configured.open') {
            throw new Error('fail');
          }
          return undefined;
        },
      },
      createSettings([
        {
          id: 'openai.codex',
          packageJSON: {
            contributes: {
              viewsContainers: {
                activitybar: [{ id: 'codexView' }],
              },
            },
          },
        },
      ]),
      new MemoryLogger(),
    );

    const result = await controller.openSidebar();
    expect(result.commandId).toBe('workbench.view.extension.codexView');
    expect(attempted).toEqual(['configured.open', 'workbench.view.extension.codexView']);
  });
});
