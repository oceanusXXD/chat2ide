import * as vscode from 'vscode';

import { AccessInfo } from '../bridge/promptBridgeController';
import { createAccessQrCodeDataUrl } from '../server/qr';

export function formatCommandError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return '发生未知错误';
}

export async function showAccessInfoPanel(
  context: vscode.ExtensionContext,
  accessInfo: AccessInfo,
  enableQrCode: boolean,
): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    'promptBridge.accessInfo',
    'Prompt Bridge Access Info',
    vscode.ViewColumn.Beside,
    { enableScripts: false },
  );

  const qrCode = enableQrCode ? await createAccessQrCodeDataUrl(accessInfo.preferredUrl) : undefined;
  const lanList = accessInfo.lanUrls.length
    ? `<ul class="link-list">${accessInfo.lanUrls
      .map((item) => `<li><code>${escapeHtml(item)}</code></li>`)
      .join('')}</ul>`
    : '<p class="empty">未检测到可用局域网地址。</p>';

  panel.webview.html = `<!DOCTYPE html>
  <html lang="zh-CN">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <style>
        :root {
          color-scheme: light;
          --bg: #f5eee5;
          --ink: #17201c;
          --muted: #66746e;
          --surface: rgba(255, 251, 247, 0.94);
          --border: rgba(23, 32, 28, 0.12);
          --accent: #ba4b2b;
          --accent-strong: #94331a;
          --accent-soft: rgba(186, 75, 43, 0.12);
          --emerald: #136f63;
          --emerald-soft: rgba(19, 111, 99, 0.12);
        }

        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          padding: 24px;
          color: var(--ink);
          font-family: "Space Grotesk", "Avenir Next", "PingFang SC", "Microsoft YaHei", sans-serif;
          background:
            radial-gradient(circle at top right, rgba(186, 75, 43, 0.18), transparent 28%),
            linear-gradient(180deg, #fff8ef 0%, #edf5ef 100%);
        }

        .wrap {
          display: grid;
          gap: 16px;
        }

        .hero,
        .card {
          border-radius: 24px;
          border: 1px solid var(--border);
          background: var(--surface);
          box-shadow: 0 16px 48px rgba(23, 32, 28, 0.1);
        }

        .hero {
          padding: 22px;
          display: grid;
          gap: 14px;
        }

        .eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 999px;
          width: fit-content;
          background: rgba(255, 255, 255, 0.78);
          color: var(--muted);
          font-size: 12px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        h1,
        h2 {
          margin: 0;
        }

        h1 {
          font-size: 28px;
          line-height: 1.05;
          letter-spacing: -0.03em;
        }

        .hero p,
        .card p,
        .empty {
          margin: 0;
          color: var(--muted);
          line-height: 1.65;
        }

        .meta {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .stat {
          border-radius: 18px;
          padding: 14px 16px;
          background: rgba(255, 255, 255, 0.86);
          border: 1px solid rgba(23, 32, 28, 0.08);
        }

        .label {
          color: var(--muted);
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .value {
          margin-top: 8px;
          word-break: break-word;
          line-height: 1.6;
          font-size: 15px;
        }

        .pin {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 10px 16px;
          border-radius: 16px;
          background: var(--accent-soft);
          color: var(--accent-strong);
          font-size: 30px;
          font-weight: 800;
          letter-spacing: 0.22em;
          font-variant-numeric: tabular-nums;
        }

        .status {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 7px 12px;
          border-radius: 999px;
          background: var(--emerald-soft);
          color: var(--emerald);
          font-size: 12px;
          font-weight: 700;
        }

        .card {
          padding: 20px;
          display: grid;
          gap: 14px;
        }

        code {
          font-family: "IBM Plex Mono", "JetBrains Mono", monospace;
          background: rgba(23, 32, 28, 0.06);
          padding: 2px 6px;
          border-radius: 8px;
        }

        .link-list {
          margin: 0;
          padding-left: 18px;
          line-height: 1.7;
        }

        .note {
          padding: 12px 14px;
          border-radius: 16px;
          background: rgba(23, 32, 28, 0.05);
        }

        img {
          width: min(260px, 100%);
          border-radius: 18px;
          background: white;
          padding: 10px;
          border: 1px solid rgba(23, 32, 28, 0.08);
        }

        @media (max-width: 720px) {
          body {
            padding: 14px;
          }

          .meta {
            grid-template-columns: 1fr;
          }
        }
      </style>
    </head>
    <body>
      <div class="wrap">
        <section class="hero">
          <div class="eyebrow">Prompt Bridge Access</div>
          <div>
            <h1>默认复制的就是手机应该访问的地址。</h1>
            <p>如果你配置了公网基地址，这里会优先展示公网链接和二维码；否则回退到局域网推荐地址。</p>
          </div>
          <div class="meta">
            <div class="stat">
              <div class="label">推荐访问链接</div>
              <div class="value"><code>${escapeHtml(accessInfo.preferredUrl)}</code></div>
            </div>
            <div class="stat">
              <div class="label">PIN</div>
              <div class="value"><span class="pin">${escapeHtml(accessInfo.pin)}</span></div>
            </div>
            <div class="stat">
              <div class="label">Session ID</div>
              <div class="value"><code>${escapeHtml(accessInfo.sessionId)}</code></div>
            </div>
            <div class="stat">
              <div class="label">过期时间</div>
              <div class="value">${escapeHtml(accessInfo.sessionExpiresAt)}</div>
            </div>
          </div>
        </section>

        <section class="card">
          <div>
            <h2>访问地址</h2>
            <p>公网、局域网和本机地址同时保留，方便你根据网络环境切换。</p>
          </div>
          <div class="meta">
            <div class="stat">
              <div class="label">公网地址</div>
              <div class="value">
                ${
                  accessInfo.publicUrl
                    ? `<code>${escapeHtml(accessInfo.publicUrl)}</code>`
                    : '<span class="empty">未配置公网基地址。</span>'
                }
              </div>
            </div>
            <div class="stat">
              <div class="label">当前可达性</div>
              <div class="value">
                <span class="status">${accessInfo.phoneReachable ? '手机可直连' : '仅桌面端可访问'}</span>
              </div>
            </div>
          </div>
          <div>
            <div class="label">本机地址</div>
            <p class="value"><code>${escapeHtml(accessInfo.localUrl)}</code></p>
          </div>
          <div>
            <div class="label">局域网地址</div>
            ${lanList}
          </div>
          ${accessInfo.note ? `<p class="note">${escapeHtml(accessInfo.note)}</p>` : ''}
        </section>

        ${
          qrCode
            ? `<section class="card">
                <div>
                  <h2>二维码</h2>
                  <p>二维码内容和上面的推荐访问链接一致。</p>
                </div>
                <img src="${qrCode}" alt="Prompt Bridge QR" />
              </section>`
            : ''
        }
      </div>
    </body>
  </html>`;

  context.subscriptions.push(panel);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
