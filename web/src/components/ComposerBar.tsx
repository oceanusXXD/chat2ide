import { FormEvent } from 'react';
import {
  Ban,
  type LucideIcon,
  RotateCw,
  SendHorizontal,
  Square,
  X,
} from 'lucide-react';

import { TerminalSummary } from '@shared/protocol';

interface ComposerBarProps {
  activeTerminal: TerminalSummary | null;
  busy: boolean;
  connected: boolean;
  value: string;
  onChange(value: string): void;
  onClose(): void;
  onInterrupt(): void;
  onRestart(): void;
  onSend(): void;
  onStop(): void;
}

export function ComposerBar({
  activeTerminal,
  busy,
  connected,
  value,
  onChange,
  onClose,
  onInterrupt,
  onRestart,
  onSend,
  onStop,
}: ComposerBarProps) {
  const inputReady = Boolean(activeTerminal) && !busy && connected;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSend();
  };

  return (
    <div className="border-t border-white/10 bg-panelAlt/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur sm:px-3 sm:pt-3 sm:pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <form className="space-y-2 sm:space-y-3" onSubmit={handleSubmit}>
        <textarea
          autoCapitalize="none"
          autoCorrect="off"
          className="min-h-[3rem] max-h-[24dvh] w-full resize-none rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 text-[13px] leading-5 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:opacity-50 sm:min-h-[5.75rem] sm:px-4 sm:py-3 sm:text-sm sm:leading-6"
          disabled={!activeTerminal || busy}
          enterKeyHint="send"
          placeholder={
            !activeTerminal
              ? '先新建一个 Codex 终端'
              : !connected
              ? '连接正在恢复，当前输入暂不会发送'
              : '输入命令或提示词，发送到当前 Codex CLI'
          }
          spellCheck={false}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />

        <div className="grid grid-cols-[minmax(0,1fr)_repeat(4,2.75rem)] gap-1.5 sm:grid-cols-5 sm:gap-2">
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-3 text-sm font-semibold text-slate-950 transition disabled:cursor-not-allowed disabled:opacity-50 sm:px-4"
            disabled={!inputReady || !value.trim()}
            type="submit"
          >
            <SendHorizontal aria-hidden className="h-4 w-4" />
            <span>发送</span>
          </button>
          <ControlButton
            label="Ctrl+C"
            disabled={!inputReady}
            icon={Ban}
            onClick={onInterrupt}
          />
          <ControlButton
            label="停止"
            disabled={!activeTerminal || busy}
            icon={Square}
            onClick={onStop}
          />
          <ControlButton
            label="重启"
            disabled={!activeTerminal || busy}
            icon={RotateCw}
            onClick={onRestart}
          />
          <ControlButton
            label="关闭"
            disabled={!activeTerminal || busy}
            icon={X}
            tone="danger"
            onClick={onClose}
          />
        </div>
      </form>
    </div>
  );
}

function ControlButton({
  disabled,
  icon: Icon,
  label,
  onClick,
  tone = 'default',
}: {
  disabled?: boolean;
  icon: LucideIcon;
  label: string;
  onClick(): void;
  tone?: 'default' | 'danger';
}) {
  const toneClass =
    tone === 'danger'
      ? 'border-danger/40 bg-danger/10 text-red-100'
      : 'border-white/10 bg-white/5 text-slate-100';

  return (
    <button
      aria-label={label}
      className={`inline-flex min-h-11 items-center justify-center rounded-lg border text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 sm:gap-1.5 sm:px-4 sm:text-sm ${toneClass}`}
      disabled={disabled}
      title={label}
      type="button"
      onClick={onClick}
    >
      <Icon aria-hidden className="h-4 w-4" />
      <span className="sr-only sm:not-sr-only">{label}</span>
    </button>
  );
}
