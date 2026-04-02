import { SAFE_SERVER_COMMANDS } from '../cli/safeServerCommandRunner';
import { SessionPageField, SessionPageModel } from '../server/httpServer';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function serializeForInlineScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function renderPinSlots(pinLength: number): string {
  return Array.from(
    { length: pinLength },
    () => '<span class="pin-slot"></span>',
  ).join('');
}

function renderServerCommandChips(): string {
  return SAFE_SERVER_COMMANDS.map(
    (command) =>
      `<button type="button" class="secondary mini quick-command" data-server-command="${escapeHtml(
        command,
      )}">${escapeHtml(command)}</button>`,
  ).join('');
}

function renderFieldValue(field: SessionPageField): string {
  const value = escapeHtml(field.value);
  if (field.kind === 'url') {
    return `
      <a class="field-link" href="${value}" target="_blank" rel="noopener noreferrer">${value}</a>
      <button type="button" class="secondary mini" data-copy-value="${value}">复制</button>
    `;
  }

  if (field.kind === 'code') {
    return `<code class="field-code">${value}</code>`;
  }

  return value;
}

function renderFieldCards(
  fields: SessionPageField[],
  emptyText: string,
): string {
  if (fields.length === 0) {
    return `
      <div class="info-card">
        <div class="label">暂无数据</div>
        <div class="value">${escapeHtml(emptyText)}</div>
      </div>
    `;
  }

  return fields
    .map((field) => {
      const toneClass =
        field.tone && field.tone !== 'default' ? ` ${field.tone}` : '';
      return `
        <div class="info-card${toneClass}">
          <div class="label">${escapeHtml(field.label)}</div>
          <div class="value">${renderFieldValue(field)}</div>
        </div>
      `;
    })
    .join('');
}

