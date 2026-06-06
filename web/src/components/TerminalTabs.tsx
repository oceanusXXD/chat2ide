import { Plus } from 'lucide-react';

import { TerminalSummary } from '@shared/protocol';
import { formatCompactCount } from '@shared/terminalState';

interface TerminalTabsProps {
  terminals: TerminalSummary[];
  activeTerminalId: string | null;
  unreadById: Record<string, number>;
  onCreate(): void;
  onSelect(terminalId: string): void;
}

export function TerminalTabs({
  terminals,
  activeTerminalId,
  unreadById,
  onCreate,
  onSelect,
}: TerminalTabsProps) {
  return (
    <div className="shrink-0 border-b border-white/10 bg-panelAlt/80 px-2 py-2 sm:px-3">
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [-ms-overflow-style:none] sm:gap-2 sm:pb-1">
        {terminals.map((terminal) => {
          const active = terminal.id === activeTerminalId;
          return (
            <button
              aria-selected={active}
              key={terminal.id}
              className={`flex min-w-[8rem] max-w-[10.5rem] shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-left transition sm:min-w-[10rem] sm:gap-3 sm:px-4 ${
                active
                  ? 'border-accent bg-accent/15 text-white'
                  : 'border-white/10 bg-white/5 text-slate-300'
              }`}
              type="button"
              onClick={() => onSelect(terminal.id)}
            >
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  terminal.status === 'running'
                    ? 'bg-success'
                    : terminal.status === 'error'
                    ? 'bg-danger'
                    : terminal.status === 'starting'
                    ? 'bg-warning'
                    : 'bg-slate-500'
                }`}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium sm:text-base">
                  {terminal.name}
                </span>
                <span className="block truncate text-[11px] leading-4 text-slate-400 sm:text-xs">
                  {formatTerminalStatus(terminal.status)}
                </span>
              </span>
              {unreadById[terminal.id] ? (
                <span className="min-w-6 rounded bg-accent px-1.5 py-0.5 text-center text-[10px] font-semibold tabular-nums text-slate-950 sm:px-2 sm:text-xs">
                  {formatCompactCount(unreadById[terminal.id])}
                </span>
              ) : null}
            </button>
          );
        })}

        <button
          aria-label="新建终端"
          className="inline-flex min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-dashed border-accent/60 bg-accent/10 px-3 py-2 text-sm font-semibold text-accent transition hover:bg-accent/20 sm:px-4"
          type="button"
          onClick={onCreate}
        >
          <Plus aria-hidden className="h-4 w-4" />
          <span className="hidden sm:inline">新建</span>
        </button>
      </div>
    </div>
  );
}

function formatTerminalStatus(status: TerminalSummary['status']): string {
  switch (status) {
    case 'starting':
      return '启动中';
    case 'running':
      return '运行中';
    case 'stopped':
      return '已停止';
    case 'error':
      return '错误';
  }
}
