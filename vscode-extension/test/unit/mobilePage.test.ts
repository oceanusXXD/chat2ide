import { describe, expect, it } from 'vitest';

import { SessionPageModel } from '../../src/server/httpServer';
import { buildStateUpdate } from '../../src/types/protocol';
import { renderMobilePage } from '../../src/web/mobilePage';

function createModel(): SessionPageModel {
  return {
    sessionId: 'session-1',
    pinLength: 6,
    sessionExpiresAt: '2026-04-01T00:15:00.000Z',
    initialState: buildStateUpdate({
      status: 'awaiting_login',
      updatedAt: '2026-04-01T00:00:00.000Z',
      detail: '等待登录',
      authenticated: false,
      sessionExpiresAt: '2026-04-01T00:15:00.000Z',
    }),
    title: 'Codex CLI Server',
    subtitle: 'test subtitle',
    modeLabel: 'Direct CLI',
    targetLabel: '服务器 Codex CLI',
    infoFields: [
      {
        label: 'CLI 命令',
        value: 'codex exec',
        kind: 'code',
      },
    ],
    accessFields: [
      {
        label: '推荐访问链接',
        value: 'https://example.com/session/session-1',
        kind: 'url',
      },
    ],
    note: 'test note',
  };
}

describe('renderMobilePage', () => {
  it('应把主控制台渲染为左侧 session 切换、右侧输入输出布局', () => {
    const html = renderMobilePage(createModel());

    expect(html).toContain('id="workspace-context-details"');
    expect(html).toContain('id="workspace-shell"');
    expect(html).toContain('id="session-sidebar"');
    expect(html).toContain('id="workspace-main"');
    expect(html).toContain('id="auth-checking-view"');
    expect(html).toContain('id="selected-thread-title"');
    expect(html).toContain('id="selected-thread-turns"');
    expect(html).toContain('id="thread-tabs"');
    expect(html).toContain('id="interrupt-run-button"');
    expect(html).toContain('id="prompt-form"');
    expect(html).toContain('id="command-view"');
    expect(html).toContain('id="run-empty-view"');
    expect(html).toContain('id="run-inspector-view"');
    expect(html).toContain('id="thread-transcript"');
    expect(html).toContain('id="run-status-badge-inline"');
    expect(html).toContain('id="advanced-details"');
    expect(html.indexOf('id="thread-tabs"')).toBeLessThan(
      html.indexOf('id="prompt-form"'),
    );
    expect(html.indexOf('id="session-sidebar"')).toBeLessThan(
      html.indexOf('id="workspace-main"'),
    );
    expect(html.indexOf('id="run-inspector-view"')).toBeLessThan(
      html.indexOf('id="prompt-form"'),
    );
  });
});