function renderStyles(): string {
  return `
      :root {
        color-scheme: light;
        --page-bg: #efe5d7;
        --page-ink: #17201f;
        --muted: #687773;
        --surface: rgba(255, 251, 247, 0.92);
        --surface-strong: rgba(255, 251, 247, 0.98);
        --surface-quiet: rgba(23, 32, 31, 0.05);
        --border: rgba(23, 32, 31, 0.11);
        --border-strong: rgba(23, 32, 31, 0.2);
        --accent: #bb4e2f;
        --accent-strong: #95351d;
        --accent-soft: rgba(187, 78, 47, 0.13);
        --info: #1d4ed8;
        --info-soft: rgba(29, 78, 216, 0.12);
        --teal: #0f766e;
        --teal-soft: rgba(15, 118, 110, 0.12);
        --gold: #996018;
        --gold-soft: rgba(153, 96, 24, 0.14);
        --danger: #a12a28;
        --danger-soft: rgba(161, 42, 40, 0.12);
        --code-bg: #101918;
        --code-ink: #edf4ef;
        --radius-xl: 30px;
        --radius-lg: 22px;
        --radius-md: 16px;
        --shadow: 0 26px 80px rgba(23, 32, 31, 0.12);
      }

      * {
        box-sizing: border-box;
      }

      html {
        background: var(--page-bg);
      }

      body {
        margin: 0;
        min-height: 100vh;
        color: var(--page-ink);
        font-family: "Space Grotesk", "Sora", "Avenir Next", "PingFang SC", "Microsoft YaHei", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(187, 78, 47, 0.26), transparent 30%),
          radial-gradient(circle at right center, rgba(15, 118, 110, 0.14), transparent 30%),
          linear-gradient(180deg, #fbf1e4 0%, #eef4ef 100%);
      }

      body::before,
      body::after {
        content: "";
        position: fixed;
        z-index: 0;
        width: 42vw;
        height: 42vw;
        border-radius: 999px;
        filter: blur(56px);
        opacity: 0.26;
        pointer-events: none;
      }

      body::before {
        top: -10vw;
        right: -12vw;
        background: rgba(187, 78, 47, 0.38);
      }

      body::after {
        bottom: -14vw;
        left: -14vw;
        background: rgba(15, 118, 110, 0.28);
      }

      main {
        position: relative;
        z-index: 1;
        width: min(1220px, 100%);
        margin: 0 auto;
        padding: 22px 18px 38px;
      }

      main > * {
        animation: rise-in 0.52s ease both;
      }

      main > *:nth-child(2) {
        animation-delay: 0.06s;
      }

      main > *:nth-child(3) {
        animation-delay: 0.12s;
      }

      main > *:nth-child(4) {
        animation-delay: 0.18s;
      }

      .surface {
        position: relative;
        overflow: hidden;
        border-radius: var(--radius-xl);
        border: 1px solid var(--border);
        background: var(--surface);
        box-shadow: var(--shadow);
        backdrop-filter: blur(20px);
      }

      .surface::after {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        background: linear-gradient(140deg, rgba(255, 255, 255, 0.18), transparent 42%);
      }

      .hero {
        padding: 22px 24px;
        display: grid;
        gap: 18px;
        margin-bottom: 18px;
      }

      .hero-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
      }

      .hero-compact {
        gap: 14px;
      }

      .hero-copy {
        display: grid;
        gap: 14px;
      }

      .hero-title-row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }

      .hero-strip {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 10px;
      }

      .hero-chip {
        padding: 12px 14px;
        border-radius: 16px;
        border: 1px solid rgba(23, 32, 31, 0.08);
        background: rgba(255, 255, 255, 0.86);
        min-width: 0;
        display: grid;
        gap: 6px;
      }

      .hero-chip-value {
        margin: 0;
        font-size: 14px;
        line-height: 1.45;
        white-space: normal;
        word-break: break-word;
      }

      .hero-footer {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      .eyebrow,
      .pill,
      .status-pill {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        width: fit-content;
        padding: 8px 14px;
        border-radius: 999px;
        border: 1px solid rgba(23, 32, 31, 0.08);
        background: rgba(255, 255, 255, 0.76);
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .pill {
        text-transform: none;
        letter-spacing: 0.02em;
      }

      .status-pill.success {
        color: var(--teal);
        background: var(--teal-soft);
      }

      .status-pill.info {
        color: var(--info);
        background: var(--info-soft);
      }

      .status-pill.warning {
        color: var(--gold);
        background: var(--gold-soft);
      }

      .status-pill.error {
        color: var(--danger);
        background: var(--danger-soft);
      }

      .status-dot {
        width: 11px;
        height: 11px;
        border-radius: 50%;
        background: rgba(104, 119, 115, 0.72);
        transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
      }

      .status-dot.online {
        background: var(--teal);
        box-shadow: 0 0 0 6px rgba(15, 118, 110, 0.12);
        transform: scale(1.02);
      }

      h1,
      h2,
      h3 {
        margin: 0;
      }

      h1 {
        max-width: 780px;
        font-size: clamp(26px, 4.2vw, 40px);
        line-height: 1;
        letter-spacing: -0.045em;
      }

      h2 {
        font-size: 22px;
        letter-spacing: -0.03em;
      }

      .hero-copy p,
      .panel-head p,
      .note-text,
      .muted {
        margin: 0;
        color: var(--muted);
        line-height: 1.7;
        font-size: 14px;
      }

      .hero-grid,
      .info-grid,
      .activity-grid,
      .metrics-grid,
      .telemetry-grid,
      .changes-grid {
        display: grid;
        gap: 14px;
      }

      .hero-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }

      .info-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .activity-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        margin-bottom: 18px;
      }

      .metrics-grid {
        grid-template-columns: minmax(320px, 380px) minmax(0, 1fr);
        margin-bottom: 18px;
      }

      .telemetry-grid,
      .changes-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        margin-bottom: 18px;
      }

      .card,
      .hero-card,
      .info-card,
      .summary-card {
        position: relative;
        border-radius: var(--radius-lg);
        border: 1px solid rgba(23, 32, 31, 0.08);
        background: var(--surface-strong);
      }

      .card,
      .summary-card {
        padding: 22px;
      }

      .hero-card,
      .info-card {
        padding: 18px;
      }

      .info-card.success {
        background: linear-gradient(180deg, rgba(15, 118, 110, 0.08), rgba(255, 251, 247, 0.98));
      }

      .info-card.warning {
        background: linear-gradient(180deg, rgba(153, 96, 24, 0.08), rgba(255, 251, 247, 0.98));
      }

      .label {
        color: var(--muted);
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .value {
        margin-top: 10px;
        white-space: pre-wrap;
        word-break: break-word;
        line-height: 1.62;
        font-size: 15px;
      }

      .value-row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }

      .field-link {
        color: var(--accent-strong);
        text-decoration: none;
        word-break: break-all;
      }

      .field-link:hover {
        text-decoration: underline;
      }

      .field-code {
        display: inline-block;
        padding: 10px 12px;
        border-radius: 14px;
        background: rgba(23, 32, 31, 0.06);
        color: var(--page-ink);
        font-family: "IBM Plex Mono", "JetBrains Mono", monospace;
        font-size: 13px;
      }

      .surface-layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 340px;
        gap: 18px;
        margin-bottom: 18px;
      }

      .stack {
        display: grid;
        gap: 18px;
      }

      .primary-stack {
        order: 1;
      }

      .side-context-stack {
        order: 2;
      }

      .panel {
        padding: 24px;
      }

      .panel-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 14px;
        margin-bottom: 18px;
      }

      .panel-subgrid {
        display: grid;
        gap: 12px;
      }

      .meta-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .panel-note {
        padding: 14px 16px;
        border-radius: var(--radius-md);
        background: rgba(23, 32, 31, 0.05);
        border: 1px dashed rgba(23, 32, 31, 0.12);
      }

      .details-body {
        display: grid;
        gap: 18px;
        padding: 0 18px 18px;
      }

      .details-body.compact {
        gap: 14px;
      }

      .thread-tabs {
        display: grid;
        gap: 10px;
        max-height: 560px;
        overflow: auto;
        padding-right: 4px;
      }

      .thread-tab {
        width: 100%;
        min-width: 0;
        max-width: none;
        padding: 14px 16px;
        border-radius: 18px;
        border: 1px solid rgba(23, 32, 31, 0.1);
        background: rgba(255, 255, 255, 0.9);
        box-shadow: none;
        color: var(--page-ink);
        text-align: left;
      }

      .thread-tab.active {
        border-color: rgba(187, 78, 47, 0.34);
        background: linear-gradient(180deg, rgba(187, 78, 47, 0.08), rgba(255, 251, 247, 0.98));
        box-shadow: 0 14px 30px rgba(149, 53, 29, 0.12);
      }

      .thread-tab-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 8px;
      }

      .thread-tab-title {
        font-size: 13px;
        font-weight: 800;
        letter-spacing: -0.01em;
        line-height: 1.4;
        display: -webkit-box;
        overflow: hidden;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }

      .thread-tab-subtitle {
        color: var(--muted);
        font-size: 12px;
        line-height: 1.55;
        white-space: normal;
      }

      .thread-tab-empty {
        padding: 18px;
        border-radius: 18px;
        border: 1px dashed rgba(23, 32, 31, 0.14);
        color: var(--muted);
        background: rgba(255, 255, 255, 0.62);
      }

      .field {
        display: grid;
        gap: 10px;
      }

      .field > span,
      .field label,
      label {
        color: var(--page-ink);
        font-size: 14px;
        font-weight: 700;
      }

      input,
      textarea,
      button {
        font: inherit;
      }

      input,
      textarea {
        width: 100%;
        border: 1px solid rgba(23, 32, 31, 0.14);
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.94);
        color: var(--page-ink);
        padding: 15px 16px;
        transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
      }

      input {
        font-size: 16px;
        letter-spacing: 0.01em;
        text-align: left;
        font-weight: 600;
      }

      #pin-input {
        font-size: 26px;
        letter-spacing: 0.34em;
        text-align: center;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }

      textarea {
        min-height: 132px;
        resize: vertical;
        line-height: 1.72;
        font-size: 15px;
      }

      input:focus,
      textarea:focus {
        outline: none;
        border-color: rgba(187, 78, 47, 0.52);
        box-shadow: 0 0 0 5px rgba(187, 78, 47, 0.12);
      }

      .input-note {
        margin: 0;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.55;
      }

      .action-row {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      .action-row.compact {
        margin-top: -2px;
      }

      .compose-target {
        display: grid;
        gap: 10px;
        padding: 14px 16px;
        border-radius: var(--radius-md);
        border: 1px solid rgba(23, 32, 31, 0.1);
        background: rgba(255, 255, 255, 0.74);
      }

      .compose-target-copy {
        display: grid;
        gap: 6px;
      }

      .workspace-stack {
        display: grid;
        gap: 18px;
      }

      .workspace-shell {
        display: grid;
        grid-template-columns: minmax(250px, 300px) minmax(0, 1fr);
        gap: 18px;
        align-items: start;
      }

      .session-sidebar,
      .workspace-main,
      .run-stage {
        display: grid;
        gap: 14px;
        min-width: 0;
      }

      .session-sidebar-panel,
      .workspace-main-card {
        border-radius: var(--radius-lg);
        border: 1px solid rgba(23, 32, 31, 0.08);
        background: rgba(255, 255, 255, 0.84);
      }

      .session-sidebar-panel {
        padding: 18px;
      }

      .workspace-main-card {
        padding: 20px;
      }

      .composer-panel {
        gap: 14px;
      }

      .draft-tools summary {
        padding: 0;
      }

      .draft-tools .details-body {
        display: grid;
        gap: 10px;
        padding: 12px 0 0;
      }

      .session-current-title {
        margin-top: 10px;
        font-size: 22px;
        font-weight: 800;
        letter-spacing: -0.03em;
        line-height: 1.22;
      }

      .session-meta-grid {
        display: grid;
        gap: 10px;
        margin-top: 14px;
      }

      .session-meta-item {
        padding: 12px 14px;
        border-radius: 14px;
        border: 1px solid rgba(23, 32, 31, 0.08);
        background: rgba(255, 255, 255, 0.94);
      }

      .session-meta-item .value {
        margin-top: 6px;
        font-size: 14px;
      }

      .session-sidebar-toolbar {
        display: grid;
        gap: 12px;
      }

      .session-sidebar-toolbar .action-row {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .session-sidebar-toolbar .action-row button,
      .session-sidebar-toolbar > button {
        width: 100%;
      }

      .workspace-summary {
        display: grid;
        gap: 14px;
        margin-bottom: 18px;
      }

      .workspace-toolbar {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        padding: 14px 16px;
        border-radius: var(--radius-md);
        border: 1px solid rgba(23, 32, 31, 0.08);
        background: rgba(255, 255, 255, 0.76);
      }

      .workspace-summary-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }

      .workspace-card {
        padding: 16px 18px;
      }

      .workspace-card .value {
        margin-top: 8px;
      }

      .workspace-card.primary {
        background: linear-gradient(
          180deg,
          rgba(187, 78, 47, 0.08),
          rgba(255, 251, 247, 0.98)
        );
      }

      .inspector-stack {
        display: grid;
        gap: 18px;
      }

      .results-empty {
        display: grid;
        gap: 10px;
        text-align: left;
      }

      .results-empty strong {
        font-size: 18px;
        letter-spacing: -0.02em;
      }

      .conversation-panel {
        padding: 0;
        overflow: hidden;
      }

      .conversation-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 14px;
        padding: 20px 20px 0;
      }

      .conversation-strip {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 12px 20px 0;
      }

      .conversation-chip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        padding: 8px 12px;
        border-radius: 999px;
        border: 1px solid rgba(23, 32, 31, 0.08);
        background: rgba(255, 255, 255, 0.94);
      }

      .conversation-chip strong {
        color: var(--page-ink);
        font-size: 13px;
        font-weight: 800;
      }

      .transcript-shell {
        display: grid;
        gap: 12px;
        padding: 0 20px 20px;
      }

      .thread-transcript {
        display: grid;
        gap: 16px;
        max-height: clamp(320px, 58vh, 720px);
        overflow: auto;
        padding-right: 4px;
      }

      .transcript-empty {
        padding: 18px;
        border-radius: 18px;
        border: 1px dashed rgba(23, 32, 31, 0.14);
        background: rgba(255, 255, 255, 0.72);
        color: var(--muted);
        line-height: 1.65;
      }

      .transcript-message {
        display: grid;
        gap: 8px;
        animation: rise-in 0.22s ease;
      }

      .transcript-message.user {
        justify-items: end;
      }

      .transcript-message.assistant {
        justify-items: start;
      }

      .transcript-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .transcript-role {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .transcript-message.user .transcript-role {
        background: rgba(187, 78, 47, 0.12);
        color: var(--accent-strong);
      }

      .transcript-message.assistant .transcript-role {
        background: rgba(23, 32, 31, 0.08);
        color: var(--page-ink);
      }

      .transcript-time {
        color: var(--muted);
        font-size: 12px;
      }

      .transcript-bubble {
        width: min(100%, 760px);
        padding: 15px 16px;
        border-radius: 22px;
        border: 1px solid rgba(23, 32, 31, 0.08);
        background: rgba(255, 255, 255, 0.96);
        color: var(--page-ink);
        line-height: 1.7;
        white-space: pre-wrap;
        word-break: break-word;
        box-shadow: 0 18px 34px rgba(23, 32, 31, 0.06);
      }

      .transcript-bubble.code {
        padding: 0;
        overflow: hidden;
        background: var(--code-bg);
        color: var(--code-ink);
        border-color: rgba(16, 25, 24, 0.4);
      }

      .transcript-output {
        margin: 0;
        max-height: none;
        padding: 16px;
        border-radius: 0;
        background: transparent;
        color: inherit;
        white-space: pre-wrap;
        word-break: break-word;
        line-height: 1.58;
        font-size: 12px;
        font-family: "IBM Plex Mono", "JetBrains Mono", "SFMono-Regular", monospace;
      }

      .transcript-message.user .transcript-bubble {
        border-color: rgba(187, 78, 47, 0.28);
        border-bottom-right-radius: 8px;
        background: linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%);
        color: #fff;
        box-shadow: 0 18px 34px rgba(149, 53, 29, 0.18);
      }

      .transcript-message.assistant .transcript-bubble {
        border-bottom-left-radius: 8px;
      }

      .transcript-message.assistant.running .transcript-bubble {
        border-style: dashed;
        border-color: rgba(36, 102, 140, 0.24);
        background: rgba(232, 242, 247, 0.94);
      }

      .transcript-message.assistant.running .transcript-bubble.code,
      .transcript-message.assistant.failed .transcript-bubble.code,
      .transcript-message.assistant.interrupted .transcript-bubble.code {
        background: var(--code-bg);
        color: var(--code-ink);
      }

      .transcript-message.assistant.failed .transcript-bubble {
        border-color: rgba(161, 42, 40, 0.2);
        background: rgba(255, 243, 239, 0.94);
      }

      .transcript-message.assistant.interrupted .transcript-bubble {
        border-color: rgba(165, 119, 41, 0.22);
        background: rgba(251, 246, 234, 0.94);
      }

      .run-summary-row {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        margin-bottom: 14px;
      }

      .run-summary-chip {
        padding: 12px 14px;
        border-radius: 14px;
        border: 1px solid rgba(23, 32, 31, 0.08);
        background: rgba(255, 255, 255, 0.94);
      }

      .run-summary-chip .value {
        margin-top: 6px;
        font-size: 14px;
      }

      .auth-checking-card {
        display: grid;
        gap: 12px;
      }

      .auth-checking-copy {
        display: grid;
        gap: 8px;
      }

      .command-tools {
        display: grid;
        gap: 12px;
        padding: 16px;
        border-radius: var(--radius-md);
        border: 1px dashed rgba(23, 32, 31, 0.12);
        background: rgba(255, 255, 255, 0.68);
      }

      .quick-command-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .quick-command {
        font-family: "IBM Plex Mono", "JetBrains Mono", monospace;
        font-size: 11px;
      }

      .command-output-meta {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }

      .danger-chip {
        color: var(--danger) !important;
        background: var(--danger-soft) !important;
      }

      .danger-chip:hover {
        background: rgba(161, 42, 40, 0.18) !important;
      }

      .mode-chip.active {
        background: linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%);
        color: #fff;
        box-shadow: 0 10px 24px rgba(149, 53, 29, 0.18);
      }

      .pin-progress {
        display: grid;
        grid-template-columns: repeat(var(--pin-slots), minmax(0, 1fr));
        gap: 8px;
      }

      .pin-slot {
        min-height: 50px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 14px;
        border: 1px dashed rgba(23, 32, 31, 0.18);
        background: rgba(255, 255, 255, 0.78);
        color: var(--accent-strong);
        font-size: 20px;
        font-weight: 700;
        transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
      }

      .pin-slot.filled {
        border-style: solid;
        border-color: rgba(187, 78, 47, 0.3);
        background: rgba(187, 78, 47, 0.08);
        transform: translateY(-1px);
      }

      .sticky-actions {
        position: sticky;
        bottom: 0;
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        padding-top: 10px;
        padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 4px);
        background: linear-gradient(180deg, rgba(255, 251, 247, 0), rgba(255, 251, 247, 0.96) 34%);
      }

      button {
        border: 0;
        border-radius: 999px;
        padding: 13px 20px;
        background: linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%);
        color: #fff;
        font-size: 14px;
        font-weight: 800;
        cursor: pointer;
        letter-spacing: 0.01em;
        transition: transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
        box-shadow: 0 14px 30px rgba(149, 53, 29, 0.24);
      }

      button:hover {
        transform: translateY(-1px);
      }

      button:disabled {
        cursor: not-allowed;
        opacity: 0.64;
        transform: none;
        box-shadow: none;
      }

      button.secondary {
        background: rgba(23, 32, 31, 0.06);
        color: var(--page-ink);
        box-shadow: none;
      }

      button.secondary:hover {
        background: rgba(23, 32, 31, 0.1);
      }

      .button-grow {
        flex: 1 1 180px;
      }

      .mini {
        padding: 8px 12px;
        font-size: 12px;
      }

      .status-badge {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 6px 12px;
        background: var(--gold-soft);
        color: var(--gold);
        font-size: 12px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .status-badge.success {
        background: var(--teal-soft);
        color: var(--teal);
      }

      .status-badge.info {
        background: var(--info-soft);
        color: var(--info);
      }

      .status-badge.warning {
        background: var(--gold-soft);
        color: var(--gold);
      }

      .status-badge.error {
        background: var(--danger-soft);
        color: var(--danger);
      }

      .list {
        margin: 12px 0 0;
        padding-left: 18px;
        line-height: 1.65;
        color: var(--page-ink);
      }

      .list li + li {
        margin-top: 6px;
      }

      .terminal-group {
        display: grid;
        gap: 12px;
      }

      details {
        overflow: hidden;
        border-radius: var(--radius-lg);
        border: 1px solid rgba(23, 32, 31, 0.1);
        background: rgba(255, 255, 255, 0.92);
      }

      details + details {
        margin-top: 12px;
      }

      details summary {
        list-style: none;
        cursor: pointer;
        padding: 16px 18px;
      }

      details summary::-webkit-details-marker {
        display: none;
      }

      .summary-line {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
      }

      .terminal {
        padding: 0 18px 18px;
      }

      .terminal-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 10px;
      }

      .terminal-title {
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      pre {
        margin: 0;
        max-height: 340px;
        overflow: auto;
        padding: 14px 15px;
        border-radius: 18px;
        background: var(--code-bg);
        color: var(--code-ink);
        white-space: pre-wrap;
        word-break: break-word;
        line-height: 1.55;
        font-size: 12px;
        font-family: "IBM Plex Mono", "JetBrains Mono", "SFMono-Regular", monospace;
      }

      .empty-state {
        color: var(--muted);
      }

      .error-card {
        border-color: rgba(161, 42, 40, 0.18);
        background: linear-gradient(180deg, rgba(161, 42, 40, 0.08), rgba(255, 251, 247, 0.98));
      }

      .hidden {
        display: none !important;
      }

      @keyframes rise-in {
        from {
          opacity: 0;
          transform: translateY(18px);
        }

        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @media (max-width: 1024px) {
        .hero-grid,
        .info-grid,
        .activity-grid,
        .metrics-grid,
        .telemetry-grid,
        .changes-grid,
        .surface-layout,
        .workspace-shell {
          grid-template-columns: 1fr;
        }

        .thread-tabs {
          display: flex;
          overflow-x: auto;
          overflow-y: hidden;
          max-height: none;
          padding-right: 0;
          padding-bottom: 4px;
          scroll-snap-type: x proximity;
        }

        .thread-tab {
          min-width: 240px;
          scroll-snap-align: start;
        }
      }

      @media (max-width: 680px) {
        main {
          padding: 14px 12px 30px;
        }

        .hero,
        .panel,
        .card,
        .summary-card {
          padding: 18px;
        }

        .hero-head,
        .hero-title-row,
        .panel-head,
        .conversation-head,
        .summary-line,
        .value-row,
        .action-row {
          align-items: flex-start;
          flex-direction: column;
        }

        .hero-grid {
          grid-template-columns: 1fr;
        }

        .hero-strip {
          grid-template-columns: 1fr;
        }

        .meta-grid {
          grid-template-columns: 1fr;
        }

        .session-sidebar-toolbar .action-row,
        .conversation-meta,
        .run-summary-row,
        .workspace-summary-grid,
        .command-output-meta {
          grid-template-columns: 1fr 1fr;
        }

        #pin-input {
          font-size: 22px;
          letter-spacing: 0.26em;
        }

        .sticky-actions {
          flex-direction: column;
        }

        .button-grow {
          width: 100%;
          flex-basis: auto;
        }
      }

      @media (max-width: 520px) {
        .session-sidebar-toolbar .action-row,
        .hero-strip,
        .conversation-meta,
        .run-summary-row,
        .workspace-summary-grid,
        .command-output-meta {
          grid-template-columns: 1fr;
        }

        .conversation-strip {
          flex-direction: column;
        }
      }
    `;
}

