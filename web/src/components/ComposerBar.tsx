import { FormEvent } from 'react';

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
    <div className="border-t border-white/10 bg-panelAlt/95 px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
      <form className="space-y-3" onSubmit={handleSubmit}>
        <textarea
          className="min-h-[5.75rem] max-h-[40dvh] w-full resize-none rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm leading-6 text-slate-100 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:opacity-50"
          disabled={!activeTerminal || busy}
          placeholder={
            !activeTerminal
              ? '先创建一个终端标签页'
              : !connected
              ? '终端正在重连，当前输入不会发送到 Codex CLI。'
              : activeTerminal
              ? '输入后发送到当前 Codex CLI。手机端建议用这里，而不是依赖终端原生键盘。'
              : ''
          }
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <button
            className="rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50"
            disabled={!inputReady || !value.trim()}
            type="submit"
          >
            Send
          </button>
          <button
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-slate-100 disabled:opacity-50"
            disabled={!inputReady}
            type="button"
            onClick={onInterrupt}
          >
            Ctrl+C
          </button>
          <button
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-slate-100 disabled:opacity-50"
            disabled={!activeTerminal || busy}
            type="button"
            onClick={onStop}
          >
            Stop
          </button>
          <button
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-slate-100 disabled:opacity-50"
            disabled={!activeTerminal || busy}
            type="button"
            onClick={onRestart}
          >
            Restart
          </button>
          <button
            className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm font-medium text-red-100 disabled:opacity-50"
            disabled={!activeTerminal || busy}
            type="button"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </form>
    </div>
  );
}