function renderShell(model: SessionPageModel): string {
  const initialDetail = escapeHtml(
    model.initialState.detail ?? model.initialState.state,
  );
  const initialPreview = escapeHtml(
    model.initialState.lastPromptPreview ?? '暂无',
  );

  return `
    <main style="--pin-slots: ${model.pinLength};">
      <section class="surface hero hero-compact">
        <div class="hero-head">
            <div class="hero-copy">
              <div class="eyebrow">
                <span id="ws-status" class="status-dot offline" title="实时连接状态"></span>
                <span>${escapeHtml(model.modeLabel)}</span>
                <strong>${escapeHtml(model.targetLabel)}</strong>
              </div>
              <div class="hero-title-row">
                <h1>${escapeHtml(model.title)}</h1>
                <div class="pill">Session: ${escapeHtml(model.sessionId)}</div>
              </div>
            <p>左侧切换线程，右侧直接看对话并继续发送。</p>
            </div>
          </div>
        <div class="hero-strip">
          <div class="hero-chip">
            <div class="label">当前状态</div>
            <div class="hero-chip-value" id="status-text">${initialDetail}</div>
          </div>
          <div class="hero-chip">
            <div class="label">最近一次发送</div>
            <div class="hero-chip-value" id="last-text">${initialPreview}</div>
          </div>
          <div class="hero-chip">
            <div class="label">Session 过期时间</div>
            <div class="hero-chip-value" id="expiry-text">${escapeHtml(
              model.sessionExpiresAt,
            )}</div>
          </div>
        </div>
        <div class="hero-footer">
          <span class="status-pill warning" id="auth-status-pill">等待登录</span>
          <span class="status-badge" id="cli-status-badge">idle</span>
        </div>
      </section>

      <section class="stack workspace-stack">
        <section class="surface panel" id="login-view">
          <div class="panel-head">
            <div>
              <h2>输入 PIN 登录</h2>
              <p>支持粘贴和自动提交。输入满 ${
                model.pinLength
              } 位后会自动尝试登录，避免移动端键盘挡住操作。</p>
            </div>
            <div class="pill" id="pin-hint">请输入 ${
              model.pinLength
            } 位 PIN</div>
          </div>
          <form id="login-form" class="stack" novalidate>
            <label class="field" for="pin-input">
              <span>一次性 PIN</span>
              <input
                id="pin-input"
                type="tel"
                inputmode="numeric"
                pattern="[0-9]*"
                autocapitalize="off"
                spellcheck="false"
                autocomplete="one-time-code"
                enterkeyhint="done"
                maxlength="${model.pinLength}"
                placeholder="${'•'.repeat(model.pinLength)}"
                aria-describedby="pin-help"
              />
            </label>
            <p class="input-note" id="pin-help">如果软键盘收起后不好点按钮，可以直接回车，或者输入满位数自动提交。</p>
            <div class="pin-progress" id="pin-progress">${renderPinSlots(
              model.pinLength,
            )}</div>
            <div class="sticky-actions">
              <button id="login-button" class="button-grow" type="submit">立即登录</button>
              <button id="ping-button" type="button" class="secondary">检查状态</button>
            </div>
          </form>
        </section>

        <section class="surface panel hidden" id="auth-checking-view">
          <div class="auth-checking-card">
            <div class="eyebrow">
              <span id="auth-checking-dot" class="status-dot"></span>
              <span>登录态校验中</span>
            </div>
            <div class="auth-checking-copy">
              <h2>正在确认你当前的会话是否仍然有效</h2>
              <p>如果 token 还有效，会直接恢复到主控制台；如果已经失效，会回到 PIN 登录页，不会先闪到错误的已登录界面。</p>
            </div>
          </div>
        </section>

        <section class="surface panel hidden" id="prompt-view">
          <div class="panel-head">
            <div>
              <h2>主控制台</h2>
              <p>左侧切换线程，右侧只保留对话和输入。</p>
            </div>
            <div class="pill" id="state-pill">${escapeHtml(
              model.initialState.state,
            )}</div>
          </div>
          <div class="workspace-shell" id="workspace-shell">
            <aside class="session-sidebar" id="session-sidebar">
              <section class="session-sidebar-panel">
                <div class="session-sidebar-toolbar">
                  <div class="value-row">
                    <div>
                      <div class="label">当前线程</div>
                      <div class="session-current-title" id="selected-thread-title">还没有线程</div>
                      <p class="input-note">左侧只负责切换当前线程。默认发送会继续当前线程。</p>
                    </div>
                    <div class="pill" id="thread-tabs-summary">暂无线程</div>
                  </div>
                  <div class="session-meta-grid">
                    <div class="session-meta-item">
                      <div class="label">状态</div>
                      <div class="value" id="selected-thread-status">idle</div>
                    </div>
                    <div class="session-meta-item">
                      <div class="label">Session</div>
                      <div class="value" id="selected-thread-session">-</div>
                    </div>
                    <div class="session-meta-item">
                      <div class="label">回合数</div>
                      <div class="value" id="selected-thread-turns">-</div>
                    </div>
                  </div>
                  <div class="action-row compact">
                    <button id="continue-thread-button" class="secondary mini mode-chip active" type="button">跟随当前线程</button>
                    <button id="new-thread-button" class="secondary mini mode-chip" type="button">新开线程</button>
                  </div>
                  <button id="interrupt-run-button" class="secondary mini danger-chip" type="button">中断当前线程</button>
                </div>
                <div class="thread-tabs" id="thread-tabs"></div>
              </section>
            </aside>

            <section class="workspace-main" id="workspace-main">
              <section class="workspace-main-card hidden" id="run-empty-view">
                <div class="results-empty">
                  <div class="label">Codex 对话</div>
                  <strong>还没有对话</strong>
                  <p class="note-text">先发送一条消息。右侧会直接出现当前线程的完整 Codex CLI 回复。</p>
                </div>
              </section>

              <div id="run-inspector-view" class="run-stage hidden">
                <section class="workspace-main-card conversation-panel">
                  <div class="conversation-head">
                    <div>
                      <div class="label">Codex 对话</div>
                      <h2>当前线程</h2>
                      <p>这里只保留完整对话和实时 CLI 输出。</p>
                    </div>
                    <span class="status-badge" id="run-status-badge-inline">idle</span>
                  </div>
                  <div class="conversation-strip">
                    <div class="conversation-chip">
                      <span class="label">Session</span>
                      <strong id="run-thread-session">-</strong>
                    </div>
                    <div class="conversation-chip">
                      <span class="label">回合</span>
                      <strong id="run-thread-turns">-</strong>
                    </div>
                    <div class="conversation-chip">
                      <span class="label">状态</span>
                      <strong id="run-status-text">idle</strong>
                    </div>
                    <div class="conversation-chip">
                      <span class="label">结果</span>
                      <strong id="run-result">-</strong>
                    </div>
                  </div>
                  <div class="transcript-shell">
                    <div class="thread-transcript" id="thread-transcript"></div>
                  </div>
                </section>
              </div>

              <form id="prompt-form" class="stack workspace-main-card composer-panel">
                <div class="panel-head">
                  <div>
                    <h2>继续输入</h2>
                    <p>选中左侧线程后直接发送；只有点“新开线程”才会另起一条。</p>
                  </div>
                </div>
                <label class="field" for="prompt-input">
                  <span>输入内容</span>
                  <textarea
                    id="prompt-input"
                    placeholder="例如：请继续上一个线程，整理问题并直接修改代码"
                  ></textarea>
                </label>
                <p class="input-note">支持 Ctrl+Enter / Cmd+Enter 直接提交。草稿会自动保存在当前浏览器里。</p>
                <div class="compose-target">
                  <div class="compose-target-copy">
                    <div class="label">发送目标</div>
                    <div class="value" id="compose-target-text">当前会新开一个线程</div>
                    <p class="input-note" id="compose-target-meta">选中左侧线程后，默认就会继续那条线程。</p>
                  </div>
                </div>
                <details class="draft-tools">
                  <summary>
                    <div class="summary-line">
                      <div>
                        <div class="label">更多操作</div>
                        <p class="input-note">草稿、刷新和退出都收在这里，避免主路径按钮过多。</p>
                      </div>
                      <div class="pill">可选</div>
                    </div>
                  </summary>
                  <div class="details-body compact">
                    <div class="action-row compact">
                      <button id="reuse-prompt-button" class="secondary mini" type="button">填入最近一次</button>
                      <button id="copy-last-prompt-button" class="secondary mini" type="button">复制最近一次</button>
                      <button id="clear-prompt-button" class="secondary mini" type="button">清空草稿</button>
                    </div>
                    <div class="action-row compact">
                      <button id="refresh-button" type="button" class="secondary mini">刷新状态</button>
                      <button id="logout-button" type="button" class="secondary mini">退出登录</button>
                    </div>
                  </div>
                </details>
                <div class="sticky-actions">
                  <button id="send-button" class="button-grow" type="submit">发送 Prompt</button>
                </div>
              </form>

              <details class="hidden" id="command-view">
                <summary>
                  <div class="summary-line">
                    <div>
                      <div class="label">可选工具</div>
                      <h2>服务器诊断</h2>
                    </div>
                    <div class="pill">默认折叠</div>
                  </div>
                </summary>
                <section class="command-tools">
                  <div class="action-row">
                    <button id="copy-server-command-output" class="secondary mini" type="button">复制输出</button>
                  </div>
                  <label class="field" for="server-command-input">
                    <span>诊断命令</span>
                    <input
                      id="server-command-input"
                      type="text"
                      inputmode="text"
                      autocapitalize="off"
                      spellcheck="false"
                      autocomplete="off"
                      placeholder="例如：nvidia-smi"
                    />
                  </label>
                  <p class="input-note">为避免把公网页面变成远程 shell，目前只支持这些只读命令：${escapeHtml(
                    SAFE_SERVER_COMMANDS.join(' / '),
                  )}</p>
                  <div class="quick-command-grid">
                    ${renderServerCommandChips()}
                  </div>
                  <div class="action-row">
                    <button id="run-server-command-button" class="button-grow" type="button">运行诊断命令</button>
                  </div>
                  <div class="command-output-meta">
                    <div class="info-card">
                      <div class="label">命令状态</div>
                      <div class="value" id="server-command-status">idle</div>
                    </div>
                    <div class="info-card">
                      <div class="label">开始时间</div>
                      <div class="value" id="server-command-started-at">-</div>
                    </div>
                    <div class="info-card">
                      <div class="label">耗时 / 退出码</div>
                      <div class="value" id="server-command-result">-</div>
                    </div>
                    <div class="info-card">
                      <div class="label">执行命令</div>
                      <div class="value" id="server-command-display">-</div>
                    </div>
                  </div>
                  <div class="terminal">
                    <div class="terminal-head">
                      <div class="terminal-title">server diagnostics</div>
                    </div>
                    <pre id="server-command-output" class="empty-state">暂无诊断输出</pre>
                  </div>
                </section>
              </details>

              <details id="advanced-details">
                <summary>
                  <div class="summary-line">
                    <div>
                      <div class="label">技术详情</div>
                      <h2>日志、参数和错误</h2>
                    </div>
                    <div class="pill">默认折叠</div>
                  </div>
                </summary>
                <div class="details-body compact">
                  <section class="activity-grid">
                    <section class="surface panel">
                      <div class="panel-head">
                        <div>
                          <h2>当前线程技术细节</h2>
                          <p>保留 requestId、时间线和原始 CLI 输出，方便排查问题，但不再占用主阅读区域。</p>
                        </div>
                      </div>
                      <div class="run-summary-row">
                        <div class="run-summary-chip">
                          <div class="label">requestId</div>
                          <div class="value" id="run-request-id">-</div>
                        </div>
                        <div class="run-summary-chip">
                          <div class="label">开始时间</div>
                          <div class="value" id="run-started-at">-</div>
                        </div>
                        <div class="run-summary-chip">
                          <div class="label">结束时间</div>
                          <div class="value" id="run-finished-at">-</div>
                        </div>
                        <div class="run-summary-chip">
                          <div class="label">耗时</div>
                          <div class="value" id="run-duration">-</div>
                        </div>
                      </div>
                      <div class="terminal-group">
                        <details open>
                          <summary>
                            <div class="summary-line">
                              <div>
                                <div class="label">CLI stdout</div>
                                <h3>标准输出</h3>
                              </div>
                              <button id="copy-stdout" class="secondary mini" type="button">复制</button>
                            </div>
                          </summary>
                          <div class="terminal">
                            <div class="terminal-head">
                              <div class="terminal-title">stdout</div>
                            </div>
                            <pre id="stdout-text">暂无 stdout</pre>
                          </div>
                        </details>
                        <details>
                          <summary>
                            <div class="summary-line">
                              <div>
                                <div class="label">CLI stderr</div>
                                <h3>标准错误</h3>
                              </div>
                              <button id="copy-stderr" class="secondary mini" type="button">复制</button>
                            </div>
                          </summary>
                          <div class="terminal">
                            <div class="terminal-head">
                              <div class="terminal-title">stderr</div>
                            </div>
                            <pre id="stderr-text">暂无 stderr</pre>
                          </div>
                        </details>
                        <details>
                          <summary>
                            <div class="summary-line">
                              <div>
                                <div class="label">执行摘要</div>
                                <h3>CLI 摘要</h3>
                              </div>
                              <button id="copy-cli-summary" class="secondary mini" type="button">复制摘要</button>
                            </div>
                          </summary>
                          <div class="terminal">
                            <div class="terminal-head">
                              <div class="terminal-title">summary</div>
                            </div>
                            <pre id="cli-summary">暂无 CLI 运行记录</pre>
                          </div>
                        </details>
                      </div>
                    </section>

                    <section class="surface panel">
                      <div class="panel-head">
                        <div>
                          <h2>最近一次 Prompt</h2>
                          <p>保留最近一次发送内容，方便重试和复用。</p>
                        </div>
                      </div>
                      <div class="meta-grid" style="margin-bottom: 12px;">
                        <div class="info-card">
                          <div class="label">requestId</div>
                          <div class="value" id="last-prompt-request">-</div>
                        </div>
                        <div class="info-card">
                          <div class="label">接收时间</div>
                          <div class="value" id="last-prompt-received">-</div>
                        </div>
                        <div class="info-card">
                          <div class="label">来源设备</div>
                          <div class="value" id="last-prompt-device">未记录</div>
                        </div>
                        <div class="info-card">
                          <div class="label">状态快照</div>
                          <div class="value" id="last-prompt-status">暂无</div>
                        </div>
                      </div>
                      <pre id="last-prompt-text" class="empty-state">暂无最近一次 prompt</pre>
                    </section>

                    <section class="surface panel">
                      <div class="panel-head">
                        <div>
                          <h2>最近错误</h2>
                          <p>登录、转发或 CLI 执行失败时，这里保留错误上下文。</p>
                        </div>
                      </div>
                      <div class="meta-grid" style="margin-bottom: 12px;">
                        <div class="info-card error-card">
                          <div class="label">错误码</div>
                          <div class="value" id="error-code">暂无错误</div>
                        </div>
                        <div class="info-card error-card">
                          <div class="label">是否可重试</div>
                          <div class="value" id="error-recoverable">-</div>
                        </div>
                        <div class="info-card error-card">
                          <div class="label">错误 requestId</div>
                          <div class="value" id="error-request-id">-</div>
                        </div>
                        <div class="info-card error-card">
                          <div class="label">错误时间</div>
                          <div class="value" id="error-updated-at">-</div>
                        </div>
                      </div>
                      <pre id="error-message" class="empty-state">当前没有错误记录</pre>
                    </section>
                  </section>

                  <section class="telemetry-grid">
                    <section class="surface panel">
                      <div class="panel-head">
                        <div>
                          <h2>CLI 运行环境</h2>
                          <p>model/provider/approval/sandbox 和 Codex session 等信息统一放到这里。</p>
                        </div>
                        <button id="copy-cli-runtime" class="secondary mini" type="button">复制环境</button>
                      </div>
                      <div class="summary-card">
                        <div class="label">CLI 运行环境</div>
                        <div class="value" id="cli-runtime">暂无</div>
                      </div>
                    </section>

                    <section class="surface panel">
                      <div class="panel-head">
                        <div>
                          <h2>参数快照</h2>
                          <p>区分配置参数和实际执行参数，便于定位 prompt mode 和 resume 参数。</p>
                        </div>
                      </div>
                      <div class="panel-subgrid">
                        <div class="info-card">
                          <div class="label">配置参数</div>
                          <div class="value" id="cli-configured-args">暂无</div>
                        </div>
                        <div class="info-card">
                          <div class="label">实际执行参数</div>
                          <div class="value" id="cli-resolved-args">暂无</div>
                        </div>
                      </div>
                    </section>

                    <section class="surface panel">
                      <div class="panel-head">
                        <div>
                          <h2>会话时钟</h2>
                          <p>同时显示 session 过期时间和当前 authToken 的过期时间。</p>
                        </div>
                      </div>
                      <div class="panel-subgrid">
                        <div class="info-card">
                          <div class="label">Session 过期</div>
                          <div class="value" id="session-expiry-panel">${escapeHtml(
                            model.sessionExpiresAt,
                          )}</div>
                        </div>
                        <div class="info-card">
                          <div class="label">登录态过期</div>
                          <div class="value" id="auth-expiry-text">未登录</div>
                        </div>
                      </div>
                    </section>
                  </section>

                  <section class="surface panel">
                    <div class="panel-head">
                      <div>
                        <h2>变更追踪</h2>
                        <p>展示从 CLI 输出中推测的变更文件，以及运行前后的 Git 差异快照。</p>
                      </div>
                    </div>
                    <div class="panel-subgrid">
                      <div class="info-card">
                        <div class="label">推测变更文件</div>
                        <ul class="list" id="changed-files-list"></ul>
                      </div>
                      <div class="info-card">
                        <div class="label">Git 变更文件</div>
                        <ul class="list" id="git-files-list"></ul>
                      </div>
                    </div>
                  </section>
                </div>
              </details>
            </section>
          </div>
        </section>

        <details class="surface panel" id="workspace-context-details">
          <summary>
            <div class="summary-line">
              <div>
                <div class="label">连接信息</div>
                <h2>运行上下文与访问地址</h2>
              </div>
              <div class="pill">低频信息</div>
            </div>
          </summary>
          <div class="details-body">
            <section>
              <div class="panel-head">
                <div>
                  <h2>运行上下文</h2>
                  <p>这里展示当前会话实际会用到的入口、目标和 CLI 基础配置。</p>
                </div>
              </div>
              <div class="info-grid">
                ${renderFieldCards(model.infoFields, '当前没有额外上下文')}
              </div>
            </section>

            <section>
              <div class="panel-head">
                <div>
                  <h2>访问地址</h2>
                  <p>推荐链接、公网入口、本机地址和局域网地址都可以在这里直接复制或打开。</p>
                </div>
              </div>
              <div class="info-grid">
                ${renderFieldCards(
                  model.accessFields,
                  '当前没有可展示的访问地址',
                )}
              </div>
              ${
                model.note
                  ? `<div class="panel-note" style="margin-top: 14px;"><p class="note-text">${escapeHtml(
                      model.note,
                    )}</p></div>`
                  : ''
              }
            </section>
          </div>
        </details>
      </section>
    </main>
  `;
}

function renderClientScript(model: SessionPageModel): string {
  const pageData = serializeForInlineScript({
    sessionId: model.sessionId,
    pinLength: model.pinLength,
    initialState: model.initialState,
  });

  return `
      (() => {
        const pageData = ${pageData};
        const sessionId = pageData.sessionId;
        const pinLength = Number(pageData.pinLength) || 6;
        const initialState = pageData.initialState;
        const storageKey = 'prompt-bridge-auth:' + sessionId;
        const draftStorageKey = 'prompt-bridge-draft:' + sessionId;
        const elements = {
          loginView: document.getElementById('login-view'),
          authCheckingView: document.getElementById('auth-checking-view'),
          loginForm: document.getElementById('login-form'),
          loginButton: document.getElementById('login-button'),
          pingButton: document.getElementById('ping-button'),
          pinInput: document.getElementById('pin-input'),
          pinHint: document.getElementById('pin-hint'),
          pinProgress: document.getElementById('pin-progress'),
          promptView: document.getElementById('prompt-view'),
          commandView: document.getElementById('command-view'),
          promptForm: document.getElementById('prompt-form'),
          promptInput: document.getElementById('prompt-input'),
          selectedThreadTitle: document.getElementById('selected-thread-title'),
          selectedThreadStatus: document.getElementById('selected-thread-status'),
          selectedThreadSession: document.getElementById('selected-thread-session'),
          selectedThreadTurns: document.getElementById('selected-thread-turns'),
          composeTargetText: document.getElementById('compose-target-text'),
          composeTargetMeta: document.getElementById('compose-target-meta'),
          newThreadButton: document.getElementById('new-thread-button'),
          continueThreadButton: document.getElementById('continue-thread-button'),
          reusePromptButton: document.getElementById('reuse-prompt-button'),
          copyLastPromptButton: document.getElementById('copy-last-prompt-button'),
          clearPromptButton: document.getElementById('clear-prompt-button'),
          interruptRunButton: document.getElementById('interrupt-run-button'),
          sendButton: document.getElementById('send-button'),
          refreshButton: document.getElementById('refresh-button'),
          logoutButton: document.getElementById('logout-button'),
          serverCommandInput: document.getElementById('server-command-input'),
          runServerCommandButton: document.getElementById('run-server-command-button'),
          copyServerCommandOutputButton: document.getElementById('copy-server-command-output'),
          serverCommandStatus: document.getElementById('server-command-status'),
          serverCommandStartedAt: document.getElementById('server-command-started-at'),
          serverCommandResult: document.getElementById('server-command-result'),
          serverCommandDisplay: document.getElementById('server-command-display'),
          serverCommandOutput: document.getElementById('server-command-output'),
          statusText: document.getElementById('status-text'),
          lastText: document.getElementById('last-text'),
          expiryText: document.getElementById('expiry-text'),
          sessionExpiryPanel: document.getElementById('session-expiry-panel'),
          authExpiryText: document.getElementById('auth-expiry-text'),
          authStatusPill: document.getElementById('auth-status-pill'),
          statePill: document.getElementById('state-pill'),
          cliStatusBadge: document.getElementById('cli-status-badge'),
          threadTabs: document.getElementById('thread-tabs'),
          threadTabsSummary: document.getElementById('thread-tabs-summary'),
          runStatusBadgeInline: document.getElementById('run-status-badge-inline'),
          runThreadSession: document.getElementById('run-thread-session'),
          runThreadTurns: document.getElementById('run-thread-turns'),
          threadTranscript: document.getElementById('thread-transcript'),
          runRequestId: document.getElementById('run-request-id'),
          runStatusText: document.getElementById('run-status-text'),
          runStartedAt: document.getElementById('run-started-at'),
          runFinishedAt: document.getElementById('run-finished-at'),
          runDuration: document.getElementById('run-duration'),
          runResult: document.getElementById('run-result'),
          cliSummary: document.getElementById('cli-summary'),
          copyCliSummaryButton: document.getElementById('copy-cli-summary'),
          cliRuntime: document.getElementById('cli-runtime'),
          copyCliRuntimeButton: document.getElementById('copy-cli-runtime'),
          cliConfiguredArgs: document.getElementById('cli-configured-args'),
          cliResolvedArgs: document.getElementById('cli-resolved-args'),
          runEmptyView: document.getElementById('run-empty-view'),
          runInspectorView: document.getElementById('run-inspector-view'),
          advancedDetails: document.getElementById('advanced-details'),
          lastPromptRequest: document.getElementById('last-prompt-request'),
          lastPromptReceived: document.getElementById('last-prompt-received'),
          lastPromptDevice: document.getElementById('last-prompt-device'),
          lastPromptStatus: document.getElementById('last-prompt-status'),
          lastPromptText: document.getElementById('last-prompt-text'),
          errorCode: document.getElementById('error-code'),
          errorRecoverable: document.getElementById('error-recoverable'),
          errorRequestId: document.getElementById('error-request-id'),
          errorUpdatedAt: document.getElementById('error-updated-at'),
          errorMessage: document.getElementById('error-message'),
          changedFilesList: document.getElementById('changed-files-list'),
          gitFilesList: document.getElementById('git-files-list'),
          stdoutText: document.getElementById('stdout-text'),
          stderrText: document.getElementById('stderr-text'),
          copyStdoutButton: document.getElementById('copy-stdout'),
          copyStderrButton: document.getElementById('copy-stderr'),
          wsStatus: document.getElementById('ws-status'),
        };

        const state = {
          authToken: window.sessionStorage.getItem(storageKey) || '',
          socket: undefined,
          latestCliRun: initialState.lastCliRun || null,
          cliRuns: Array.isArray(initialState.recentCliRuns)
            ? initialState.recentCliRuns.slice()
            : initialState.lastCliRun
              ? [initialState.lastCliRun]
              : [],
          selectedRunRequestId:
            Array.isArray(initialState.recentCliRuns) && initialState.recentCliRuns.length > 0
              ? initialState.recentCliRuns[0].requestId
              : initialState.lastCliRun
                ? initialState.lastCliRun.requestId
                : '',
          lastPrompt: initialState.lastPrompt || null,
          lastError: initialState.lastError || null,
          lastCommandRun: null,
          composeMode: 'auto',
          reconnectTimer: null,
          reconnectAttempts: 0,
          allowReconnect: true,
          authChecking: Boolean(
            window.sessionStorage.getItem(storageKey) || '',
          ),
          loginPending: false,
          sendPending: false,
          commandPending: false,
        };

        const quickCommandButtons = Array.from(document.querySelectorAll('[data-server-command]'));

        const requestTimeoutMs = 8000;
        const submitTimeoutMs = 360000;
        const commandTimeoutMs = 20000;
        const reconnectBaseDelayMs = 1200;
        const reconnectMaxDelayMs = 15000;

        function nextRequestId() {
          if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
          }
          return 'req-' + Date.now() + '-' + Math.random().toString(16).slice(2);
        }

        function sanitizePin(raw) {
          return String(raw || '').replace(/\\D+/g, '').slice(0, pinLength);
        }

        function setStatus(message) {
          elements.statusText.textContent = String(message || '');
        }

        function setAuthed(enabled) {
          elements.loginView.classList.toggle('hidden', enabled);
          elements.authCheckingView.classList.add('hidden');
          elements.promptView.classList.toggle('hidden', !enabled);
          elements.commandView.classList.toggle('hidden', !enabled);
          if (!enabled) {
            elements.runEmptyView.classList.add('hidden');
            elements.runInspectorView.classList.add('hidden');
            return;
          }
          if (state.latestCliRun) {
            elements.runEmptyView.classList.add('hidden');
            elements.runInspectorView.classList.remove('hidden');
            return;
          }
          elements.runEmptyView.classList.remove('hidden');
          elements.runInspectorView.classList.add('hidden');
        }

        function setAuthChecking(enabled) {
          state.authChecking = Boolean(enabled);
          elements.authCheckingView.classList.toggle('hidden', !enabled);
          if (!enabled) {
            return;
          }
          elements.authStatusPill.classList.remove(
            'success',
            'info',
            'warning',
            'error',
          );
          elements.authStatusPill.classList.add('info');
          elements.authStatusPill.textContent = '校验中';
          elements.authExpiryText.textContent = '正在确认当前 token';
          updateStatePill('checking_auth', false);
          elements.loginView.classList.add('hidden');
          elements.promptView.classList.add('hidden');
          elements.commandView.classList.add('hidden');
          elements.runEmptyView.classList.add('hidden');
          elements.runInspectorView.classList.add('hidden');
          setStatus('正在校验登录态...');
        }

        function setAuthToken(token) {
          state.authToken = token ? String(token) : '';
          if (state.authToken) {
            window.sessionStorage.setItem(storageKey, state.authToken);
          } else {
            window.sessionStorage.removeItem(storageKey);
          }
        }

        function setSocketIndicator(isOnline, title) {
          elements.wsStatus.classList.toggle('online', isOnline);
          elements.wsStatus.classList.toggle('offline', !isOnline);
          elements.wsStatus.title = title;
        }

        function setAuthStatus(authenticated, authExpiresAt) {
          elements.authStatusPill.classList.remove(
            'success',
            'info',
            'warning',
            'error',
          );
          if (authenticated) {
            elements.authStatusPill.classList.add('success');
            elements.authStatusPill.textContent = authExpiresAt
              ? '已登录 · 到 ' + authExpiresAt
              : '已登录';
            elements.authExpiryText.textContent = authExpiresAt || '已登录，未提供过期时间';
            return;
          }
          elements.authStatusPill.classList.add('warning');
          elements.authStatusPill.textContent = '等待登录';
          elements.authExpiryText.textContent = '未登录';
        }

        function resetToLoginState(message) {
          setAuthToken('');
          closeSocket(true);
          setAuthChecking(false);
          setAuthed(false);
          setAuthStatus(false);
          updateStatePill('awaiting_login', false);
          setStatus(message || '登录态已失效，请重新输入 PIN');
          updatePinState();
          elements.pinInput.focus();
        }

        function clearReconnectTimer() {
          if (!state.reconnectTimer) {
            return;
          }
          window.clearTimeout(state.reconnectTimer);
          state.reconnectTimer = null;
        }

        function closeSocket(permanent) {
          if (permanent) {
            state.allowReconnect = false;
          }
          clearReconnectTimer();
          if (state.socket) {
            state.socket.close(1000, 'manual_close');
            state.socket = undefined;
          }
          setSocketIndicator(false, '实时连接未建立');
        }

        function scheduleReconnect() {
          if (!state.allowReconnect || state.reconnectTimer || !state.authToken) {
            return;
          }
          state.reconnectAttempts += 1;
          const delayMs = Math.min(
            reconnectBaseDelayMs * Math.pow(1.6, state.reconnectAttempts - 1),
            reconnectMaxDelayMs,
          );
          setSocketIndicator(false, '连接中断，正在自动重连...');
          state.reconnectTimer = window.setTimeout(() => {
            state.reconnectTimer = null;
            connectSocket();
          }, delayMs);
        }

        function setBusy(button, busy, busyLabel) {
          button.disabled = busy;
          button.dataset.originalText = button.dataset.originalText || button.textContent || '';
          button.textContent = busy ? busyLabel : button.dataset.originalText;
        }

        function normalizeClientError(error) {
          if (error && error.name === 'AbortError') {
            return '请求超时，请检查桌面端服务和本机网络。';
          }
          if (error instanceof Error && error.message) {
            return error.message;
          }
          return '请求失败，请确认手机可以访问桌面端服务。';
        }

        function safeText(value, fallback) {
          if (value === undefined || value === null || value === '') {
            return fallback;
          }
          return String(value);
        }

        function formatDuration(durationMs) {
          if (typeof durationMs !== 'number' || Number.isNaN(durationMs)) {
            return '-';
          }
          if (durationMs < 1000) {
            return durationMs + 'ms';
          }
          return (durationMs / 1000).toFixed(2) + 's';
        }

        function formatListValue(values, emptyText) {
          if (!Array.isArray(values) || values.length === 0) {
            return emptyText;
          }
          return values.map((item) => String(item)).join('\\n');
        }

        function compactText(value, maxLength) {
          const normalized = String(value || '').replace(/\\s+/g, ' ').trim();
          if (!normalized) {
            return '';
          }
          if (normalized.length <= maxLength) {
            return normalized;
          }
          return normalized.slice(0, Math.max(1, maxLength - 1)).trimEnd() + '…';
        }

        function formatDisplayTime(value) {
          if (!value) {
            return '';
          }
          const date = new Date(value);
          if (Number.isNaN(date.getTime())) {
            return String(value);
          }
          return date.toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });
        }

        function normalizeRunStatus(status) {
          if (
            status === 'running' ||
            status === 'succeeded' ||
            status === 'failed' ||
            status === 'interrupted'
          ) {
            return status;
          }
          return 'idle';
        }

        function getStatusBadgeClassName(status) {
          const normalized = normalizeRunStatus(status);
          if (normalized === 'succeeded') {
            return ' success';
          }
          if (normalized === 'running') {
            return ' info';
          }
          if (normalized === 'interrupted') {
            return ' warning';
          }
          if (normalized === 'failed') {
            return ' error';
          }
          return '';
        }

        function applyStatusBadge(element, status) {
          const normalized = normalizeRunStatus(status);
          element.className = 'status-badge' + getStatusBadgeClassName(normalized);
          element.textContent = normalized;
        }

        function getRunPromptText(run) {
          if (!run) {
            return '未记录 prompt';
          }
          return String(run.promptText || run.promptPreview || '未记录 prompt').trim();
        }

        function mergeLegacyRunOutput(run) {
          const parts = [];
          const stderr = String(run && run.stderr ? run.stderr : '').trimEnd();
          const stdout = String(run && run.stdout ? run.stdout : '').trimEnd();
          if (stderr) {
            parts.push(stderr);
          }
          if (stdout) {
            parts.push(stdout);
          }
          return parts.join('\\n');
        }

        function getRunFullOutput(run) {
          if (!run) {
            return '';
          }
          const combinedOutput = String(run.combinedOutput || '');
          if (combinedOutput.trim()) {
            return combinedOutput;
          }
          const mergedLegacyOutput = mergeLegacyRunOutput(run);
          if (mergedLegacyOutput.trim()) {
            return mergedLegacyOutput;
          }
          const failureMessage = String(run.failureMessage || '').trim();
          if (failureMessage) {
            return failureMessage;
          }
          return run.status === 'running' ? 'Codex CLI 正在回复...' : '当前线程还没有可展示的 CLI 输出。';
        }

        function getRunAssistantPreview(run) {
          const fullOutput = compactText(getRunFullOutput(run), 80);
          if (fullOutput) {
            return fullOutput;
          }
          if (!run) {
            return '';
          }
          if (run.status === 'running') {
            return 'Codex CLI 正在回复...';
          }
          if (run.status === 'failed') {
            return 'Codex CLI 执行失败';
          }
          if (run.status === 'interrupted') {
            return '当前线程已中断';
          }
          return '暂无回复';
        }

        function getEffectiveComposeMode() {
          const hasSelectedThread = Boolean(getSelectedResumeSessionId());
          if (state.composeMode === 'new') {
            return 'new';
          }
          return hasSelectedThread ? 'resume' : 'new';
        }

        function compareRunsByStartedAt(left, right) {
          const leftTime = Date.parse(String(left && left.startedAt ? left.startedAt : ''));
          const rightTime = Date.parse(String(right && right.startedAt ? right.startedAt : ''));
          const hasLeftTime = !Number.isNaN(leftTime);
          const hasRightTime = !Number.isNaN(rightTime);
          if (hasLeftTime && hasRightTime && leftTime !== rightTime) {
            return leftTime - rightTime;
          }
          if (hasLeftTime && !hasRightTime) {
            return -1;
          }
          if (!hasLeftTime && hasRightTime) {
            return 1;
          }
          return String(left && left.requestId ? left.requestId : '').localeCompare(
            String(right && right.requestId ? right.requestId : ''),
          );
        }

        function renderList(element, values, emptyText) {
          element.innerHTML = '';
          if (!Array.isArray(values) || values.length === 0) {
            const item = document.createElement('li');
            item.textContent = emptyText;
            element.appendChild(item);
            return;
          }
          values.forEach((value) => {
            const item = document.createElement('li');
            item.textContent = String(value);
            element.appendChild(item);
          });
        }

        function setCodeOutput(element, value, emptyHint) {
          const text = String(value || '').trim();
          element.textContent = text || emptyHint;
          element.classList.toggle('empty-state', !text);
        }

        function updateCliBadge(status) {
          applyStatusBadge(elements.cliStatusBadge, status);
        }

        function updateStatePill(stateValue, authenticated) {
          elements.statePill.classList.remove('success', 'error');
          if (authenticated) {
            elements.statePill.classList.add('success');
          } else if (stateValue === 'error') {
            elements.statePill.classList.add('error');
          }
          elements.statePill.textContent = authenticated
            ? 'authenticated'
            : String(stateValue || 'awaiting_login');
        }

        function renderPinProgress(value) {
          const normalized = sanitizePin(value);
          const slots = Array.from(elements.pinProgress.children);
          slots.forEach((slot, index) => {
            slot.classList.toggle('filled', index < normalized.length);
            slot.textContent = index < normalized.length ? normalized[index] : '';
          });
        }

        function persistDraft() {
          const draft = String(elements.promptInput.value || '');
          if (draft.trim()) {
            window.localStorage.setItem(draftStorageKey, draft);
            return;
          }
          window.localStorage.removeItem(draftStorageKey);
        }

        function renderLastPrompt(prompt, stateLabel) {
          state.lastPrompt = prompt || null;
          elements.lastPromptRequest.textContent = safeText(prompt && prompt.requestId, '-');
          elements.lastPromptReceived.textContent = safeText(prompt && prompt.receivedAt, '-');
          elements.lastPromptDevice.textContent = safeText(prompt && prompt.deviceName, '未记录');
          elements.lastPromptStatus.textContent = safeText(stateLabel, '暂无');
          setCodeOutput(elements.lastPromptText, prompt && prompt.text, '暂无最近一次 prompt');
        }

        function renderLastError(error, updatedAt) {
          state.lastError = error || null;
          elements.errorCode.textContent = safeText(error && error.code, '暂无错误');
          elements.errorRecoverable.textContent =
            error === null || error === undefined
              ? '-'
              : error.recoverable
                ? '可重试'
                : '不可恢复';
          elements.errorRequestId.textContent = safeText(error && error.requestId, '-');
          elements.errorUpdatedAt.textContent = error ? safeText(updatedAt, '-') : '-';
          setCodeOutput(elements.errorMessage, error && error.message, '当前没有错误记录');
        }

        function buildCommandOutputText(run, errorMessage) {
          const parts = [];
          if (errorMessage) {
            parts.push('message\\n' + errorMessage);
          }
          if (run && String(run.stdout || '').trim()) {
            parts.push('stdout\\n' + String(run.stdout).trim());
          }
          if (run && String(run.stderr || '').trim()) {
            parts.push('stderr\\n' + String(run.stderr).trim());
          }
          return parts.join('\\n\\n');
        }

        function renderCommandRun(run, errorMessage) {
          state.lastCommandRun = run || null;
          if (elements.commandView instanceof HTMLDetailsElement) {
            elements.commandView.open = Boolean(
              state.commandPending || run || errorMessage,
            );
          }
          elements.serverCommandStatus.textContent = safeText(run && run.status, errorMessage ? 'failed' : 'idle');
          elements.serverCommandStartedAt.textContent = safeText(run && run.startedAt, '-');
          elements.serverCommandResult.textContent = run
            ? [
                formatDuration(run.durationMs),
                run.exitCode !== undefined ? 'exit=' + run.exitCode : '',
              ]
                .filter(Boolean)
                .join(' · ') || '-'
            : '-';
          elements.serverCommandDisplay.textContent = safeText(
            run && run.command,
            String(elements.serverCommandInput.value || '').trim() || '-',
          );
          setCodeOutput(
            elements.serverCommandOutput,
            buildCommandOutputText(run, errorMessage),
            '暂无诊断输出',
          );
        }

        function renderSelectedThreadSummary(run) {
          const group = getSelectedThreadGroup();
          if (!run) {
            elements.selectedThreadTitle.textContent = '还没有线程';
            elements.selectedThreadStatus.textContent = 'idle';
            elements.selectedThreadSession.textContent = '-';
            elements.selectedThreadTurns.textContent = '-';
            return;
          }

          elements.selectedThreadTitle.textContent = compactText(
            getRunPromptText(run),
            72,
          ) || '未记录 prompt';
          elements.selectedThreadStatus.textContent = safeText(run.status, 'idle');
          elements.selectedThreadSession.textContent = safeText(
            (group && group.threadSessionId) || run.codexSessionId || run.resumeSessionId,
            '-',
          );
          elements.selectedThreadTurns.textContent = safeText(
            group && Array.isArray(group.runs) ? group.runs.length : '-',
            '-',
          );
        }

        function renderThreadTranscript(group) {
          elements.threadTranscript.innerHTML = '';
          if (!group || !Array.isArray(group.runs) || group.runs.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'transcript-empty';
            emptyState.textContent = '当前线程还没有对话。发送后，这里会显示你和 Codex CLI 的完整往返记录。';
            elements.threadTranscript.appendChild(emptyState);
            return;
          }

          const orderedRuns = group.runs.slice().sort(compareRunsByStartedAt);
          orderedRuns.forEach((run) => {
            const userMessage = document.createElement('article');
            userMessage.className = 'transcript-message user';

            const userMeta = document.createElement('div');
            userMeta.className = 'transcript-meta';

            const userRole = document.createElement('span');
            userRole.className = 'transcript-role';
            userRole.textContent = '你';

            const userTime = document.createElement('span');
            userTime.className = 'transcript-time';
            userTime.textContent = formatDisplayTime(run.startedAt);

            const userBubble = document.createElement('div');
            userBubble.className = 'transcript-bubble';
            userBubble.textContent = getRunPromptText(run);

            userMeta.appendChild(userRole);
            if (userTime.textContent) {
              userMeta.appendChild(userTime);
            }
            userMessage.appendChild(userMeta);
            userMessage.appendChild(userBubble);

            const assistantMessage = document.createElement('article');
            assistantMessage.className =
              'transcript-message assistant ' + normalizeRunStatus(run.status);

            const assistantMeta = document.createElement('div');
            assistantMeta.className = 'transcript-meta';

            const assistantRole = document.createElement('span');
            assistantRole.className = 'transcript-role';
            assistantRole.textContent = 'Codex';

            const assistantStatus = document.createElement('span');
            assistantStatus.className =
              'status-badge' + getStatusBadgeClassName(run.status);
            assistantStatus.textContent = safeText(run.status, 'idle');

            const assistantTime = document.createElement('span');
            assistantTime.className = 'transcript-time';
            assistantTime.textContent = formatDisplayTime(
              run.finishedAt || run.startedAt,
            );

            const assistantBubble = document.createElement('div');
            assistantBubble.className = 'transcript-bubble code';

            const assistantOutput = document.createElement('pre');
            assistantOutput.className = 'transcript-output';
            assistantOutput.textContent = getRunFullOutput(run);

            assistantMeta.appendChild(assistantRole);
            assistantMeta.appendChild(assistantStatus);
            if (assistantTime.textContent) {
              assistantMeta.appendChild(assistantTime);
            }
            assistantMessage.appendChild(assistantMeta);
            assistantBubble.appendChild(assistantOutput);
            assistantMessage.appendChild(assistantBubble);

            elements.threadTranscript.appendChild(userMessage);
            elements.threadTranscript.appendChild(assistantMessage);
          });

          elements.threadTranscript.scrollTop = elements.threadTranscript.scrollHeight;
        }

        function formatRunResult(run) {
          if (!run) {
            return '-';
          }
          if (run.status === 'running') {
            return '执行中';
          }
          if (run.status === 'interrupted') {
            return '已中断';
          }
          if (run.status === 'failed') {
            return [run.failureCode || 'failed', run.exitCode !== undefined ? 'exit=' + run.exitCode : '']
              .filter(Boolean)
              .join(' · ');
          }
          return 'exit=' + safeText(run.exitCode, '0');
        }

        function getThreadKey(run) {
          if (!run) {
            return '';
          }
          return run.codexSessionId || run.resumeSessionId || 'request:' + run.requestId;
        }

        function getThreadGroups() {
          const runs = Array.isArray(state.cliRuns) ? state.cliRuns : [];
          const groups = [];
          const seen = new Set();
          for (const run of runs) {
            const key = getThreadKey(run);
            if (seen.has(key)) {
              const existing = groups.find((item) => item.key === key);
              if (existing) {
                existing.runs.push(run);
              }
              continue;
            }
            seen.add(key);
            groups.push({
              key,
              threadSessionId: run.codexSessionId || run.resumeSessionId || '',
              latestRun: run,
              runs: [run],
            });
          }
          return groups;
        }

        function getSelectedRun() {
          const groups = getThreadGroups();
          if (groups.length === 0) {
            return null;
          }
          const selectedFromRuns = Array.isArray(state.cliRuns)
            ? state.cliRuns.find((item) => item.requestId === state.selectedRunRequestId)
            : null;
          if (selectedFromRuns) {
            return selectedFromRuns;
          }
          return groups[0].latestRun;
        }

        function getSelectedThreadGroup() {
          const selectedRun = getSelectedRun();
          if (!selectedRun) {
            return null;
          }
          const key = getThreadKey(selectedRun);
          return getThreadGroups().find((item) => item.key === key) || null;
        }

        function getSelectedResumeSessionId() {
          const group = getSelectedThreadGroup();
          return group && group.threadSessionId ? group.threadSessionId : '';
        }

        function renderComposerTarget() {
          const group = getSelectedThreadGroup();
          const resumeSessionId = getSelectedResumeSessionId();
          const canResume = Boolean(resumeSessionId);
          const effectiveComposeMode = getEffectiveComposeMode();
          const threadCount = getThreadGroups().length;
          elements.newThreadButton.classList.toggle('active', effectiveComposeMode === 'new');
          elements.continueThreadButton.classList.toggle('active', effectiveComposeMode === 'resume');
          elements.continueThreadButton.disabled =
            !canResume || state.sendPending || state.commandPending;
          elements.newThreadButton.disabled =
            state.sendPending || state.commandPending;

          if (effectiveComposeMode === 'resume' && canResume) {
            elements.composeTargetText.textContent = '将继续当前线程：' + resumeSessionId;
            elements.composeTargetMeta.textContent =
              '默认就是续聊模式。切换左侧线程后，发送会直接继续它。';
            if (!state.sendPending) {
              elements.sendButton.textContent = '发送到当前线程';
              elements.sendButton.dataset.originalText = '发送到当前线程';
            }
          } else {
            elements.composeTargetText.textContent =
              threadCount > 0
                ? '将新开一个线程，不影响当前 tab'
                : '当前还没有线程，会创建第一个线程';
            elements.composeTargetMeta.textContent = group
              ? '这次会单独新开线程。发出后会自动回到默认续聊模式。'
              : '还没有线程。第一次发送后，后续默认都会继续当前线程。';
            if (!state.sendPending) {
              elements.sendButton.textContent = '发送到新线程';
              elements.sendButton.dataset.originalText = '发送到新线程';
            }
          }
        }

        function renderThreadTabs() {
          const groups = getThreadGroups();
          const runningCount = groups.filter((item) => item.latestRun.status === 'running').length;
          elements.threadTabsSummary.textContent =
            groups.length === 0
              ? '暂无线程'
              : runningCount > 0
                ? '运行中 ' + runningCount + ' / 共 ' + groups.length + ' 个线程'
                : '共 ' + groups.length + ' 个线程';
          elements.threadTabs.innerHTML = '';
          if (groups.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'thread-tab-empty';
            empty.textContent = '还没有 Codex 线程。登录后发送 prompt，这里会生成可切换的线程 tabs。';
            elements.threadTabs.appendChild(empty);
            return;
          }
          groups.forEach((group) => {
            const run = group.latestRun;
            const button = document.createElement('button');
            button.type = 'button';
            button.className =
              'thread-tab' +
              (getThreadKey(run) === getThreadKey(getSelectedRun()) ? ' active' : '');
            button.dataset.runId = run.requestId;
            const head = document.createElement('div');
            head.className = 'thread-tab-head';
            const badge = document.createElement('span');
            badge.className = 'status-badge' + getStatusBadgeClassName(run.status);
            badge.textContent = String(run.status || 'idle');
            const label = document.createElement('span');
            label.className = 'label';
            label.textContent = run.codexSessionId ? 'SID ' + run.codexSessionId : run.requestId.slice(0, 8);
            head.appendChild(badge);
            head.appendChild(label);

            const title = document.createElement('div');
            title.className = 'thread-tab-title';
            title.textContent = run.promptPreview || run.promptText || '未记录 prompt';

            const subtitle = document.createElement('div');
            subtitle.className = 'thread-tab-subtitle';
            const assistantPreview = getRunAssistantPreview(run);
            subtitle.textContent = [
              assistantPreview,
              group.runs.length > 1 ? '交互 ' + group.runs.length + ' 次' : '首轮',
              group.threadSessionId ? 'SID ' + group.threadSessionId : '',
            ]
              .filter(Boolean)
              .join(' · ');

            button.appendChild(head);
            button.appendChild(title);
            button.appendChild(subtitle);
            elements.threadTabs.appendChild(button);
          });
        }

        function renderSelectedRun(run) {
          renderSelectedThreadSummary(run);
          renderCliRun(run);
        }

        function syncSelectedRun() {
          const selectedRun = getSelectedRun();
          if (!selectedRun) {
            state.selectedRunRequestId = '';
          } else {
            state.selectedRunRequestId = selectedRun.requestId;
          }
          renderThreadTabs();
          renderComposerTarget();
          renderSelectedRun(selectedRun);
        }

        function upsertCliRun(run) {
          if (!run) {
            syncSelectedRun();
            return;
          }
          const existingRuns = Array.isArray(state.cliRuns) ? state.cliRuns : [];
          const nextRuns = [run].concat(existingRuns.filter((item) => item.requestId !== run.requestId));
          state.cliRuns = nextRuns;
          if (
            !state.selectedRunRequestId ||
            run.status === 'running' ||
            state.selectedRunRequestId === run.requestId
          ) {
            state.selectedRunRequestId = run.requestId;
          }
          syncSelectedRun();
        }

        function replaceCliRuns(runs) {
          const nextRuns = Array.isArray(runs) ? runs.slice() : [];
          state.cliRuns = nextRuns;
          if (
            !state.selectedRunRequestId ||
            !nextRuns.some((item) => item.requestId === state.selectedRunRequestId)
          ) {
            state.selectedRunRequestId = nextRuns[0] ? nextRuns[0].requestId : '';
          }
          syncSelectedRun();
        }

        function syncActionState() {
          const hasLastPrompt = Boolean(state.lastPrompt && String(state.lastPrompt.text || '').trim());
          const hasDraft = Boolean(String(elements.promptInput.value || '').trim());
          const hasCommand = Boolean(String(elements.serverCommandInput.value || '').trim());
          const selectedRun = getSelectedRun();
          const canInterrupt =
            Boolean(state.authToken) &&
            Boolean(selectedRun) &&
            selectedRun.status === 'running' &&
            !state.sendPending &&
            !state.commandPending &&
            !state.authChecking;

          elements.loginButton.disabled = state.loginPending;
          elements.sendButton.disabled =
            state.sendPending ||
            state.commandPending ||
            !hasDraft ||
            !state.authToken ||
            state.authChecking;
          elements.promptInput.disabled =
            state.sendPending || state.commandPending || state.authChecking;
          elements.reusePromptButton.disabled = !hasLastPrompt || state.sendPending;
          elements.copyLastPromptButton.disabled = !hasLastPrompt;
          elements.clearPromptButton.disabled = !hasDraft || state.sendPending;
          elements.refreshButton.disabled =
            state.sendPending || state.loginPending || state.commandPending;
          elements.interruptRunButton.disabled = !canInterrupt;
          elements.serverCommandInput.disabled =
            state.commandPending || state.sendPending || state.authChecking;
          elements.runServerCommandButton.disabled =
            state.commandPending ||
            state.sendPending ||
            !hasCommand ||
            !state.authToken ||
            state.authChecking;
          quickCommandButtons.forEach((button) => {
            if (button instanceof HTMLButtonElement) {
              button.disabled =
                state.commandPending ||
                state.sendPending ||
                !state.authToken ||
                state.authChecking;
            }
          });
          renderComposerTarget();
        }

        function updatePinState() {
          const normalized = sanitizePin(elements.pinInput.value);
          if (normalized !== elements.pinInput.value) {
            elements.pinInput.value = normalized;
          }
          renderPinProgress(normalized);
          if (normalized.length === 0) {
            elements.pinHint.textContent = '请输入 ' + pinLength + ' 位 PIN';
          } else if (normalized.length < pinLength) {
            elements.pinHint.textContent = '已输入 ' + normalized.length + '/' + pinLength + ' 位';
          } else {
            elements.pinHint.textContent = 'PIN 完整，准备登录';
          }
          syncActionState();
        }

        function renderCliRun(run) {
          const selectedGroup = getSelectedThreadGroup();
          if (!run) {
            state.latestCliRun = null;
            updateCliBadge('idle');
            elements.runEmptyView.classList.remove('hidden');
            elements.runInspectorView.classList.add('hidden');
            applyStatusBadge(elements.runStatusBadgeInline, 'idle');
            elements.runThreadSession.textContent = '-';
            elements.runThreadTurns.textContent = '-';
            elements.runRequestId.textContent = '-';
            elements.runStatusText.textContent = 'idle';
            elements.runStartedAt.textContent = '-';
            elements.runFinishedAt.textContent = '-';
            elements.runDuration.textContent = '-';
            elements.runResult.textContent = '-';
            elements.cliSummary.textContent = '暂无 CLI 运行记录';
            elements.cliRuntime.textContent = '暂无';
            elements.cliConfiguredArgs.textContent = '暂无';
            elements.cliResolvedArgs.textContent = '暂无';
            renderList(elements.changedFilesList, [], '暂未从输出中识别到文件');
            renderList(elements.gitFilesList, [], '暂未识别到运行前后差异');
            setCodeOutput(elements.stdoutText, '', '暂无 stdout');
            setCodeOutput(elements.stderrText, '', '暂无 stderr');
            renderThreadTranscript(null);
            syncActionState();
            return;
          }

          state.latestCliRun = run;
          updateCliBadge(run.status);
          elements.runEmptyView.classList.add('hidden');
          elements.runInspectorView.classList.remove('hidden');
          applyStatusBadge(elements.runStatusBadgeInline, run.status);
          elements.runThreadSession.textContent = safeText(
            (selectedGroup && selectedGroup.threadSessionId) ||
              run.codexSessionId ||
              run.resumeSessionId,
            '-',
          );
          elements.runThreadTurns.textContent = safeText(
            selectedGroup && Array.isArray(selectedGroup.runs)
              ? selectedGroup.runs.length
              : '-',
            '-',
          );
          elements.runRequestId.textContent = safeText(run.requestId, '-');
          elements.runStatusText.textContent = safeText(run.status, 'idle');
          elements.runStartedAt.textContent = safeText(run.startedAt, '-');
          elements.runFinishedAt.textContent = safeText(run.finishedAt, '-');
          elements.runDuration.textContent = formatDuration(run.durationMs);
          elements.runResult.textContent = formatRunResult(run);

          elements.cliSummary.textContent = [
            'requestId: ' + safeText(run.requestId, '-'),
            'prompt: ' + safeText(run.promptPreview || run.promptText, '-'),
            'resumeSessionId: ' + safeText(run.resumeSessionId, '-'),
            'command: ' + safeText(run.commandLine, '-'),
            'executable: ' + safeText(run.executable, '-'),
            'mode: ' + safeText(run.promptMode, '-'),
            'timeout: ' + safeText(run.timeoutMs, '-') + 'ms',
            'startedAt: ' + safeText(run.startedAt, '-'),
            'finishedAt: ' + safeText(run.finishedAt, '-'),
            'duration: ' + formatDuration(run.durationMs),
            'exitCode: ' + safeText(run.exitCode, '-'),
            'failureCode: ' + safeText(run.failureCode, '-'),
            'failureMessage: ' + safeText(run.failureMessage, '-'),
          ].join('\\n');

          elements.cliRuntime.textContent = [
            'model: ' + safeText(run.model, '-'),
            'provider: ' + safeText(run.provider, '-'),
            'approval: ' + safeText(run.approval, '-'),
            'sandbox: ' + safeText(run.sandbox, '-'),
            'reasoningEffort: ' + safeText(run.reasoningEffort, '-'),
            'reasoningSummaries: ' + safeText(run.reasoningSummaries, '-'),
            'codexSessionId: ' + safeText(run.codexSessionId, '-'),
            'workingDirectory: ' + safeText(run.workingDirectory, '-'),
            'outputWorkdir: ' + safeText(run.outputWorkdir, '-'),
          ].join('\\n');

          elements.cliConfiguredArgs.textContent = formatListValue(run.configuredArgs, '暂无');
          elements.cliResolvedArgs.textContent = formatListValue(
            run.resolvedArgs && run.resolvedArgs.length > 0 ? run.resolvedArgs : run.configuredArgs,
            '暂无',
          );

          renderList(elements.changedFilesList, run.changedFiles, '暂未从输出中识别到文件');
          renderList(elements.gitFilesList, run.gitChangedFiles, '暂未识别到运行前后差异');
          setCodeOutput(elements.stdoutText, run.stdout, '暂无 stdout');
          setCodeOutput(elements.stderrText, run.stderr, '暂无 stderr');
          renderThreadTranscript(selectedGroup);
          syncActionState();
        }

        function handleState(payload) {
          setStatus(payload.detail || payload.state);
          updateStatePill(payload.state, payload.authenticated);
          setAuthStatus(Boolean(payload.authenticated), payload.authExpiresAt);
          if (payload.lastPromptPreview !== undefined) {
            elements.lastText.textContent = payload.lastPromptPreview || '暂无';
          }
          renderLastPrompt(payload.lastPrompt || null, payload.detail || payload.state);
          renderLastError(payload.lastError || null, payload.updatedAt);
          if (payload.sessionExpiresAt) {
            elements.expiryText.textContent = payload.sessionExpiresAt;
            elements.sessionExpiryPanel.textContent = payload.sessionExpiresAt;
          }
          replaceCliRuns(payload.recentCliRuns || (payload.lastCliRun ? [payload.lastCliRun] : []));
          if (elements.advancedDetails instanceof HTMLDetailsElement) {
            elements.advancedDetails.open = Boolean(
              payload.lastError || !payload.authenticated,
            );
          }
          if (!payload.authenticated) {
            setAuthed(false);
          }
          syncActionState();
        }

        async function requestJson(url, options, customTimeoutMs) {
          const controller = new AbortController();
          const timeout = customTimeoutMs !== undefined ? customTimeoutMs : requestTimeoutMs;
          const timeoutId = timeout > 0 ? window.setTimeout(() => controller.abort(), timeout) : null;
          try {
            const response = await fetch(url, {
              ...options,
              signal: controller.signal,
            });
            const text = await response.text();
            let payload;
            try {
              payload = text ? JSON.parse(text) : {};
            } catch {
              return {
                type: 'error',
                code: 'MOBILE_CONNECTION_FAILED',
                message: '服务返回了无法解析的响应，请稍后重试。',
                recoverable: true,
              };
            }
            if (!response.ok && payload.type !== 'error') {
              return {
                type: 'error',
                code: 'MOBILE_CONNECTION_FAILED',
                message: '请求失败，服务状态异常。',
                recoverable: true,
              };
            }
            return payload;
          } catch (error) {
            return {
              type: 'error',
              code: 'MOBILE_CONNECTION_FAILED',
              message: normalizeClientError(error),
              recoverable: true,
            };
          } finally {
            if (timeoutId) {
              window.clearTimeout(timeoutId);
            }
          }
        }

        async function sendMessage(body, timeoutMs) {
          return requestJson(
            '/api/mobile',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(body),
            },
            timeoutMs,
          );
        }

        function connectSocket() {
          if (!state.authToken) {
            return;
          }
          if (
            state.socket &&
            (state.socket.readyState === WebSocket.CONNECTING ||
              state.socket.readyState === WebSocket.OPEN)
          ) {
            return;
          }
          clearReconnectTimer();
          const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
          const nextSocket = new WebSocket(protocol + '://' + window.location.host + '/ws');
          state.socket = nextSocket;

          nextSocket.addEventListener('open', () => {
            state.reconnectAttempts = 0;
            setSocketIndicator(false, '实时连接已建立，正在认证...');
            nextSocket.send(
              JSON.stringify({
                type: 'authorize',
                sessionId,
                authToken: state.authToken,
              }),
            );
          });

        nextSocket.addEventListener('message', (event) => {
          try {
            const payload = JSON.parse(event.data);
            setSocketIndicator(true, '已连接到服务器（实时）');
            if (payload.type === 'state_update') {
              const hadAuthToken = Boolean(state.authToken);
              handleState(payload);
              if (hadAuthToken && !payload.authenticated) {
                resetToLoginState('登录态已失效，请重新输入 PIN');
              }
              return;
            }
            if (payload.type === 'submit_ok') {
              if (payload.cliRun) {
                upsertCliRun(payload.cliRun);
                }
                setStatus('已提交，等待 CLI 执行完成');
                return;
              }
            if (payload.type === 'submit_failed') {
              setStatus(payload.message || '操作失败');
              if (payload.code === 'UNAUTHORIZED') {
                resetToLoginState(payload.message || '登录态已失效，请重新输入 PIN');
              }
              if (payload.cliRun) {
                upsertCliRun(payload.cliRun);
              }
              return;
            }
            if (payload.type === 'error') {
              if (payload.code === 'UNAUTHORIZED') {
                resetToLoginState(payload.message || '登录态已失效，请重新输入 PIN');
                renderLastError(payload, new Date().toISOString());
                return;
              }
              setStatus(payload.message || '操作失败');
            }
          } catch (error) {
            console.warn('无法解析 WebSocket 消息', error);
            }
          });

          nextSocket.addEventListener('close', (event) => {
            if (state.socket === nextSocket) {
              state.socket = undefined;
          }
          setSocketIndicator(false, '实时连接已断开');
          if (event.reason === 'expired' || event.reason === 'unauthorized') {
            resetToLoginState('登录态已失效，请重新输入 PIN');
            return;
          }
            if (!state.allowReconnect || !state.authToken) {
              setStatus('与桌面端的实时连接已断开，可手动点击检查状态刷新');
              return;
            }
            scheduleReconnect();
          });

          nextSocket.addEventListener('error', () => {
            setSocketIndicator(false, '实时连接异常，准备重连');
          });
        }

        async function refreshState() {
          const hadAuthToken = Boolean(state.authToken);
          const wasAuthChecking = state.authChecking;
          const headers = {};
          if (state.authToken) {
            headers.Authorization = 'Bearer ' + state.authToken;
          }
          const payload = await requestJson(
            '/api/session/' + encodeURIComponent(sessionId) + '/state',
            {
              method: 'GET',
              headers,
            },
            requestTimeoutMs,
          );
          if (payload.type === 'state_update') {
            setAuthChecking(false);
            handleState(payload);
            if (hadAuthToken && !payload.authenticated) {
              resetToLoginState('登录态已失效，请重新输入 PIN');
              return;
            }
            const authenticated = hadAuthToken && Boolean(payload.authenticated);
            setAuthed(authenticated);
            if (authenticated) {
              state.allowReconnect = true;
              connectSocket();
            }
            syncActionState();
            return;
          }
          setAuthChecking(false);
          if (payload.code === 'UNAUTHORIZED') {
            resetToLoginState(payload.message || '登录态已失效，请重新输入 PIN');
            renderLastError(payload, new Date().toISOString());
            return;
          }
          if (wasAuthChecking) {
            setAuthStatus(false);
            updateStatePill(initialState.state, false);
            setAuthed(false);
          }
          renderLastError(payload, new Date().toISOString());
          setStatus(payload.message || '状态获取失败');
        }

        async function copyText(text, button) {
          const value = String(text || '').trim();
          if (!value || value.startsWith('暂无')) {
            setStatus('当前没有可复制的内容');
            return;
          }
          try {
            await navigator.clipboard.writeText(value);
            setBusy(button, true, '已复制');
            window.setTimeout(() => setBusy(button, false, '已复制'), 700);
          } catch {
            setStatus('复制失败，请手动长按文本复制');
          }
        }

        async function attemptLogin() {
          const pin = sanitizePin(elements.pinInput.value);
          if (pin.length !== pinLength || state.loginPending) {
            if (pin.length !== pinLength) {
              setStatus('请输入完整的 ' + pinLength + ' 位 PIN');
            }
            return;
          }

          state.loginPending = true;
          setBusy(elements.loginButton, true, '登录中...');
          syncActionState();
          setStatus('正在登录...');

          try {
            const payload = await sendMessage(
              {
                type: 'login',
                requestId: nextRequestId(),
                sessionId,
                pin,
              },
              requestTimeoutMs,
            );
            if (payload.type === 'login_ok') {
              setAuthToken(payload.authToken);
              state.allowReconnect = true;
              setAuthChecking(false);
              setAuthed(true);
              setAuthStatus(true, payload.expiresAt);
              updateStatePill(payload.state, true);
              setStatus('登录成功，已进入发送页面');
              connectSocket();
              await refreshState();
              elements.promptInput.focus();
              return;
            }
            if (payload.type === 'login_failed' || payload.type === 'error') {
              renderLastError(
                {
                  code: payload.code,
                  message: payload.message,
                  recoverable: payload.type === 'error' ? payload.recoverable : true,
                  requestId: payload.requestId,
                },
                new Date().toISOString(),
              );
            }
            setStatus(payload.message || '登录失败');
            elements.pinInput.focus();
            elements.pinInput.select();
          } finally {
            state.loginPending = false;
            setBusy(elements.loginButton, false, '登录中...');
            syncActionState();
          }
        }

        async function attemptSubmitPrompt() {
          const text = String(elements.promptInput.value || '').trim();
          if (!text) {
            setStatus('请输入要发送的 prompt');
            syncActionState();
            return;
          }
          if (!state.authToken) {
            resetToLoginState('登录态已失效，请重新登录');
            return;
          }
          if (state.sendPending) {
            return;
          }

          state.sendPending = true;
          setBusy(elements.sendButton, true, '发送中...');
          syncActionState();
          const resumeSessionId =
            getEffectiveComposeMode() === 'resume' ? getSelectedResumeSessionId() : '';
          setStatus(resumeSessionId ? '正在继续当前 Codex 线程...' : '正在创建新 Codex 线程...');
          elements.lastText.textContent = text;
          const requestId = nextRequestId();
          renderLastPrompt(
            {
              requestId,
              text,
              receivedAt: new Date().toISOString(),
            },
            '正在发送',
          );

          try {
            const payload = await sendMessage(
              {
                type: 'submit_prompt',
                requestId,
                sessionId,
                authToken: state.authToken,
                text,
                resumeSessionId: resumeSessionId || undefined,
              },
              submitTimeoutMs,
            );
            if (payload.type === 'submit_ok') {
              if (payload.cliRun) {
                upsertCliRun(payload.cliRun);
              }
              state.composeMode = 'auto';
              elements.promptInput.value = '';
              persistDraft();
              syncActionState();
              setStatus(resumeSessionId ? '已续接线程，等待 CLI 执行完成' : '已创建新线程，等待 CLI 执行完成');
              return;
            }
            if (payload.code === 'UNAUTHORIZED') {
              resetToLoginState(payload.message || '登录态已失效，请重新输入 PIN');
            }
            if (payload.cliRun) {
              upsertCliRun(payload.cliRun);
            }
            renderLastError(
              {
                code: payload.code,
                message: payload.message,
                recoverable: payload.recoverable,
                requestId: payload.requestId,
              },
              new Date().toISOString(),
            );
            setStatus(payload.message || '提交失败');
          } finally {
            state.sendPending = false;
            setBusy(elements.sendButton, false, '发送中...');
            syncActionState();
          }
        }

        async function attemptInterruptRun() {
          const selectedRun = getSelectedRun();
          if (!selectedRun || selectedRun.status !== 'running') {
            setStatus('当前选中的线程没有运行中的任务');
            syncActionState();
            return;
          }
          if (!state.authToken) {
            resetToLoginState('登录态已失效，请重新登录');
            return;
          }

          setBusy(elements.interruptRunButton, true, '中断中...');
          syncActionState();

          try {
            const payload = await sendMessage(
              {
                type: 'interrupt_run',
                requestId: nextRequestId(),
                sessionId,
                authToken: state.authToken,
                targetRequestId: selectedRun.requestId,
              },
              requestTimeoutMs,
            );
            if (payload.type === 'interrupt_ok') {
              setStatus(payload.detail || '已发送中断请求');
              return;
            }
            if (payload.code === 'UNAUTHORIZED') {
              resetToLoginState(payload.message || '登录态已失效，请重新输入 PIN');
            }
            renderLastError(
              {
                code: payload.code,
                message: payload.message,
                recoverable: payload.recoverable,
                requestId: payload.requestId,
              },
              new Date().toISOString(),
            );
            setStatus(payload.message || '中断失败');
          } finally {
            setBusy(elements.interruptRunButton, false, '中断中...');
            syncActionState();
          }
        }

        async function attemptRunServerCommand(commandOverride) {
          const command = String(commandOverride || elements.serverCommandInput.value || '').trim();
          if (!command) {
            setStatus('请输入要执行的诊断命令');
            syncActionState();
            return;
          }
          if (!state.authToken) {
            resetToLoginState('登录态已失效，请重新登录');
            return;
          }
          if (state.commandPending) {
            return;
          }

          const requestId = nextRequestId();
          const provisionalTokens = command.split(/\\s+/);
          elements.serverCommandInput.value = command;
          state.commandPending = true;
          setBusy(elements.runServerCommandButton, true, '执行中...');
          renderCommandRun(
            {
              requestId,
              command,
              executable: provisionalTokens[0] || command,
              args: provisionalTokens.slice(1),
              startedAt: new Date().toISOString(),
              status: 'running',
            },
            '等待服务器返回结果...',
          );
          syncActionState();
          setStatus('正在执行服务器诊断命令...');

          try {
            const payload = await sendMessage(
              {
                type: 'run_server_command',
                requestId,
                sessionId,
                authToken: state.authToken,
                command,
              },
              commandTimeoutMs,
            );
            if (payload.type === 'command_ok') {
              renderCommandRun(payload.commandRun);
              setStatus('诊断命令已完成');
              return;
            }
            if (payload.code === 'UNAUTHORIZED') {
              resetToLoginState(payload.message || '登录态已失效，请重新输入 PIN');
            }
            renderCommandRun(payload.commandRun || null, payload.message);
            renderLastError(
              {
                code: payload.code,
                message: payload.message,
                recoverable: payload.recoverable,
                requestId: payload.requestId,
              },
              new Date().toISOString(),
            );
            setStatus(payload.message || '诊断命令执行失败');
          } finally {
            state.commandPending = false;
            setBusy(elements.runServerCommandButton, false, '执行中...');
            syncActionState();
          }
        }

        elements.loginForm.addEventListener('submit', (event) => {
          event.preventDefault();
          void attemptLogin();
        });

        elements.pinInput.addEventListener('input', () => {
          updatePinState();
          if (sanitizePin(elements.pinInput.value).length === pinLength && !state.loginPending) {
            window.setTimeout(() => {
              if (!state.loginPending && sanitizePin(elements.pinInput.value).length === pinLength) {
                void attemptLogin();
              }
            }, 110);
          }
        });

        elements.pinInput.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void attemptLogin();
          }
        });

        elements.promptForm.addEventListener('submit', (event) => {
          event.preventDefault();
          void attemptSubmitPrompt();
        });

        elements.promptInput.addEventListener('input', () => {
          persistDraft();
          syncActionState();
        });

        elements.promptInput.addEventListener('keydown', (event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            void attemptSubmitPrompt();
          }
        });

        elements.interruptRunButton.addEventListener('click', () => {
          void attemptInterruptRun();
        });

        elements.serverCommandInput.addEventListener('input', () => {
          syncActionState();
        });

        elements.serverCommandInput.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void attemptRunServerCommand();
          }
        });

        elements.runServerCommandButton.addEventListener('click', () => {
          void attemptRunServerCommand();
        });

        quickCommandButtons.forEach((button) => {
          if (!(button instanceof HTMLButtonElement)) {
            return;
          }
          button.addEventListener('click', () => {
            const command = String(button.dataset.serverCommand || '').trim();
            if (!command) {
              return;
            }
            elements.serverCommandInput.value = command;
            syncActionState();
            void attemptRunServerCommand(command);
          });
        });

        elements.pingButton.addEventListener('click', async () => {
          setStatus('正在检查状态...');
          setBusy(elements.pingButton, true, '检查中...');
          try {
            const hadAuthToken = Boolean(state.authToken);
            const payload = await sendMessage(
              {
                type: 'ping',
                requestId: nextRequestId(),
                sessionId,
                authToken: state.authToken || undefined,
              },
              requestTimeoutMs,
            );
            if (payload.type === 'state_update') {
              handleState(payload);
              if (hadAuthToken && !payload.authenticated) {
                resetToLoginState('登录态已失效，请重新输入 PIN');
                return;
              }
              const authenticated = hadAuthToken && Boolean(payload.authenticated);
              setAuthed(authenticated);
              if (authenticated) {
                state.allowReconnect = true;
                connectSocket();
              }
              syncActionState();
              return;
            }
            if (payload.code === 'UNAUTHORIZED') {
              resetToLoginState(payload.message || '登录态已失效，请重新输入 PIN');
              renderLastError(payload, new Date().toISOString());
              return;
            }
            setStatus(payload.message || '状态检查失败');
          } finally {
            setBusy(elements.pingButton, false, '检查中...');
            syncActionState();
          }
        });

        elements.logoutButton.addEventListener('click', () => {
          resetToLoginState('已退出登录');
        });

        elements.refreshButton.addEventListener('click', async () => {
          setStatus('正在刷新状态...');
          setBusy(elements.refreshButton, true, '刷新中...');
          try {
            await refreshState();
          } finally {
            setBusy(elements.refreshButton, false, '刷新中...');
            syncActionState();
          }
        });

        elements.reusePromptButton.addEventListener('click', () => {
          if (!state.lastPrompt || !String(state.lastPrompt.text || '').trim()) {
            setStatus('当前没有最近一次 prompt 可复用');
            return;
          }
          elements.promptInput.value = state.lastPrompt.text;
          persistDraft();
          syncActionState();
          setStatus('已将最近一次 prompt 填回输入框');
          elements.promptInput.focus();
        });

        elements.copyLastPromptButton.addEventListener('click', () => {
          void copyText(state.lastPrompt && state.lastPrompt.text, elements.copyLastPromptButton);
        });

        elements.clearPromptButton.addEventListener('click', () => {
          elements.promptInput.value = '';
          persistDraft();
          syncActionState();
          setStatus('已清空当前草稿');
          elements.promptInput.focus();
        });

        elements.newThreadButton.addEventListener('click', () => {
          state.composeMode = 'new';
          syncActionState();
          setStatus('下一次发送会新开线程，发送完成后会自动回到默认续聊模式');
        });

        elements.continueThreadButton.addEventListener('click', () => {
          const resumeSessionId = getSelectedResumeSessionId();
          if (!resumeSessionId) {
            setStatus('当前选中的 tab 还没有可继续的 Codex session');
            return;
          }
          state.composeMode = 'auto';
          syncActionState();
          setStatus('后续发送将继续当前线程：' + resumeSessionId);
        });

        elements.copyStdoutButton.addEventListener('click', () => {
          void copyText(elements.stdoutText.textContent, elements.copyStdoutButton);
        });

        elements.copyStderrButton.addEventListener('click', () => {
          void copyText(elements.stderrText.textContent, elements.copyStderrButton);
        });

        elements.copyCliSummaryButton.addEventListener('click', () => {
          void copyText(elements.cliSummary.textContent, elements.copyCliSummaryButton);
        });

        elements.copyCliRuntimeButton.addEventListener('click', () => {
          void copyText(elements.cliRuntime.textContent, elements.copyCliRuntimeButton);
        });

        elements.copyServerCommandOutputButton.addEventListener('click', () => {
          void copyText(elements.serverCommandOutput.textContent, elements.copyServerCommandOutputButton);
        });

        document.addEventListener('click', (event) => {
          const target = event.target;
          if (!(target instanceof HTMLElement)) {
            return;
          }
          const tabButton = target.closest('[data-run-id]');
          if (tabButton instanceof HTMLElement && tabButton.dataset.runId) {
            state.selectedRunRequestId = tabButton.dataset.runId;
            state.composeMode = 'auto';
            syncSelectedRun();
            return;
          }
          const copyValue = target.dataset.copyValue;
          if (!copyValue) {
            return;
          }
          event.preventDefault();
          void copyText(copyValue, target);
        });

        elements.promptInput.value = window.localStorage.getItem(draftStorageKey) || '';
        renderLastPrompt(state.lastPrompt, initialState.detail || initialState.state);
        renderLastError(state.lastError, initialState.updatedAt);
        renderCommandRun(state.lastCommandRun);
        replaceCliRuns(state.cliRuns);
        updatePinState();
        if (state.authToken) {
          setAuthChecking(true);
        } else {
          setAuthStatus(false);
          updateStatePill(initialState.state, false);
        }
        elements.sessionExpiryPanel.textContent = initialState.sessionExpiresAt || elements.sessionExpiryPanel.textContent;

        if (!state.authToken) {
          setAuthed(false);
        }
        if (state.authToken) {
          state.allowReconnect = true;
        }
        void refreshState();

        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState !== 'visible') {
            return;
          }
          void refreshState();
          if (
            state.authToken &&
            (!state.socket ||
              state.socket.readyState === WebSocket.CLOSED ||
              state.socket.readyState === WebSocket.CLOSING)
          ) {
            state.allowReconnect = true;
            connectSocket();
          }
        });

        window.addEventListener('beforeunload', () => {
          closeSocket(true);
        });
      })();
    `;
}

/**
 * 生成手机端单页 HTML。页面先走 PIN 登录，成功后可发送 prompt 并查看运行详情。
 */
export function renderMobilePage(model: SessionPageModel): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#bb4e2f" />
    <title>${escapeHtml(model.title)}</title>
    <style>
${renderStyles()}
    </style>
  </head>
  <body>
${renderShell(model)}
    <script>
${renderClientScript(model)}
    </script>
  </body>
</html>`;
}
